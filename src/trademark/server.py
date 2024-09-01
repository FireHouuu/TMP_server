from kafka import KafkaConsumer, KafkaProducer
from flask import Flask, request, jsonify
import os
import re
import json
import logging
import numpy as np
import requests
from PIL import Image
from io import BytesIO
from elasticsearch import Elasticsearch
from konlpy.tag import Okt
from ko_pron import romanise
import fasttext
import dotenv
import base64
import threading
from pymongo import MongoClient

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Connect to MongoDB
def connect_to_mongodb():
    logger.info("Attempting to connect to MongoDB...")
    try:
        client = MongoClient('mongodb+srv://whwkdgh758:Bsin758@cluster0.ovy2ynp.mongodb.net/trademark_db?retryWrites=true&w=majority')  
        db = client['trademark_db']
        logger.info("Successfully connected to MongoDB")
        return db
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {str(e)}")
        raise

# Connect to Elasticsearch
def connectToElastic() -> Elasticsearch:
    logger.info("Attempting to connect to Elasticsearch...")
    try:
        dotenv_file = dotenv.find_dotenv()
        dotenv.load_dotenv(dotenv_file)
        es = Elasticsearch(cloud_id=os.environ['Elastic_Cloud_ID'], 
                           basic_auth= (os.environ['Elastic_Username'], os.environ['Elastic_Password']))
        logger.info("Successfully connected to Elasticsearch")
        return es
    except Exception as e:
        logger.error(f"Failed to connect to Elasticsearch: {str(e)}")
        raise

# Initialize Kafka producer
producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    value_serializer=lambda x: json.dumps(x).encode('utf-8')
)

consumer = KafkaConsumer(
    'trademark-workers',
    bootstrap_servers=['localhost:9092'],
    auto_offset_reset='earliest',
    enable_auto_commit=True,
    group_id='trademark-workers',
    value_deserializer=lambda x: json.loads(x.decode('utf-8'))
)

@st.cache_resource
def load_model():
    model = fasttext.load_model('kor.bin')
    return model

def process_trademark_internal(name, product_name, uid):
    logger.info(f"Processing trademark internally: {name}")
    try:
        results = {}

        # 실행 및 결과 저장
        logger.info("Executing trademark checks...")
        results['find_same_name'] = queryForFindSameNameV2(name)
        results['find_similar_name'] = queryForFindSimilarName(name)
        results['find_similar_pronun'] = queryForFindSimilarPronun(name)
        results['tokenize'] = tokenize(name)
        results['check_elastic'] = queryForCheckElastic(name)
        similarity_score = calculate_similarity(model, name, product_name)
        results['similarity_score'] = 1

        # Kafka로 결과 전송
        producer.send('trademark-results', value={
            'uid': uid,
            'name': name,
            'product_name': product_name,
            'results': results
        })
        logger.info(f"Results successfully sent to Kafka for user: {uid}")

        return results
    except Exception as e:
        logger.error(f"Error processing trademark {name}: {str(e)}")
        return {"error": f"상표 처리 중 오류가 발생했습니다: {str(e)}"}
    
@app.route('/process_trademark', methods=['POST'])
def process_trademark():
    logger.info("Received request to process trademark")
    data = request.get_json()
    name = data.get('name')
    product_name = data.get('product_name')
    
    if not name:
        logger.warning("Trademark name not provided in the request")
        return jsonify({"error": "표장 이름이 제공되지 않았습니다."}), 400

    logger.info(f"Processing trademark: {name}")

    try:
        results = process_trademark_internal(name)
        return jsonify({"message": "처리가 완료되었습니다.", "results": results})
    except Exception as e:
        logger.error(f"Error processing trademark {name}: {str(e)}")
        return jsonify({"error": f"상표 처리 중 오류가 발생했습니다: {str(e)}"}), 500

