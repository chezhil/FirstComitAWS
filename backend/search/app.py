import json
import os

def lambda_handler(event, context):
    """
    Placeholder for the Search API.
    Person 3 will overwrite this with real OpenSearch logic using OPENSEARCH_ENDPOINT.
    """
    # The OPENSEARCH_ENDPOINT is injected by SAM template
    endpoint = os.environ.get("OPENSEARCH_ENDPOINT", "unknown")
    
    response_body = {
        "results": [
            {
                "id": "demo-1",
                "name": "Demo Tiffin Center",
                "category": "tiffin",
                "distance_km": 0.4,
                "price": 60,
                "price_unit": "per_meal",
                "is_open_now": True,
                "address": "Demo address",
                "location": {
                    "lat": 12.97,
                    "lon": 77.59
                },
                "phone": None,
                "tags": ["veg"],
                "rating": 4.2
            }
        ],
        "total": 1
    }
    
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" # Required for frontend CORS
        },
        "body": json.dumps(response_body)
    }
