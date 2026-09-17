Listing document (what's in OpenSearch / the seed data):
{
  "id": "string (uuid)",
  "name": "string",
  "category": "pg | mess | tiffin | print_shop | atm | other",
  "description": "string",
  "location": { "lat": number, "lon": number },
  "address": "string",
  "price": number | null,
  "price_unit": "per_meal | per_page | per_month | per_copy | null",
  "hours": [ { "day": "mon|tue|wed|thu|fri|sat|sun", "open": "HH:MM", "close": "HH:MM" } ],
  "phone": "string | null",
  "tags": ["string"],
  "rating": number | null
}
(empty "hours" array means 24x7 / unknown — treat as always open)

POST /parse   (Person 2 builds this)
  Request:  { "query": "any tiffin service open right now that's cheap" }
  Response: {
    "category": "pg | mess | tiffin | print_shop | atm | other | null",
    "radius_km": number,           // default 2 if user didn't mention distance
    "open_now": boolean,           // true if query implies "now" / "currently open"
    "sort_by": "cheapest | nearest | rating | null",
    "max_price": number | null,
    "keywords": ["string"]         // leftover descriptive terms for fuzzy text match
  }
  Note: /parse never returns lat/lon — it can't know the user's real position
  from text alone. The frontend supplies user_location separately to /search.

POST /search   (Person 3 builds this)
  Request:  {
    "category": "tiffin" | null,
    "radius_km": 2,
    "open_now": true,
    "sort_by": "cheapest",
    "max_price": 100,
    "keywords": ["cheap tiffin"],
    "user_location": { "lat": 12.9716, "lon": 77.5946 }   // required, from frontend
  }
  Response: {
    "results": [
      {
        "id": "string", "name": "string", "category": "tiffin",
        "distance_km": 0.4, "price": 60, "price_unit": "per_meal",
        "is_open_now": true, "address": "string",
        "location": { "lat": 12.97, "lon": 77.59 },
        "phone": "string | null", "tags": ["veg"], "rating": 4.2
      }
    ],
    "total": 1
  }

Frontend flow: user types a query -> POST /parse -> take the filters,
attach user_location (from browser geolocation, fallback to a campus
default constant) -> POST /search -> render list + map.
