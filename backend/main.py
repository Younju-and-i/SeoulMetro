from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import urllib.parse
from sqlalchemy import create_engine, text
from settings import settings

def get_insight(on_h, off_h, netflow):
    morning_on = sum(on_h[2:5])   # 07:00 ~ 10:00 (출근 시간 승차)
    evening_off = sum(off_h[13:16]) # 18:00 ~ 21:00 (퇴근 시간 하차)
    
    if evening_off > morning_on and netflow > 0:
        return {
            "type": "유입형 (상업/여가)",
            "desc": "퇴근 후 소비가 집중되는 핵심 상업지입니다.",
            "recommend": ["음식점", "카페", "주점"]
        }
    elif morning_on > evening_off:
        return {
            "type": "유출형 (주거 중심)",
            "desc": "아침 출근 인구가 많은 주거 밀집 지역입니다.",
            "recommend": ["편의점", "세탁소", "베이커리"]
        }
    else:
        return {
            "type": "복합형",
            "desc": "주거와 상업 기능이 혼재된 지역입니다.",
            "recommend": ["브런치 카페", "피트니스", "드럭스토어"]
        }

app = FastAPI()

# [CORS 설정] 프론트엔드(React) 앱의 리소스 접근 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [데이터베이스 연결] MariaDB 연결을 위한 SQLAlchemy 엔진 생성 함수
def get_engine():
    safe_password = urllib.parse.quote_plus(settings.MARIADB_PASSWORD)
    return create_engine(
        f"mysql+pymysql://{settings.MARIADB_USER}:{safe_password}"
        f"@{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}?charset=utf8mb4"
    )

# 1. [순유입 TOP 10] analysis_mart 테이블 기준 net_flow 상위 10개 역 조회
@app.get("/api/top-stations")
async def top_stations():
    engine = get_engine()
    df = pd.read_sql("SELECT 역명, net_flow FROM analysis_mart ORDER BY net_flow DESC LIMIT 10", con=engine)
    return df.to_dict(orient="records")

# 2. [코로나 충격도 TOP 10] shock_index 기준 감소폭이 가장 큰 상위 10개 역 조회
@app.get("/api/covid-shock")
async def covid_shock():
    engine = get_engine()
    df = pd.read_sql("SELECT 역명, shock_index FROM analysis_mart ORDER BY shock_index ASC LIMIT 10", con=engine)
    return df.to_dict(orient="records")

# 3. [통합 분석 데이터] 리액트 대시보드 차트 시각화용 전체 데이터 조회
@app.get("/api/analysis-all")
async def analysis_all():
    engine = get_engine()
    df = pd.read_sql("SELECT * FROM analysis_mart", con=engine)
    return df.to_dict(orient="records")

