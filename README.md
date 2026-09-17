# Aas-Paas

Natural-language search for nearby campus essentials (PGs, mess/tiffin, print/xerox shops, ATMs), with "open now" / "cheapest" filters.
Built for the AWS "First Commit" hackathon (WeMakeDevs x AWS), Sept 17-20 2026.

## Running Locally

To run the APIs locally using AWS SAM, navigate to the `backend/infra` folder and start the local API Gateway:

```bash
cd backend/infra
sam local start-api
```

This will run `ParserFunction` on `POST http://127.0.0.1:3000/parse` and `SearchFunction` on `POST http://127.0.0.1:3000/search`. (Note: Initially, these endpoints use placeholder mock data so they are ready to test immediately).

## Deployment

To deploy the infrastructure (OpenSearch domain and API Gateway) to AWS, use SAM:

```bash
cd backend/infra
sam build
sam deploy --guided
```

Note the `OpenSearchEndpoint` and `ApiUrl` in the CloudFormation outputs.

## Seeding OpenSearch

Once the SAM application is deployed and the OpenSearch domain is running, you need to seed the data using the provided Python script.

```bash
cd backend/infra/scripts
pip install -r requirements.txt
export OPENSEARCH_ENDPOINT="<your-opensearch-endpoint-from-sam-outputs>"
python seed_opensearch.py
```
*Note: Make sure your AWS credentials are appropriately configured in your environment before running this script.*

## Development Contracts
See [CONTRACTS.md](./CONTRACTS.md) for the frozen JSON contracts between the components.
