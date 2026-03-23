from fastapi import APIRouter, HTTPException, Query
import pandas as pd
from sqlalchemy import text
from app.core.database import get_engine
# get_insight 서비스가 없는 경우를 대비해 하단에 로직을 포함하거나 임포트 유지
from app.services.analytics import get_insight 

router = APIRouter()

# 1. [순유입 TOP 10] - 메인 대시보드용
@router.get("/top-stations")
async def top_stations():
    try:
        engine = get_engine()
        query = text("""
            SELECT station as 역명, SUM(net_flow) as net_flow 
            FROM `03_mart_subway` 
            GROUP BY station 
            ORDER BY net_flow DESC LIMIT 10
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        return df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Top-stations Error: {str(e)}")

# 2. [전체 역 목록 및 위치 정보] - 지도 마커 렌더링용
@router.get("/stations")
async def get_stations(month: str = "2021-12"):
    try:
        engine = get_engine()
        
        # [수정] 프론트에서 '%Y-%m' 같은 이상한 값이 넘어올 경우 방어
        if not month or "%" in month or len(month) != 7:
            # DB에 데이터가 확실히 있는 기본값으로 설정
            month = "2021-12" 

        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        # [수정] COLLATE utf8mb4_general_ci를 추가하여 정렬 방식 충돌 해결
        query = text("""
            SELECT 
                P.`호선` as original_line, 
                P.`역명`, 
                P.`위도` as lat, 
                P.`경도` as lng,
                S.on_total,
                S.off_total
            FROM `위치` P
            INNER JOIN (
                SELECT 
                    station, 
                    line,
                    SUM(boarding) as on_total,
                    SUM(alighting) as off_total
                FROM `02_int_subway`
                WHERE date >= :start_date AND date <= :end_date
                GROUP BY station, line
            ) S ON (
                -- 양쪽 컬럼의 COLLATE를 통일시켜서 에러 방지
                REPLACE(P.`역명`, '역', '') COLLATE utf8mb4_general_ci = 
                REPLACE(S.station, '역', '') COLLATE utf8mb4_general_ci
                AND 
                CAST(REGEXP_REPLACE(P.`호선`, '[^0-9]', '') AS UNSIGNED) = 
                CAST(REGEXP_REPLACE(S.line, '[^0-9]', '') AS UNSIGNED)
            )
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"start_date": start_date, "end_date": end_date})
        
        if df.empty:
            return []

        results = []
        for _, row in df.iterrows():
            line_num = "".join(filter(str.isdigit, str(row["original_line"])))
            results.append({
                "line": line_num,
                "역명": str(row["역명"]),
                "lat": float(row["lat"]) if pd.notnull(row["lat"]) else 37.5665,
                "lng": float(row["lng"]) if pd.notnull(row["lng"]) else 127.0246,
                "on_total": int(row["on_total"]),
                "off_total": int(row["off_total"])
            })
        return results

    except Exception as e:
        print(f"Stations Error Detail: {str(e)}") # 서버 터미널에서 확인용
        raise HTTPException(status_code=500, detail=f"Database Collation Error: {str(e)}")