#Kafka로 부터 메시지 수신
def consume_messages():
    logger.info("Starting Kafka consumer...")
    try:
        with app.app_context():
            for message in consumer:
                logger.info(f"Received message: {message.value}")
                try:
                    name = message.value.get('name')
                    product_name = message.value.get('product_name')
                    uid = message.value.get('uid')
                    if name and uid:
                        result = process_trademark_internal(name, product_name, uid)
                        logger.info(f"Successfully processed message: {message.value}")
                        logger.info(f"Result: {result}")
                    else:
                        logger.warning(f"Received message without 'name' or 'uid' field: {message.value}")
                except Exception as e:
                    logger.error(f"Error processing message {message.value}: {str(e)}")
    except Exception as e:
        logger.error(f"Error in Kafka consumer: {str(e)}")

#출원 대상 상품 - 출원 상표 간의 견련성 검사, (상표법 제 33조 1항, 상표의 '식별력' 판단을 위함)
def calculate_similarity(model, trademark_name, product_name):
    refined_name = trademark_name.replace(product_name, "").strip()
    vector1 = model.get_sentence_vector(refined_name)
    vector2 = model.get_sentence_vector(product_name)
    similarity = np.dot(vector1, vector2) / (np.linalg.norm(vector1) * np.linalg.norm(vector2))
    
    if np.isnan(similarity):
        similarity = 0
        
    return similarity

#이미 등록되어 있는 '동일'한 상표가 있는지 검사
def queryForFindSameNameV2(name):
    es = connectToElastic()
    try:
        name = name.replace(' ', '')
        query = {
            "match": {
                "title": name
            }
        }
        resp = es.search(index='tm_data_ngram', body={"query": query, "size": 500})
        IsSame = False
        SameName = None
        name = name.lower()
        for ans in resp["hits"]["hits"]:
            cmp = ans["_source"]["title"].lower()
            if name == cmp.replace(' ', ''):
                SameName = ans["_source"]["title"]
                IsSame = True
                break

        if IsSame:
            return {"result": True, "msg": f"\"{SameName}\"이라는 같은 이름이 상표로 등록이 되어 있어 해당 명은 상표 등록이 불가능합니다."}
        else:
            return {"result": False, "msg": ""}

    except Exception as e:
        return {"error": f"error for FindNameV2: {str(e)}"}

#이미 등록되어 있는 '유사'한 상표가 있는지 검사
def queryForFindSimilarName(name):
    es = connectToElastic()
    try:
        name = name.replace(' ', '')
        eng_name = romanise(name, "rr")
        query_kr = {"fuzzy": {"title": {"value": name, "fuzziness": "2"}}}
        query_eng = {"fuzzy": {"eng_title": {"value": eng_name, "fuzziness": "2"}}}
        resp_kr = es.search(index="tm_data", body={"query": query_kr})
        resp_eng = es.search(index="tm_data", body={"query": query_eng})

        IsSimilar = False
        SimilarNamesAndDates = []
        for ans in resp_eng["hits"]["hits"]:
            similar_title = ans["_source"]["title"]
            application_date = ans["_source"].get("applicationDate", "출원일 정보 없음")
            image_url = ans["_source"].get("bigDrawing", None)
            SimilarNamesAndDates.append((similar_title, application_date, image_url))
            IsSimilar = True
        for ans in resp_kr["hits"]["hits"]:
            similar_title = ans["_source"]["title"]
            application_date = ans["_source"].get("applicationDate", "출원일 정보 없음")
            image_url = ans["_source"].get("bigDrawing", None)
            SimilarNamesAndDates.append((similar_title, application_date, image_url))
            IsSimilar = True

        if IsSimilar:
            return {"result": True, "data": SimilarNamesAndDates}
        else:
            return {"result": False, "msg": "유사한 이름을 찾을 수 없습니다."}

    except Exception as e:
        return {"error": f"Error in queryForFindSimilarName: {str(e)}"}


