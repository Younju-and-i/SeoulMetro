from fastapi import FastAPI
import pandas as pd
import urllib.parse
from sqlalchemy import create_engine
from settings import settings

app = FastAPI()

# MariaDB 연결용 엔진 (필요시 공통 함수로 분리 가능)
def get_engine():
    safe_password = urllib.parse.quote_plus(settings.MARIADB_PASSWORD)
    return create_engine(
        f"mysql+pymysql://{settings.MARIADB_USER}:{safe_password}"
        f"@{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}?charset=utf8mb4"
    )

# 1. 순유입 TOP 10 API (이미 DB에 저장된 analysis_mart 테이블 사용)
@app.get("/api/top-stations")
async def top_stations():
    engine = get_engine()
    # net_flow 기준으로 상위 10개만 가져오기
    df = pd.read_sql("SELECT 역명, net_flow FROM analysis_mart ORDER BY net_flow DESC LIMIT 10", con=engine)
    return df.to_dict(orient="records")

# 2. 코로나 충격도 TOP 10 API
@app.get("/api/covid-shock")
async def covid_shock():
    engine = get_engine()
    # shock_index가 큰 순서대로 (감소폭이 큰 순)
    df = pd.read_sql("SELECT 역명, shock_index FROM analysis_mart ORDER BY shock_index ASC LIMIT 10", con=engine)
    return df.to_dict(orient="records")

# 3. 통합 분석 데이터 (리액트 차트 전체용)
@app.get("/api/analysis-all")
async def analysis_all():
    engine = get_engine()
    # 모든 지표가 들어있는 마트 테이블 전체 반환
    df = pd.read_sql("SELECT * FROM analysis_mart", con=engine)
    return df.to_dict(orient="records")