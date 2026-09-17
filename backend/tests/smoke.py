"""Smoke test for the Aas-Paas backend that never calls a paid model API.

The Gemini free tier rate-limits quickly, and burning it on test runs means
the parser silently drops to the heuristic fallback -- including, potentially,
while you are recording the demo. So this exercises everything except the
model call:

  1. category detection, via the deterministic heuristic parser
  2. recorded /parse outputs (captured verbatim from gemini-3.6-flash)
     replayed straight into /search
  3. synonym search, which is the part plain fuzziness cannot do
  4. contract conformance of every /search response

Usage:
    OPENSEARCH_ENDPOINT=http://localhost:9200 python smoke.py

Without OPENSEARCH_ENDPOINT the search Lambda falls back to its built-in
mock listings, so the contract checks still run but the counts will be small.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures" / "parses.json"
HERE = 12.9716, 77.5946  # matches the seeded area

RESULT_KEYS = {
    "id", "name", "category", "distance_km", "price", "price_unit",
    "is_open_now", "address", "location", "phone", "tags", "rating",
}
FILTER_KEYS = {"category", "radius_km", "open_now", "sort_by", "max_price", "keywords"}


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    # pydantic resolves the parser's lazy annotations through sys.modules
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


os.environ.setdefault("PARSE_MODEL_PROVIDER", "fallback")  # never hit the API
parser = load("aaspaas_parser", ROOT / "parser" / "app.py")
search = load("aaspaas_search", ROOT / "search" / "app.py")


class Report:
    def __init__(self) -> None:
        self.passed = 0
        self.failures: list[str] = []

    def check(self, ok: bool, label: str, detail: str = "") -> None:
        if ok:
            self.passed += 1
        else:
            self.failures.append(f"{label}{(' - ' + detail) if detail else ''}")

    def section(self, title: str) -> None:
        print(f"\n{title}")

    def done(self) -> int:
        print(f"\n{'=' * 58}")
        if self.failures:
            print(f"FAILED  {len(self.failures)} of {self.passed + len(self.failures)} checks")
            for f in self.failures:
                print(f"  x {f}")
            return 1
        print(f"PASSED  all {self.passed} checks")
        return 0


def run_search(filters: dict) -> dict:
    event = {"body": json.dumps({**filters, "user_location": {"lat": HERE[0], "lon": HERE[1]}})}
    res = search.lambda_handler(event, None)
    assert res["statusCode"] == 200, res
    return json.loads(res["body"])


def main() -> int:
    data = json.loads(FIXTURES.read_text())
    r = Report()

    r.section("Category detection (heuristic, no API)")
    for case in data["category_expectations"]:
        got = parser.parse_query(case["query"])["category"]
        ok = got == case["category"]
        print(f"  {'ok' if ok else 'XX'}  {case['query']:42} -> {got}")
        r.check(ok, f"category for {case['query']!r}", f"expected {case['category']}, got {got}")

    r.section("Recorded Gemini parses replayed into search")
    for case in data["recorded"]:
        filters = case["filters"]
        r.check(set(filters) == FILTER_KEYS, f"filter shape for {case['query']!r}")
        body = run_search(filters)
        has_results = body["total"] > 0
        print(f"  {'ok' if has_results else '--'}  {case['query']:42} -> {body['total']} results")
        r.check("results" in body and "total" in body, f"response shape for {case['query']!r}")
        for item in body["results"][:5]:
            r.check(set(item) == RESULT_KEYS, f"result keys for {case['query']!r}",
                    f"unexpected {set(item) ^ RESULT_KEYS}")
            r.check(
                item["distance_km"] <= filters["radius_km"] + 0.01,
                f"radius respected for {case['query']!r}",
                f"{item['distance_km']}km > {filters['radius_km']}km",
            )
            if filters["max_price"] is not None and item["price"] is not None:
                r.check(item["price"] <= filters["max_price"], f"max_price for {case['query']!r}")
            if filters["category"]:
                r.check(item["category"] == filters["category"],
                        f"category filter for {case['query']!r}")

    r.section("Synonym search (what fuzziness alone cannot do)")
    for case in data["synonym_expectations"]:
        body = run_search({
            "category": None, "radius_km": 5, "open_now": False, "sort_by": "nearest",
            "max_price": None, "keywords": [case["keyword"]],
        })
        cats = {x["category"] for x in body["results"]}
        # Some places legitimately sit in a neighbouring category -- a tiffin
        # room OSM only knows as a restaurant still deserves to match "tifin".
        allowed = {case["category"], *case.get("allow_also", [])}
        ok = body["total"] > 0 and cats <= allowed
        print(f"  {'ok' if ok else 'XX'}  {case['keyword']:42} -> {body['total']} results {cats or ''}")
        r.check(ok, f"synonym {case['keyword']!r}", f"expected within {allowed}, got {cats}")

    r.section("Sorting")
    cheap = run_search({"category": None, "radius_km": 5, "open_now": False,
                        "sort_by": "cheapest", "max_price": None, "keywords": []})
    priced = [x["price"] for x in cheap["results"] if x["price"] is not None]
    r.check(priced == sorted(priced), "cheapest sort is ascending")
    near = run_search({"category": None, "radius_km": 5, "open_now": False,
                       "sort_by": "nearest", "max_price": None, "keywords": []})
    dists = [x["distance_km"] for x in near["results"]]
    r.check(dists == sorted(dists), "nearest sort is ascending")
    print(f"  ok  cheapest ascending ({len(priced)} priced), nearest ascending ({len(dists)})")

    return r.done()


if __name__ == "__main__":
    raise SystemExit(main())
