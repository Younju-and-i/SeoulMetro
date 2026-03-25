from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints import stations  # 위에서 만든 라우터 임포트

from contextlib import asynccontextmanager
from pyspark.sql import SparkSession
from py4j.protocol import Py4JNetworkError
from app.core.settings import settings  

@asynccontextmanager
async def lifespan(app: FastAPI):
  spark = None
  try:
    spark = SparkSession.builder \
      .appName("mySparkApp") \
      .master(settings.spark_url) \
      .config("spark.driver.host", settings.host_ip) \
      .config("spark.driver.bindAddress", "0.0.0.0") \
      .config("spark.driver.port", "10000") \
      .config("spark.blockManager.port", "10001") \
      .config("spark.executor.port", "10002") \
      .config("spark.network.timeout", "800s") \
      .config("spark.rpc.askTimeout", "300s") \
      .config("spark.tcp.retries", "16") \
      .config("spark.cores.max", "2") \
      .config("spark.rpc.message.maxSize", "512") \
      .config("spark.driver.maxResultSize", "2g") \
      .config("spark.shuffle.io.maxRetries", "10") \
      .config("spark.shuffle.io.retryWait", "15s") \
      .config("spark.jars.packages", "org.mariadb.jdbc:mariadb-java-client:3.5.7") \
      .getOrCreate()
    app.state.spark = spark
    print("Spark Session Created Successfully!")
    yield
  except Exception as e:
    print(f"Spark initialization failed: {e}")
    raise e
  finally:
    print("Initiating Shutdown...")
    if spark:
      try:
        if hasattr(spark, "_jsc") and spark._jsc:
          print("Stopping Spark Session Safely...")
          spark.stop()
          print("Spark Stopped.")
      except (Py4JNetworkError, ConnectionResetError, Exception) as e:
        print(f"Spark JVM already closed, skipping clean stop")
      finally:
        spark = None
        print("Finalizing shutdown...")

app = FastAPI(root_path="/api", title="Subway Analysis API", lifespan=lifespan)

# [CORS 설정]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [라우터 연결]
# /api라는 접두사를 붙여서 stations.py의 엔드포인트들을 연결합니다.
app.include_router(stations.router, prefix="/v1")

@app.get("/")
async def root():
    return {"message": "Subway Analysis API is running"}