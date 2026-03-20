# main.py에 최대한 복잡한 쿼리 없이 함수를 호출하려고 함

from fastapi import FastAPI
from analytics import get_top_net_flow, get_covid_shock_index, get_time_concentration
from settings import settings

app = FastAPI()

# 1. 순유입 TOP 10 API
@app.get("/api/top-stations")
async def top_stations():
    # Spark 세션은 전역변수나 startup에서 생성된 것 사용
    global spark
    return get_top_net_flow(spark, settings)

# 2. 코로나 충격도 API
@app.get("/api/covid-shock")
async def covid_shock():
    global spark
    return get_covid_shock_index(spark, settings)

# 3. 시간대 집중도 API
@app.get("/api/time-focus")
async def time_focus():
    global spark
    return get_time_concentration(spark, settings)