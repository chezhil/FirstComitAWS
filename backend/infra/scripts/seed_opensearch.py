import json
import os
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, helpers
from requests_aws4auth import AWS4Auth

def main():
    endpoint = os.environ.get('OPENSEARCH_ENDPOINT')
    if not endpoint:
        print("Error: OPENSEARCH_ENDPOINT environment variable not set.")
        return
        
    # Standardize endpoint (remove https:// if present)
    host = endpoint.replace("https://", "").replace("http://", "").rstrip('/')
    
    # Setup auth
    region = os.environ.get('AWS_REGION', 'us-east-1')
    credentials = boto3.Session().get_credentials()
    
    auth = None
    if credentials and 'amazonaws.com' in host:
        auth = AWS4Auth(
            credentials.access_key,
            credentials.secret_key,
            region,
            'es',
            session_token=credentials.token
        )
    elif 'localhost' not in host and '127.0.0.1' not in host:
        print("Warning: Non-local endpoint but no AWS credentials found. Connections might fail.")
    
    client = OpenSearch(
        hosts=[{'host': host, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30
    )

    index_name = 'listings'

    # Fuzziness alone (edit-distance / typo correction) can't bridge different
    # words with the same meaning -- "photocopy" and "print shop" share no
    # characters, so a fuzzy multi_match never matches them. A synonym filter
    # normalizes related terms to one canonical token at both index and query
    # time, so "photocopy"/"xerox"/"printout" all resolve to "print" and
    # actually match a listing described as a "print shop".
    mapping = {
        "settings": {
            "analysis": {
                "filter": {
                    "campus_synonym_filter": {
                        "type": "synonym",
                        "synonyms": [
                            "printout, print out, printing, photocopy, photostat, xerox, copier, copiers, copying => print",
                            "pg, hostel, hostels, paying guest, accommodation, lodging => pg",
                            "atm, cash, cashpoint, cash point, withdraw, withdrawal => atm",
                            "tiffin, dabba, tiffins => tiffin",
                            "mess, canteen, dining, eatery => mess",
                            "pharmacy, chemist, medicine, drugstore, medicals => pharmacy",
                            "grocery, groceries, kirana, supermarket, provisions => grocery",
                            "salon, barber, haircut, parlour, parlor, beauty => salon",
                            "laundry, dhobi, washing, dry cleaning => laundry",
                            "gym, fitness, workout => gym",
                            "bar, pub, beer, brewery => bar",
                            "medical, clinic, doctor, doctors, hospital, dentist => medical",
                            "food, restaurant, cafe, bakery, eatery => food",
                        ],
                    }
                },
                "analyzer": {
                    "campus_synonym_analyzer": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "campus_synonym_filter"],
                    }
                },
            }
        },
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "name": {"type": "text", "analyzer": "campus_synonym_analyzer"},
                "category": {"type": "keyword"},
                "description": {"type": "text", "analyzer": "campus_synonym_analyzer"},
                "location": {"type": "geo_point"},
                "address": {"type": "text"},
                "price": {"type": "float"},
                "price_unit": {"type": "keyword"},
                "hours": {
                    "type": "nested",
                    "properties": {
                        "day": {"type": "keyword"},
                        "open": {"type": "keyword"},
                        "close": {"type": "keyword"}
                    }
                },
                "phone": {"type": "keyword"},
                "tags": {
                    "type": "keyword",
                    "fields": {
                        "text": {"type": "text", "analyzer": "campus_synonym_analyzer"}
                    },
                },
                "rating": {"type": "float"}
            }
        }
    }
    
    # Create index
    if client.indices.exists(index_name):
        print(f"Index {index_name} already exists. Deleting it to recreate...")
        client.indices.delete(index_name)
        
    client.indices.create(index_name, body=mapping)
    print(f"Created index: {index_name}")
    
    # Load data
    data_path = os.path.join(os.path.dirname(__file__), '..', 'seed_data', 'listings.json')
    with open(data_path, 'r') as f:
        listings = json.load(f)
        
    # Bulk index
    actions = [
        {
            "_index": index_name,
            "_id": listing["id"],
            "_source": listing
        }
        for listing in listings
    ]
    
    success, failed = helpers.bulk(client, actions)
    print(f"Successfully indexed {success} documents.")
    if failed:
        print(f"Failed to index {failed} documents.")

if __name__ == "__main__":
    main()
