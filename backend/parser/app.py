import json

def lambda_handler(event, context):
    """
    Placeholder for the NL Query Parser API.
    Person 2 will overwrite this with the real Strands Agents SDK implementation.
    """
    response_body = {
        "category": "tiffin",
        "radius_km": 2,
        "open_now": True,
        "sort_by": "cheapest",
        "max_price": None,
        "keywords": ["tiffin"]
    }
    
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" # Required for frontend CORS
        },
        "body": json.dumps(response_body)
    }
