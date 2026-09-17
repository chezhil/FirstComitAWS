import json
import os
import math
from datetime import datetime, timezone, timedelta

try:
    from opensearchpy import OpenSearch, RequestsHttpConnection
except ImportError:
    OpenSearch = None

IST = timezone(timedelta(hours=5, minutes=30))

# Mirrors the "campus_synonym_filter" in backend/infra/scripts/seed_opensearch.py.
# Plain fuzziness (edit-distance) can't bridge "photocopy" <-> "print shop" --
# they share no characters -- so both the real OpenSearch query and this
# mock-data fallback normalize known synonyms to the same canonical word
# before matching.
_SYNONYMS = {
    "printout": "print", "print out": "print", "printing": "print",
    "photocopy": "print", "photostat": "print", "xerox": "print",
    "copier": "print", "copiers": "print", "copying": "print",
    "hostel": "pg", "hostels": "pg", "paying guest": "pg",
    "accommodation": "pg", "lodging": "pg",
    "cash": "atm", "cashpoint": "atm", "cash point": "atm",
    "withdraw": "atm", "withdrawal": "atm",
    "dabba": "tiffin", "tiffins": "tiffin",
    "canteen": "mess", "dining": "mess", "eatery": "mess",
}


def _normalize_keyword(word: str) -> str:
    return _SYNONYMS.get(word.lower().strip(), word.lower().strip())

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def is_currently_open(hours):
    if not hours:
        return True # Empty means 24x7
    
    now = datetime.now(IST)
    current_day = now.strftime('%a').lower()[:3] # 'mon', 'tue'
    current_time = now.strftime('%H:%M')
    
    for h in hours:
        if h.get('day') == current_day:
            open_time = h.get('open')
            close_time = h.get('close')
            if open_time <= current_time <= close_time:
                return True
            # Handle overnight hours (e.g., open 22:00, close 02:00)
            if close_time < open_time:
                if current_time >= open_time or current_time <= close_time:
                    return True
    return False

