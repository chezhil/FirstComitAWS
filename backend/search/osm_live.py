"""Fetch places from OpenStreetMap on demand, for areas not yet indexed.

The seed import only covers wherever it was pointed, so a search from any
other neighbourhood finds nothing. This lets the search Lambda fill a gap
itself: on a miss it asks Overpass for that area, indexes what comes back,
and answers from the index. OpenSearch effectively becomes a warm cache over
OSM rather than a fixed snapshot.

Overpass needs no key and no billing, but it is a shared free service -- so
this only runs on a miss, never on the hot path, and each area is fetched
once.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
import uuid

OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)

# Mirrors TAG_CATEGORY in backend/infra/scripts/import_osm.py. Duplicated
# rather than shared because SAM packages each function from its own CodeUri;
# keep the two in step when categories change.
TAG_CATEGORY = {
    ("amenity", "atm"): "atm", ("amenity", "bank"): "atm",
    ("shop", "copyshop"): "print_shop", ("shop", "printing"): "print_shop",
    ("shop", "stationery"): "print_shop",
    ("tourism", "guest_house"): "pg", ("tourism", "hostel"): "pg",
    ("amenity", "restaurant"): "food", ("amenity", "fast_food"): "food",
    ("amenity", "cafe"): "food", ("amenity", "food_court"): "food",
    ("shop", "bakery"): "food", ("amenity", "ice_cream"): "food",
    ("amenity", "bar"): "bar", ("amenity", "pub"): "bar",
    ("shop", "supermarket"): "grocery", ("shop", "convenience"): "grocery",
    ("shop", "greengrocer"): "grocery",
    ("amenity", "pharmacy"): "pharmacy",
    ("amenity", "hospital"): "medical", ("amenity", "clinic"): "medical",
    ("amenity", "doctors"): "medical", ("amenity", "dentist"): "medical",
    ("leisure", "fitness_centre"): "gym",
    ("shop", "hairdresser"): "salon", ("shop", "beauty"): "salon",
    ("shop", "laundry"): "laundry", ("shop", "dry_cleaning"): "laundry",
    ("highway", "bus_stop"): "transport", ("railway", "station"): "transport",
    ("amenity", "library"): "other", ("amenity", "cinema"): "other",
    ("amenity", "post_office"): "other", ("amenity", "fuel"): "other",
    ("shop", "books"): "other", ("shop", "mobile_phone"): "other",
}

NAME_OVERRIDES = (
    ("tiffin", re.compile(r"\b(tiffin|tiffins|darshini|darshana|dabba)\b", re.I)),
    ("mess", re.compile(r"\b(mess|canteen|bhojan|bhavan|military hotel|meals)\b", re.I)),
)

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_OSM_DAY = {"mo": "mon", "tu": "tue", "we": "wed", "th": "thu", "fr": "fri", "sa": "sat", "su": "sun"}

_SELECTORS = tuple(f'["{k}"="{v}"]' for k, v in dict.fromkeys(TAG_CATEGORY))


def _parse_hours(value):
    if not value:
        return [], False
    text = value.strip()
    if text in ("24/7", "Mo-Su 00:00-24:00"):
        return [], True
    hours, ok = [], True
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
        start, end, o, c = m.groups()
        s, e = _OSM_DAY.get(start.lower()), _OSM_DAY.get((end or start).lower())
        if s is None or e is None:
            ok = False
            continue
        i, j = DAYS.index(s), DAYS.index(e)
        span = DAYS[i : j + 1] if i <= j else DAYS[i:] + DAYS[: j + 1]
        for d in span:
            hours.append({"day": d, "open": o.zfill(5), "close": c.zfill(5)})
    return (hours, ok) if hours else ([], False)


def _to_listing(el):
    tags = el.get("tags") or {}
    name = (tags.get("name") or "").strip()
    if not name:
        return None

    category = None
    for (k, v), cat in TAG_CATEGORY.items():
        if tags.get(k) == v:
            category = cat
            break
    if category is None:
        return None
    if tags.get("amenity") == "bank" and tags.get("atm") not in ("yes", "only"):
        return None
    if category == "food":
        for target, pattern in NAME_OVERRIDES:
            if pattern.search(name):
                category = target
                break

    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None or lon is None:
        return None

    hours, verified = _parse_hours(tags.get("opening_hours"))
    extra = [t for t in (tags.get("amenity"), tags.get("shop"), tags.get("tourism")) if t]
    listing_tags = [*dict.fromkeys(extra), "osm"]
    if not verified:
        listing_tags.append("hours-unverified")

    addr = ", ".join(
        b for b in (
            tags.get("addr:housenumber"), tags.get("addr:street"),
            tags.get("addr:suburb") or tags.get("addr:neighbourhood"), tags.get("addr:city"),
        ) if b
    )

    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"osm:{el.get('type')}:{el.get('id')}")),
        "name": name,
        "category": category,
        "description": tags.get("description") or f"{name} — from OpenStreetMap.",
        "location": {"lat": round(float(lat), 6), "lon": round(float(lon), 6)},
        "address": addr,
        "price": None,
        "price_unit": None,
        "hours": hours,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "tags": listing_tags,
        "rating": None,
    }


def fetch_area(lat, lon, radius_m=3000, timeout=25):
    """Return listings near a point, or [] if Overpass is slow or unreachable.

    Never raises: a live-fetch failure must degrade to "no extra results",
    not break the search request that triggered it.
    """
    body = "\n".join(
        f"  node{s}(around:{radius_m},{lat},{lon});\n  way{s}(around:{radius_m},{lat},{lon});"
        for s in _SELECTORS
    )
    query = f"[out:json][timeout:{timeout}];\n(\n{body}\n);\nout center tags;"
    payload = urllib.parse.urlencode({"data": query}).encode()

    for url in OVERPASS_URLS:
        try:
            req = urllib.request.Request(
                url, data=payload, headers={"User-Agent": "aas-paas/1.0 (live area fetch)"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as res:
                elements = json.load(res).get("elements", [])
            break
        except Exception:  # noqa: BLE001 - try the next mirror, then give up
            elements = None
    if not elements:
        return []

    seen, out = set(), []
    for el in elements:
        item = _to_listing(el)
        if item and item["id"] not in seen:
            seen.add(item["id"])
            out.append(item)
    return out
