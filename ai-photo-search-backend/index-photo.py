import boto3, json
from datetime import datetime
from opensearchpy import OpenSearch, RequestsHttpConnection

REGION = 'us-east-1'
ES_ENDPOINT = 'search-photos-azfne762fb2b4rveyny3gjbe3m.us-east-1.es.amazonaws.com'
ES_USER = 'CloudComputing'
ES_PASS = 'CloudComputing@123'

def get_es_client():
    return OpenSearch(
        hosts=[{'host': ES_ENDPOINT, 'port': 443}],
        http_auth=(ES_USER, ES_PASS),
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection
    )

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")
    s3 = boto3.client('s3')
    rekognition = boto3.client('rekognition', region_name=REGION)

    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    print(f"Processing: {bucket}/{key}")

    rek_response = rekognition.detect_labels(
        Image={'S3Object': {'Bucket': bucket, 'Name': key}},
        MaxLabels=10,
        MinConfidence=70
    )
    labels = [l['Name'].lower() for l in rek_response['Labels']]
    print(f"Labels: {labels}")

    try:
        head = s3.head_object(Bucket=bucket, Key=key)
        custom = head.get('Metadata', {}).get('customlabels', '')
        if custom:
            labels += [l.strip().lower() for l in custom.split(',')]
            print(f"Custom labels: {custom}")
    except Exception as e:
        print(f"Metadata error: {e}")

    doc = {
        "objectKey": key,
        "bucket": bucket,
        "createdTimestamp": datetime.now().isoformat(),
        "labels": labels
    }
    es = get_es_client()
    resp = es.index(index='photos', body=doc, id=key)
    print(f"Indexed: {resp}")
    return {'statusCode': 200, 'body': json.dumps(f"Indexed {key}")}