def get_mock_listings():
    return [
        {
            "id": "mock-1",
            "name": "Sharma Tiffin Service",
            "category": "tiffin",
            "description": "Cheap and best veg food",
            "location": {"lat": 12.9720, "lon": 77.5950},
            "address": "123 Main St",
            "price": 60,
            "price_unit": "per_meal",
            "hours": [],
            "phone": "9999999999",
            "tags": ["veg", "cheap tiffin"],
            "rating": 4.5
        },
        {
            "id": "mock-2",
            "name": "Campus Print & Xerox",
            "category": "print_shop",
            "description": "Color and B&W printouts",
            "location": {"lat": 12.9710, "lon": 77.5940},
            "address": "Opposite Gate 2",
            "price": 2,
            "price_unit": "per_page",
            "hours": [
                {"day": "mon", "open": "09:00", "close": "20:00"},
                {"day": "tue", "open": "09:00", "close": "20:00"},
                {"day": "wed", "open": "09:00", "close": "20:00"},
                {"day": "thu", "open": "09:00", "close": "20:00"},
                {"day": "fri", "open": "09:00", "close": "20:00"}
            ],
            "phone": None,
            "tags": ["xerox", "printout"],
            "rating": 4.0
        },
        {
            "id": "mock-3",
            "name": "Premium Boys PG",
            "category": "pg",
            "description": "AC rooms with wifi and food",
            "location": {"lat": 12.9900, "lon": 77.6000},
            "address": "Near College Main Gate",
            "price": 12000,
            "price_unit": "per_month",
            "hours": [],
            "phone": "8888888888",
            "tags": ["ac", "wifi", "hostel"],
            "rating": 3.8
        },
        {
            "id": "mock-4",
            "name": "Campus ATM",
            "category": "atm",
            "description": "24x7 Cash ATM",
            "location": {"lat": 12.9730, "lon": 77.5960},
            "address": "Inside Campus",
            "price": None,
            "price_unit": None,
            "hours": [],
            "phone": None,
            "tags": ["cash", "money"],
            "rating": None
        }
    ]

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
    except Exception:
        body = event # fallback for direct invoke
    
    category = body.get("category")
    radius_km = body.get("radius_km", 2)
    open_now = body.get("open_now", False)
    sort_by = body.get("sort_by")
    max_price = body.get("max_price")
    keywords = body.get("keywords", [])
    user_location = body.get("user_location", {"lat": 12.9716, "lon": 77.5946})
    
    endpoint = os.environ.get("OPENSEARCH_ENDPOINT")
    results = []
    
    if endpoint and OpenSearch:
        # Construct OpenSearch query
        client = OpenSearch(
            hosts=[endpoint],
            use_ssl=endpoint.startswith("https"),
            verify_certs=endpoint.startswith("https"),
            connection_class=RequestsHttpConnection
        )
        
        query = {
            "bool": {
                "filter": [
                    {
                        "geo_distance": {
                            "distance": f"{radius_km}km",
                            "location": {
                                "lat": user_location["lat"],
                                "lon": user_location["lon"]
                            }
                        }
                    }
                ],
                "must": []
            }
        }
        
        if category:
            query["bool"]["filter"].append({"term": {"category": category}})
        if max_price is not None:
            query["bool"]["filter"].append({"range": {"price": {"lte": max_price}}})
            
        if keywords:
            query["bool"]["must"].append({
                "multi_match": {
                    "query": " ".join(keywords),
                    "fields": ["name", "description", "tags.text"],
                    # AUTO's default low threshold (3) still lets very short
                    # canonical tokens like "atm" take 1 edit, which matches
                    # the common word "at" (insert one char) and pulls in
                    # unrelated mess/tiffin listings whose description
                    # happens to contain "at". Raising the threshold to 5
                    # keeps 1-edit typo tolerance for real words (tiffin,
                    # print, etc.) while leaving short tokens exact-only.
                    "fuzziness": "AUTO:5,8",
                    # Require the first 2 characters to match so fuzziness
                    # only fixes typos (tifin->tiffin) and doesn't drift onto
                    # an unrelated word that happens to be 1 edit away, e.g.
                    # "print" (from the photocopy->print synonym) fuzzy-
                    # matching "Point" in "Laundry Point" without this guard.
                    "prefix_length": 2
                }
            })
            
        try:
            response = client.search(
                body={"query": query, "size": 100},
                index="listings"
            )
            raw_docs = [hit["_source"] for hit in response["hits"]["hits"]]
        except Exception as e:
            print("OpenSearch error:", e)
            raw_docs = get_mock_listings()
    else:
        raw_docs = get_mock_listings()
        
    # Python-side processing
    processed_results = []
    for doc in raw_docs:
        # compute distance
        dist = haversine(
            user_location["lat"], user_location["lon"],
            doc["location"]["lat"], doc["location"]["lon"]
        )
        
        # apply radius filter for mock data (opensearch does this already, but mock needs it)
        if dist > radius_km:
            continue
            
        # apply mock filters
        if not endpoint or "mock" in doc.get("id", ""):
            if category and doc.get("category") != category:
                continue
            if max_price is not None and doc.get("price") is not None and doc["price"] > max_price:
                continue
            # basic keyword match for mock, synonym-normalized (see _SYNONYMS)
            if keywords:
                raw_text = (doc.get("name", "") + " " + doc.get("description", "") + " " + " ".join(doc.get("tags", []))).lower()
                doc_words = {_normalize_keyword(w) for w in raw_text.split()}
                query_words = {_normalize_keyword(k) for k in keywords}
                if not (query_words & doc_words) and not any(k.lower() in raw_text for k in keywords):
                    continue
        
        # open_now check
        is_open = is_currently_open(doc.get("hours", []))
        if open_now and not is_open:
            continue
            
        result_item = {
            "id": doc["id"],
            "name": doc["name"],
            "category": doc["category"],
            "distance_km": round(dist, 2),
            "price": doc.get("price"),
            "price_unit": doc.get("price_unit"),
            "is_open_now": is_open,
            "address": doc.get("address"),
            "location": doc.get("location"),
            "phone": doc.get("phone"),
            "tags": doc.get("tags", []),
            "rating": doc.get("rating")
        }
        processed_results.append(result_item)
        
    # Sorting
    if sort_by == "cheapest":
        processed_results.sort(key=lambda x: (x["price"] if x["price"] is not None else float('inf'), x["distance_km"]))
    elif sort_by == "rating":
        processed_results.sort(key=lambda x: (x["rating"] if x["rating"] is not None else -1, -x["distance_km"]), reverse=True)
    else: # nearest or null
        processed_results.sort(key=lambda x: x["distance_km"])
        
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({
            "results": processed_results,
            "total": len(processed_results)
        })
    }