# 3. [역 상세 분석 리포트] - 핵심 수정 부분
@router.get("/station-detail")
async def get_station_detail(station: str, date: str, line: str = None):
    try:
        engine = get_engine()
        # 숫자만 추출 (예: '2호선' -> 2)
        line_num = int("".join(filter(str.isdigit, str(line)))) if line else None

        # 1) 시간대별 승하차 데이터 조회
        detail_query = text("""
                            SELECT hour, boarding, alighting
                            FROM `02_int_subway`
                            WHERE REPLACE(station, '역', '') = REPLACE(:station, '역', '') 
                            AND date = :date 
                            AND (:line_num IS NULL OR CAST(REGEXP_REPLACE(line, '[^0-9]', '') AS UNSIGNED) = :line_num)
                            ORDER BY CAST(hour AS UNSIGNED) ASC
                            """)
        
        # 2) 평일/주말 평균 유동량 (비교용)
        avg_query = text("""
            SELECT 
                AVG(daily_boarding) as avg_val,
                day_type
            FROM (
                SELECT date, SUM(boarding) as daily_boarding,
                       CASE WHEN WEEKDAY(date) >= 5 THEN 'holiday' ELSE 'weekday' END as day_type
                FROM `02_int_subway`
                WHERE station = :station 
                  AND (:line_num IS NULL OR CAST(REGEXP_REPLACE(line, '[^0-9]', '') AS UNSIGNED) = :line_num)
                GROUP BY date, day_type
            ) t
            GROUP BY day_type
        """)

        with engine.connect() as conn:
            df = pd.read_sql(detail_query, conn, params={"station": station, "date": date, "line_num": line_num})
            df_avg = pd.read_sql(avg_query, conn, params={"station": station, "line_num": line_num})

        # 데이터 부재 시 기본 구조 반환 (프론트 크래시 방지)
        if df.empty:
            return {
                "on_hourly": [0]*24, "off_hourly": [0]*24, 
                "comparison": {"weekday": 0, "holiday": 0},
                "insight": {"score": 0, "type": "데이터 없음", "growth": "-", "competition": "-", "consumer": "-"}
            }

        # 0~23시 배열 생성
        on_hourly = [0] * 24
        off_hourly = [0] * 24
        for _, row in df.iterrows():
            h = int(row['hour'])
            if 0 <= h < 24:
                on_hourly[h] = int(row['boarding'])
                off_hourly[h] = int(row['alighting'])

        avg_dict = df_avg.set_index('day_type')['avg_val'].to_dict()
        
        # 인사이트 데이터 생성 (get_insight 함수 결과 활용)
        total_on = sum(on_hourly)
        total_off = sum(off_hourly)
        insight_data = get_insight(on_hourly, off_hourly, total_on - total_off)

        return {
            "station": station,
            "line": str(line_num),
            "on_hourly": on_hourly,
            "off_hourly": off_hourly,
            "comparison": {
                "weekday": int(avg_dict.get('weekday', 0)),
                "holiday": int(avg_dict.get('holiday', 0))
            },
            "insight": {
                "score": insight_data.get("score", 80),
                "type": insight_data.get("type", "분석 중"),
                "growth": insight_data.get("growth", "Normal"),
                "competition": insight_data.get("competition", "보통"),
                "consumer": insight_data.get("consumer", "직장인")
            }
        }
    except Exception as e:
        return {
            "station": station,
            "line": line,
            "on_hourly": [0]*24, 
            "off_hourly": [0]*24,
            "comparison": {"weekday": 0, "holiday": 0}, # 이 키가 빠지면 대시보드 차트에서 에러 날 수 있음
            "insight": {
                "score": 0, 
                "type": "에러 발생", 
                "growth": "-", 
                "competition": "-", 
                "consumer": "-"
            }
        }

# 4. [DB 가용 날짜 목록] - 최신순 정렬 (수정 버전)
@router.get("/available-dates")
async def get_available_dates():
    try:
        engine = get_engine()
        # 1. %%Y-%%m 처럼 %를 두 번 써서 파이썬 포맷팅 에러 방지
        # 2. date가 문자열일 경우를 대비해 DISTINCT LEFT(date, 7) 방식 병행
        query = text("""
            SELECT DISTINCT LEFT(CAST(date AS CHAR), 7) as month 
            FROM `02_int_subway` 
            WHERE date IS NOT NULL 
            ORDER BY month DESC
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        
        # 결과값 세척 (None 제거 및 유효한 포맷만 필터링)
        months = [m for m in df['month'].tolist() if m and len(m) == 7 and m != "%Y-%m"]
        
        print(f"Fetched Months: {months}") # 서버 로그에서 확인용
        
        # 데이터가 하나도 없으면 프론트가 멈추지 않게 실제 DB에 있을 법한 기본값 반환
        return months if months else ["2021-12", "2021-11", "2021-10"]
        
    except Exception as e:
        print(f"Date Fetch Error Detail: {e}")
        # 최후의 수단: 에러 시 프론트엔드 셀렉트박스가 깨지지 않도록 기본 리스트 반환
        return ["2021-12", "2021-11", "2021-10"]
    
# [추가] 프론트엔드 에러 방지용 임시 코로나 API
@router.get("/station-covid")
async def get_station_covid(station: str):
    try:
        # 지금은 데이터가 없으므로 빈 리스트([])를 반환합니다.
        # 이렇게 하면 프론트엔드의 Promise.all이 "성공"으로 인식해서 대시보드를 그려줍니다.
        return []
    except Exception:
        return []