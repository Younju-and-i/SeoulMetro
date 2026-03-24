from fastapi import APIRouter, Query
import pandas as pd
import numpy as np
from sqlalchemy import text
from app.core.database import get_engine

router = APIRouter()

# [도움 함수] DB stn_name 컨벤션에 맞게 역 이름 보정
def format_station_name(name: str) -> str:
    if not name: return name
    return name if name.endswith("역") else f"{name}역"

# 1. [필수] 가용 날짜 리스트 (프런트엔드 초기 로드 시 404 방지)
@router.get("/available-dates")
async def get_available_dates():
    try:
        engine = get_engine()
        query = text("""
            SELECT DATE_FORMAT(base_date, '%Y-%m') as month 
            FROM `03_mart_hourly_kpi` 
            GROUP BY month ORDER BY month DESC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        return df['month'].tolist()
    except Exception as e:
        return ["2021-12"]

# 2. [핵심] 상권 분석 지표 (Map.jsx의 리포트 카드용)
@router.get("/station/metrics")
async def get_station_metrics(station_name: str, line_num: int = Query(1)):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        
        # 1. 일별 데이터 및 연도별 분석을 위한 쿼리 (가중치 산출용)
        query = text("""
            SELECT 
                YEAR(base_date) as year,
                base_date,
                SUM(on_cnt + off_cnt) as daily_total,
                SUM(on_cnt) as total_on,
                SUM(off_cnt) as total_off,
                WEEKDAY(base_date) as day_of_week
            FROM `03_mart_hourly_kpi`
            WHERE stn_name = :name AND line_num = :line
            GROUP BY base_date, year
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "line": line_num})
        
        if df.empty:
            return {"v2019": 0, "v2020": 0, "v2021": 0, "analysis_score": 0, "location_grade": "N/A"}

        # --- ① 정의서 기반 투자 점수 산출 ---
        avg_flow = df['daily_total'].mean()
        flow_score = min(100, (avg_flow / 50000) * 100) # 유동 규모(40%)
        
        total_in = df['total_on'].sum()
        total_out = df['total_off'].sum()
        nfi = ((total_out - total_in) / (total_in + total_out)) * 100
        net_in_score = 70 if nfi > 5 else (40 if nfi < -5 else 55)
        if total_out > total_in: net_in_score += 10 # 유입 집중도(20%) 보정

        cv = df['daily_total'].std() / avg_flow if avg_flow > 0 else 1
        stability_score = (1 - cv) * 100 # 운영 안정성(25%)

        weekday_avg = df[df['day_of_week'] < 5]['daily_total'].mean()
        holiday_avg = df[df['day_of_week'] >= 5]['daily_total'].mean()
        holiday_ratio = (holiday_avg / weekday_avg * 100) if weekday_avg > 0 else 0
        holiday_score = 100 if holiday_ratio >= 90 else holiday_ratio # 상권 활성도(15%)

        total_score = (0.4 * flow_score) + (0.2 * net_in_score) + (0.25 * stability_score) + (0.15 * holiday_score)

        # --- ② 복수 분석 차트용 연도별 데이터 추출 (NaN 방지) ---
        v2019 = df[df['year'] == 2019]['daily_total'].mean() if 2019 in df['year'].values else avg_flow
        v2021 = df[df['year'] == 2021]['daily_total'].mean() if 2021 in df['year'].values else avg_flow
        recovery_rate = (v2021 / v2019) if v2019 > 0 else 1.0

        return {
            "v2019": int(v2019),
            "v2020": int(df[df['year'] == 2020]['daily_total'].mean()) if 2020 in df['year'].values else 0,
            "v2021": int(v2021),
            "recovery_rate": round(recovery_rate, 4),
            "analysis_score": round(total_score, 1), # 스크린샷 상단 '상권 분석 점수'
            "weekday_avg": int(weekday_avg),
            "volatility": round(cv, 3),
            "stability_val": round(stability_score, 1),
            "commercial_type": "오피스형" if holiday_ratio < 80 else "복합 상권",
            "recommendation_desc": "간편식, 카페" if holiday_ratio < 80 else "프랜차이즈 식당",
            "location_grade": "A" if total_score > 80 else "B"
        }
    except Exception as e:
        print(f"Metrics Error: {e}")
        return {"error": str(e)}

# 3. [차트] 시간대별 패턴 (Map.jsx의 차트 데이터용)
@router.get("/station/hourly")
async def get_station_hourly(station_name: str, target_month: str, line_num: int = 1):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        # 문자열 비교 대신 범위 비교로 인덱스 태우기
        start_date = f"{target_month}-01"
        end_date = f"{target_month}-31"
        
        query = text("""
            SELECT hour, AVG(on_cnt) as avg_on, AVG(off_cnt) as avg_off
            FROM `03_mart_hourly_kpi`
            WHERE stn_name = :name 
              AND line_num = :line 
              AND base_date BETWEEN :start AND :end
            GROUP BY hour 
            ORDER BY hour ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={
                "name": target_name, "line": line_num, 
                "start": start_date, "end": end_date
            })
        return df.to_dict(orient="records")
    except:
        return []

# 4. [히트맵] 공휴일 에러 수정 버전
@router.get("/station/heatmap")
async def get_station_heatmap(station_name: str, target_month: str, line_num: int = 1):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        start_date = f"{target_month}-01"
        end_date = f"{target_month}-31"
        
        # 00_공휴일 테이블의 실제 컬럼명(`날짜`, `공휴일구분`) 반영
        query = text("""
            SELECT 
                DAY(a.base_date) as day, 
                WEEKDAY(a.base_date) as day_of_week,
                SUM(a.on_cnt + a.off_cnt) as daily_total, 
                COALESCE(h.`공휴일구분`, '') as holiday_name 
            FROM `03_mart_hourly_kpi` a
            LEFT JOIN `00_공휴일` h ON a.base_date = h.`날짜`
            WHERE a.stn_name = :name 
              AND a.line_num = :line 
              AND a.base_date BETWEEN :start AND :end
            GROUP BY a.base_date 
            ORDER BY a.base_date ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={
                "name": target_name, "line": line_num, 
                "start": start_date, "end": end_date
            })
        return df.to_dict(orient="records")
    except Exception as e:
        print(f"Heatmap Error: {e}")
        return []

# 5. [지도] 모든 역 위치 정보
@router.get("/stations")
async def get_all_stations():
    try:
        engine = get_engine()
        # GROUP_CONCAT을 사용하여 하나의 역명에 여러 노선을 묶어서 가져옵니다.
        query = text("""
            SELECT 
                s.stn_name as display_name, 
                GROUP_CONCAT(DISTINCT s.line_num ORDER BY s.line_num ASC) as line_list,
                MAX(p.위도) as lat, 
                MAX(p.경도) as lng
            FROM `03_mart_station_spatial` s
            JOIN `00_위치` p ON REPLACE(s.stn_name, '역', '') = REPLACE(p.역명, '역', '')
            GROUP BY s.stn_name
            ORDER BY s.stn_name ASC
        """)

        with engine.connect() as conn:
            df = pd.read_sql(query, conn)

        result = df.to_dict(orient="records")
        for item in result:
            # SQL에서 바꾼 이름인 line_list를 사용합니다.
            if item['line_list']:
                item['lines'] = item['line_list'].split(',') 
            else:
                item['lines'] = []
            
        return {"data": result}
    except Exception as e:
        print(f"Station Load Error: {e}")
        return {"data": []}