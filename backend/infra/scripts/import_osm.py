"""Pull real nearby places from OpenStreetMap into the Aas-Paas listing schema.

Uses the Overpass API, which needs no key, no account and no billing.
Data is ODbL-licensed: keep the "(c) OpenStreetMap contributors" attribution
that the map already shows.

    python import_osm.py --lat 12.9716 --lon 77.5946 --radius 3000

What OSM can and cannot give you (measured near central Bangalore, 3km):
  ATMs, pharmacies, cafes, restaurants  -> good coverage
  print/copy shops, PG-style stays      -> thin
  tiffin services and messes            -> absent entirely, no such tag
  opening hours                         -> present on only ~7% of places
  prices                                -> effectively never

So this bootstraps the mapped categories; tiffin, mess and every price still
have to be collected by a human. Entries whose hours could not be determined
are tagged "hours-unverified" so they are easy to find and fix.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import urllib.parse
import urllib.request
import uuid
from collections import Counter

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# OSM tag -> our category. Deliberately conservative: a chain restaurant is
# not a "mess", so eateries land in `other` rather than pretending otherwise.
TAG_CATEGORY = {
    ("amenity", "atm"): "atm",
    ("amenity", "bank"): "atm",
    ("shop", "copyshop"): "print_shop",
    ("shop", "printing"): "print_shop",
    ("shop", "stationery"): "print_shop",
    ("tourism", "guest_house"): "pg",
    ("tourism", "hostel"): "pg",
    ("amenity", "restaurant"): "food",
    ("amenity", "fast_food"): "food",
    ("amenity", "cafe"): "food",
    ("amenity", "food_court"): "food",
    ("shop", "bakery"): "food",
    ("amenity", "ice_cream"): "food",
    ("amenity", "bar"): "bar",
    ("amenity", "pub"): "bar",
    ("shop", "supermarket"): "grocery",
    ("shop", "convenience"): "grocery",
    ("shop", "greengrocer"): "grocery",
    ("amenity", "pharmacy"): "pharmacy",
    ("amenity", "hospital"): "medical",
    ("amenity", "clinic"): "medical",
    ("amenity", "doctors"): "medical",
    ("amenity", "dentist"): "medical",
    ("leisure", "fitness_centre"): "gym",
    ("shop", "hairdresser"): "salon",
    ("shop", "beauty"): "salon",
    ("shop", "laundry"): "laundry",
    ("shop", "dry_cleaning"): "laundry",
    ("highway", "bus_stop"): "transport",
    ("railway", "station"): "transport",
    ("amenity", "library"): "other",
    ("amenity", "cinema"): "other",
    ("amenity", "post_office"): "other",
    ("amenity", "fuel"): "other",
    ("shop", "books"): "other",
    ("shop", "mobile_phone"): "other",
}

DEFAULT_SELECTORS = [
    '["amenity"="atm"]', '["amenity"="bank"]',
    '["shop"="copyshop"]', '["shop"="printing"]', '["shop"="stationery"]',
    '["tourism"="guest_house"]', '["tourism"="hostel"]',
    '["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="cafe"]',
    '["amenity"="food_court"]', '["shop"="bakery"]', '["amenity"="ice_cream"]',
    '["amenity"="bar"]', '["amenity"="pub"]',
    '["shop"="supermarket"]', '["shop"="convenience"]', '["shop"="greengrocer"]',
    '["amenity"="pharmacy"]',
    '["amenity"="hospital"]', '["amenity"="clinic"]', '["amenity"="doctors"]',
    '["amenity"="dentist"]',
    '["leisure"="fitness_centre"]',
    '["shop"="hairdresser"]', '["shop"="beauty"]',
    '["shop"="laundry"]', '["shop"="dry_cleaning"]',
    '["highway"="bus_stop"]', '["railway"="station"]',
    '["amenity"="library"]', '["amenity"="cinema"]', '["amenity"="post_office"]',
    '["amenity"="fuel"]', '["shop"="books"]', '["shop"="mobile_phone"]',
]

EATERY_SELECTORS: list[str] = []  # eateries are part of the default set now

CATEGORY_ORDER = (
    "pg", "mess", "tiffin", "food", "bar", "grocery", "print_shop", "atm",
    "pharmacy", "medical", "gym", "salon", "laundry", "transport", "other",
)

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_OSM_DAY = {"mo": "mon", "tu": "tue", "we": "wed", "th": "thu", "fr": "fri", "sa": "sat", "su": "sun"}


def build_query(lat: float, lon: float, radius: int, selectors: list[str]) -> str:
    parts = []
    for sel in selectors:
        parts.append(f"  node{sel}(around:{radius},{lat},{lon});")
        parts.append(f"  way{sel}(around:{radius},{lat},{lon});")
    body = "\n".join(parts)
    return f"[out:json][timeout:90];\n(\n{body}\n);\nout center tags;"


def fetch(query: str) -> list[dict]:
    payload = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for url in OVERPASS_URLS:
        try:
            req = urllib.request.Request(
                url, data=payload, headers={"User-Agent": "aas-paas/1.0 (hackathon seed import)"}
            )
            with urllib.request.urlopen(req, timeout=120) as res:
                return json.load(res).get("elements", [])
        except Exception as exc:  # noqa: BLE001 - try the next mirror
            last_err = exc
            print(f"  {url} failed ({exc}); trying next mirror")
    raise SystemExit(f"All Overpass mirrors failed: {last_err}")


def parse_opening_hours(value: str | None) -> tuple[list[dict], bool]:
    """Best-effort OSM opening_hours -> our hours[]. Returns (hours, verified).

    Handles the common shapes ("24/7", "Mo-Sa 09:00-21:00", "Mo-Fr 09:00-18:00;
    Sa 10:00-14:00"). Anything more exotic is reported as unverified rather
    than guessed at, because an empty hours list means "always open" to the
    search code and a wrong guess shows a closed shop as open.
    """
    if not value:
        return [], False

    text = value.strip()
    if text in ("24/7", "Mo-Su 00:00-24:00"):
        return [], True  # empty == always open, per the listing schema

    hours: list[dict] = []
    ok = True
    for rule in text.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        m = re.match(
            r"^([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$",
            rule,
        )
        if not m:
            ok = False
            continue
        start, end, open_t, close_t = m.groups()
        s = _OSM_DAY.get(start.lower())
        if s is None:
            ok = False
            continue
        e = _OSM_DAY.get((end or start).lower())
        if e is None:
            ok = False
            continue
        i, j = DAYS.index(s), DAYS.index(e)
        span = DAYS[i : j + 1] if i <= j else DAYS[i:] + DAYS[: j + 1]
        for day in span:
            hours.append({"day": day, "open": open_t.zfill(5), "close": close_t.zfill(5)})

    if not hours:
        return [], False
    return hours, ok


def address_of(tags: dict) -> str:
    bits = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb") or tags.get("addr:neighbourhood"),
        tags.get("addr:city"),
    ]
    joined = ", ".join(b for b in bits if b)
    return joined or tags.get("addr:full") or ""


def haversine_km(a_lat, a_lon, b_lat, b_lon) -> float:
    R = 6371.0
    dlat, dlon = math.radians(b_lat - a_lat), math.radians(b_lon - a_lon)
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def to_listing(el: dict) -> dict | None:
    tags = el.get("tags") or {}
    name = (tags.get("name") or "").strip()
    if not name:
        return None  # an unnamed pin is useless in a list of places

    category = None
    for key, val in TAG_CATEGORY.items():
        if tags.get(key[0]) == key[1]:
            category = val
            break
    if category is None:
        return None

    # A bank only counts as an ATM if it actually has one.
    if tags.get("amenity") == "bank" and tags.get("atm") not in ("yes", "only"):
        return None

    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None or lon is None:
        return None

    hours, verified = parse_opening_hours(tags.get("opening_hours"))

    extra = [t for t in (tags.get("amenity"), tags.get("shop"), tags.get("tourism")) if t]
    listing_tags = [*dict.fromkeys(extra), "osm"]
    if not verified:
        listing_tags.append("hours-unverified")
    if tags.get("wheelchair") == "yes":
        listing_tags.append("wheelchair")

    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "category": category,
        "description": tags.get("description") or f"{name} — imported from OpenStreetMap.",
        "location": {"lat": round(float(lat), 6), "lon": round(float(lon), 6)},
        "address": address_of(tags),
        # OSM has no usable price data; a human fills these in.
        "price": None,
        "price_unit": None,
        "hours": hours,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "tags": listing_tags,
        "rating": None,
    }


def dedupe(listings: list[dict]) -> list[dict]:
    """Drop repeats of the same name within 100m (OSM often has node + way)."""
    kept: list[dict] = []
    for item in listings:
        clash = any(
            k["name"].lower() == item["name"].lower()
            and haversine_km(
                k["location"]["lat"], k["location"]["lon"],
                item["location"]["lat"], item["location"]["lon"],
            ) < 0.1
            for k in kept
        )
        if not clash:
            kept.append(item)
    return kept


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float, required=True, help="campus latitude")
    ap.add_argument("--lon", type=float, required=True, help="campus longitude")
    ap.add_argument("--radius", type=int, default=3000, help="metres (default 3000)")
    ap.add_argument("--out", default="../seed_data/listings.osm.json")
    ap.add_argument("--include-eateries", action="store_true",
                    help="also pull cafes/restaurants (hundreds of them; off by default)")
    ap.add_argument("--merge", metavar="FILE",
                    help="also keep every listing from FILE (e.g. your hand-collected ones)")
    args = ap.parse_args()

    selectors = DEFAULT_SELECTORS + (EATERY_SELECTORS if args.include_eateries else [])
    print(f"Querying Overpass around {args.lat},{args.lon} within {args.radius}m…")
    elements = fetch(build_query(args.lat, args.lon, args.radius, selectors))
    print(f"  {len(elements)} raw OSM elements")

    listings = [x for x in (to_listing(e) for e in elements) if x]
    listings = dedupe(listings)

    if args.merge:
        with open(args.merge) as fh:
            existing = json.load(fh)
        print(f"  merging {len(existing)} existing listings from {args.merge}")
        listings = existing + listings

    with open(args.out, "w") as fh:
        json.dump(listings, fh, indent=2)

    by_cat = Counter(x["category"] for x in listings)
    needs_hours = sum(1 for x in listings if "hours-unverified" in x["tags"])
    needs_price = sum(1 for x in listings if x["price"] is None)

    print(f"\nWrote {len(listings)} listings to {args.out}")
    print(f"{'category':12} {'count':>6}")
    for cat in CATEGORY_ORDER:
        print(f"{cat:12} {by_cat.get(cat, 0):>6}")

    print(f"\nStill needs a human:")
    print(f"  {needs_price:>4} listings have no price")
    print(f"  {needs_hours:>4} listings have unverified hours (tagged 'hours-unverified')")
    if by_cat.get("tiffin", 0) == 0 or by_cat.get("mess", 0) == 0:
        print("  tiffin/mess cannot come from OSM at all - collect these by hand")
    print("\nReview the file, then point seed_opensearch.py at it to index.")


if __name__ == "__main__":
    main()
