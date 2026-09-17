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
    
    mapping = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "name": {"type": "text"},
                "category": {"type": "keyword"},
                "description": {"type": "text"},
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
                "tags": {"type": "keyword"},
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