#이미 등록되어 있는 '발음이 유사'한 상표가 있는지 검사
def queryForFindSimilarPronun(name):
    es = connectToElastic()
    #국제 표준 발음기호로 변환
    try:
        segments = re.split('([가-힣]+)', name)
        ipa_name = ""
        for segment in segments:
            if segment and re.match('[가-힣]+', segment):
                ipa_name += romanise(segment, "ipa")
            else:
                ipa_name += ipa.convert(segment)

        fuzzy_query = {
            "query": {
                "fuzzy": {
                    "ipa_title": {
                        "value": ipa_name,
                        "fuzziness": "2"
                    }
                }
            }
        }
        resp = es.search(index="tm_data", body=fuzzy_query)

        SimilarNamesWithScores = []
        for ans in resp['hits']['hits']:
            title = ans['_source']['title']
            score = get_score(ipa_name, ans['_source']['ipa_title'])
            application_date = ans['_source'].get('applicationDate', '출원일 정보 없음')
            image_url = ans['_source'].get('bigDrawing', None)

            company_check_query = {
                "query": {
                    "match": {
                        "column3": title
                    }
                }
            }
            #국내 100대 기업의 경우 유사 범위를 좀 더 넓게 취급. 유사도 점수가 상대적으로 적더라도 사용자에게 결과 출력
            large_company_check = es.search(index='big_company', body=company_check_query)
            is_large_company = large_company_check['hits']['total']['value'] > 0

            if is_large_company and score['score'] > 0.55 or not is_large_company and score['score'] > 0.7:
                company_label = " (대형 기업)" if is_large_company else ""
                SimilarNamesWithScores.append((f"{title}{company_label}", score['score'], application_date, image_url))

        SimilarNamesWithScores.sort(key=lambda x: x[1], reverse=True)

        if SimilarNamesWithScores:
            return {"result": True, "data": SimilarNamesWithScores}
        else:
            return {"result": False, "msg": "유사한 상표명 없음"}
    except Exception as e:
        return {"error": f"Error in queryForFindSimilarPronun: {str(e)}"}

def tokenize(name):
    try:
        analyzer = Okt()
        tokens = analyzer.morphs(name)
        return {"tokens": tokens}
    except Exception as e:
        return {"error": f"Error in tokenization: {str(e)}"}

#상표의 사회 통념상 적합성 판단
def queryForCheckElastic(name):
    es = connectToElastic()
    try:
        dotenv_file = dotenv.find_dotenv()
        dotenv.load_dotenv(dotenv_file)

        username = os.environ['Elastic_Username']
        password = os.environ['Elastic_Password']
        credentials = base64.b64encode(f'{username}:{password}'.encode('utf-8')).decode('utf-8')
        header = {"Content-Type": "application/json", 'Authorization': f'Basic {credentials}'}

        tokens = Okt().morphs(name)
        IsNegative = False
        negative_token = []
        token_filter = ['의', '닭볶음탕', '밥', '떱옦기', '도', '밥집', '닭', '찜닭', 'chicken', '꼬꼬댁']

        for token in tokens:
            if token in token_filter:
                continue

            req = {
                "docs":[
                    {
                        "text_field": token
                        }
                    ],
                "inference_config": {
                    "text_classification": {
                        "num_top_classes": 2
                        }
                    }
            }

            #해당 감정분석 모델을 통해 부정성 판단
            resp = es.transport.perform_request('POST', "/_ml/trained_models/matthewburke__korean_sentiment/deployment/_infer" ,body=json.dumps(req), headers= header)

            if resp.body["top_classes"][0]["class_name"] == "LABEL_0" and resp.body["top_classes"][0]["class_score"] > 0.8:
                IsNegative = True
                negative_token += [{"name": token,
                                  "positive": resp.body["top_classes"][1]["class_score"], 
                                  "negative": resp.body["top_classes"][0]["class_score"]}]
        nodup = []
        for value in negative_token:
            if value not in nodup:
                nodup.append(value)
        result = {"result": IsNegative, "NegativeTokens": nodup}

        return result
    except Exception as e:
        return {"error": f"Error in queryForCheckElastic: {str(e)}"}
    
def test_mongodb_connection():
    logger.info("Testing MongoDB connection...")
    try:
        db = connect_to_mongodb()
        db.command('ping')
        logger.info("MongoDB connection test successful")
    except Exception as e:
        logger.error(f"MongoDB connection test failed: {str(e)}")
        raise
    
if __name__ == '__main__':
    logger.info("Starting the application...")
    test_mongodb_connection()
    consumer_thread = threading.Thread(target=consume_messages)
    consumer_thread.start()
    logger.info("Kafka consumer thread started")
    app.run(host='0.0.0.0', port=5001)
    logger.info("Flask application is running")