# 4. [지하철 위치 데이터] 역명 불일치(역 글자, 괄호) 완벽 해결 버전
@app.get("/api/stations")
async def get_stations(month: str = "2019-01"):
    try:
        engine = get_engine()
        query = text("""
            SELECT 
                CAST(REPLACE(P.`호선`, '호선', '') AS CHAR) as 호선, 
                P.`역명`, P.`위도` as lat, P.`경도` as lng, P.`역번호`,
                IFNULL(S_SUM.on_total, 0) as on_total,
                IFNULL(H_SUM.off_total, 0) as off_total
            FROM `위치` P
            LEFT JOIN (
                SELECT `역명`, CAST(REPLACE(`호선`, '호선', '') AS CHAR) as line_clean, SUM(`승차합계`) as on_total
                FROM `승차` WHERE `날짜` LIKE :month_pattern GROUP BY `역명`, `호선`
            ) S_SUM ON SUBSTRING_INDEX(REPLACE(S_SUM.`역명`, '역', ''), '(', 1) COLLATE utf8mb4_unicode_ci 
                   = SUBSTRING_INDEX(REPLACE(P.`역명`, '역', ''), '(', 1) COLLATE utf8mb4_unicode_ci
                AND S_SUM.line_clean = CAST(REPLACE(P.`호선`, '호선', '') AS CHAR)
            LEFT JOIN (
                SELECT `역명`, CAST(REPLACE(`호선`, '호선', '') AS CHAR) as line_clean, SUM(`하차합계`) as off_total
                FROM `하차` WHERE `날짜` LIKE :month_pattern GROUP BY `역명`, `호선`
            ) H_SUM ON SUBSTRING_INDEX(REPLACE(H_SUM.`역명`, '역', ''), '(', 1) COLLATE utf8mb4_unicode_ci 
                   = SUBSTRING_INDEX(REPLACE(P.`역명`, '역', ''), '(', 1) COLLATE utf8mb4_unicode_ci
                AND H_SUM.line_clean = CAST(REPLACE(P.`호선`, '호선', '') AS CHAR)
            ORDER BY P.`역명` ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"month_pattern": f"{month}%"})
        return df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 5. [역 상세 분석 조회] 검색어 패턴 매칭 강화
@app.get("/api/station-detail")
async def get_station_detail(station: str, date: str, line: str = None):
    try:
        engine = get_engine()
        line_val = f"{line}호선" if line and '호선' not in line else line

        query = text("""
            SELECT 
                IFNULL(A.`순유입`, 0) as netflow, B.`승차합계`, C.`하차합계`,
                B.`06:00 이전` as on_pre06, B.`06:00-07:00` as on_06, B.`07:00-08:00` as on_07,
                B.`08:00-09:00` as on_08, B.`09:00-10:00` as on_09, B.`10:00-11:00` as on_10,
                B.`11:00-12:00` as on_11, B.`12:00-13:00` as on_12, B.`13:00-14:00` as on_13,
                B.`14:00-15:00` as on_14, B.`15:00-16:00` as on_15, B.`16:00-17:00` as on_16,
                B.`17:00-18:00` as on_17, B.`18:00-19:00` as on_18, B.`19:00-20:00` as on_19,
                B.`20:00-21:00` as on_20, B.`21:00-22:00` as on_21, B.`22:00-23:00` as on_22,
                B.`23:00-24:00` as on_23, B.`24:00 이후` as on_post24,
                C.`06:00 이전` as off_pre06, C.`06:00-07:00` as off_06, C.`07:00-08:00` as off_07,
                C.`08:00-09:00` as off_08, C.`09:00-10:00` as off_09, C.`10:00-11:00` as off_10,
                C.`11:00-12:00` as off_11, C.`12:00-13:00` as off_12, C.`13:00-14:00` as off_13,
                C.`14:00-15:00` as off_14, C.`15:00-16:00` as off_15, C.`16:00-17:00` as off_16,
                C.`17:00-18:00` as off_17, C.`18:00-19:00` as off_18, C.`19:00-20:00` as off_19,
                C.`20:00-21:00` as off_20, C.`21:00-22:00` as off_21, C.`22:00-23:00` as off_22,
                C.`23:00-24:00` as off_23, C.`24:00 이후` as off_post24
            FROM `승차` B
            INNER JOIN `하차` C ON C.`역명` COLLATE utf8mb4_unicode_ci = B.`역명` COLLATE utf8mb4_unicode_ci
                AND C.`호선` COLLATE utf8mb4_unicode_ci = B.`호선` COLLATE utf8mb4_unicode_ci AND C.`날짜` = B.`날짜`
            LEFT JOIN `netflow_table_2019` A ON A.`역명` COLLATE utf8mb4_unicode_ci = B.`역명` COLLATE utf8mb4_unicode_ci
                AND A.`날짜` = B.`날짜`
            WHERE (REPLACE(B.`역명`, '역', '') LIKE CONCAT(:station, '%'))
              AND B.`날짜` = :date AND (:line_val IS NULL OR B.`호선` = :line_val)
            LIMIT 1
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"station": station, "date": date, "line_val": line_val})
            
            # [추가] 평일/휴일 비교를 위한 해당 역의 평균 승차량 데이터 (2019년 기준)
            avg_query = text("""
                SELECT AVG(승차합계) as avg_val, 
                CASE WHEN WEEKDAY(STR_TO_DATE(날짜, '%Y-%m-%d')) >= 5 THEN 'holiday' ELSE 'weekday' END as day_type
                FROM `승차` WHERE REPLACE(`역명`, '역', '') LIKE CONCAT(:station, '%') AND `호선` = :line_val
                GROUP BY day_type
            """)
            df_avg = pd.read_sql(avg_query, conn, params={"station": station, "line_val": line_val})

        if df.empty:
            return {"on_hourly": [0]*20, "off_hourly": [0]*20, "netflow": 0}
        
        row = df.iloc[0]
        h_keys = ['pre06','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','post24']
        on_h = [int(row[f'on_{h}']) if pd.notnull(row[f'on_{h}']) else 0 for h in h_keys]
        off_h = [int(row[f'off_{h}']) if pd.notnull(row[f'off_{h}']) else 0 for h in h_keys]

        # 평일/휴일 평균 가공
        avg_dict = df_avg.set_index('day_type')['avg_val'].to_dict()

        return {
            "on": int(row['승차합계']),
            "off": int(row['하차합계']),
            "netflow": int(row['netflow']),
            "on_hourly": on_h,
            "off_hourly": off_h,
            "net_hourly": [on - off for on, off in zip(on_h, off_h)],
            "comparison": {
                "weekday": int(avg_dict.get('weekday', 0)),
                "holiday": int(avg_dict.get('holiday', 0))
            },
            "insight": get_insight(on_h, off_h, int(row['netflow']))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/station-covid")
async def get_station_covid(station: str):
    try:
        engine = get_engine()
        # 2019년 vs 2020년 월별 비교 (날짜 포맷에 따라 STR_TO_DATE 조절 필요)
        query = text("""
            SELECT LEFT(날짜, 4) as year, SUM(승차합계) as total
            FROM `승차` WHERE REPLACE(`역명`, '역', '') LIKE CONCAT(:station, '%')
            AND (날짜 LIKE '2019%' OR 날짜 LIKE '2020%')
            GROUP BY year ORDER BY year
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"station": station})
        return df.to_dict(orient="records")
    except Exception as e:
        return []