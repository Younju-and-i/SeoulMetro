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

# 1. [필수] 가용 날짜 리스트
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

# 2. [핵심] 상권 분석 지표 (Shock Defense 및 성장 테이블 연동 버전)
@router.get("/station/metrics")
async def get_station_metrics(station_name: str, line_num: int = Query(1)):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        
        # ① 기본 KPI 및 피크 타임 데이터
        query = text("""
            SELECT YEAR(base_date) as year,
                   SUM(on_cnt + off_cnt) as daily_total,
                   WEEKDAY(base_date) as day_of_week,
                   SUM(peak_morning_off) as morning_sum,
                   SUM(peak_lunch_off) as lunch_sum,
                   SUM(peak_evening_off) as evening_sum
            FROM `03_mart_hourly_kpi`
            WHERE stn_name = :name AND line_num = :line
            GROUP BY base_date, year
        """)
        
        # ② 추천 업종 데이터 (03_mart_franchise_recommend)
        reco_query = text("""
            SELECT office_score, recommended_biz
            FROM `03_mart_franchise_recommend`
            WHERE stn_name = :name
            ORDER BY base_ym DESC LIMIT 1
        """)

        # ③ [신규] Shock Defense 실측 데이터 (03_mart_growth_trend)
        growth_query = text("""
            SELECT recovery_rate 
            FROM `03_mart_growth_trend` 
            WHERE stn_name = :name 
            ORDER BY base_ym DESC LIMIT 1
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "line": line_num})
            reco_df = pd.read_sql(reco_query, conn, params={"name": target_name})
            growth_df = pd.read_sql(growth_query, conn, params={"name": target_name})
        
        if df.empty:
            return {"analysis_score": 0, "location_grade": "N/A"}

        # 지표 계산
        avg_flow = df['daily_total'].mean()
        cv = df['daily_total'].std() / avg_flow if avg_flow > 0 else 1
        weekday_avg = df[df['day_of_week'] < 5]['daily_total'].mean()
        holiday_avg = df[df['day_of_week'] >= 5]['daily_total'].mean()
        holiday_ratio = (holiday_avg / weekday_avg * 100) if weekday_avg > 0 else 0
        
        # 피크 타임 판별
        peak_data = {"07:00 ~ 09:00": df['morning_sum'].sum(), 
                     "11:00 ~ 13:00": df['lunch_sum'].sum(), 
                     "19:00 ~ 23:00": df['evening_sum'].sum()}
        best_peak = max(peak_data, key=peak_data.get)

        # 실측 Shock Defense (DB recovery_rate 사용)
        shock_val = float(growth_df.iloc[0]['recovery_rate']) if not growth_df.empty else 0.0
        
        has_reco = not reco_df.empty
        biz_text = reco_df.iloc[0]['recommended_biz'] if has_reco else "프랜차이즈 식당"

        return {
            "analysis_score": round(65.5, 1),
            "holiday_ratio": round(holiday_ratio, 1),
            "weekday_avg": int(weekday_avg),
            "volatility": round(cv, 3),
            "shock_defense": round(shock_val, 1), # 실측 데이터 반영
            "peak_time": best_peak,
            "commercial_type": "오피스 집중형" if holiday_ratio < 85 else "복합 상권",
            "recommendations": [
                {"rank": "1st", "category": biz_text.split('/')[0], "desc": f"{biz_text} 위주 추천"}
            ],
            "location_grade": "B" if shock_val < 100 else "A" # 방어력 기준 등급 보정
        }
    except Exception as e:
        return {"error": str(e)}

# 6. [신규] 연도별 성장 추이 차트 데이터
@router.get("/station/growth")
async def get_station_growth(station_name: str):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        
        query = text("""
            SELECT base_ym as month, 
                   CAST(monthly_total_passenger AS SIGNED) as passengers,
                   CAST(recovery_rate AS FLOAT) as recovery
            FROM `03_mart_growth_trend`
            WHERE stn_name = :name
            ORDER BY base_ym ASC
        """)
        
        with engine.connect() as conn:
            # 1. pd.read_sql로 데이터프레임 생성
            df = pd.read_sql(query, conn, params={"name": target_name})
        
        # 데이터가 없을 경우 빈 리스트 반환
        if df.empty:
            return []

        # 2. JSON 에러 방지: NaN이나 Infinity를 0.0으로 치환
        # Pandas 기능을 쓰면 훨씬 간단합니다.
        df = df.replace([np.inf, -np.inf], np.nan).fillna(0)
        
        # 3. dict 형태로 변환 (df.to_dict 사용 권장)
        results = df.to_dict(orient="records")
        
        return results
        
    except Exception as e:
        print(f"Growth Chart Error: {e}")
        # 에러 발생 시 500 에러를 던지지 않고 빈 배열을 주어 프론트가 죽지 않게 함
        return []

# --- 기존 3, 4, 5번 엔드포인트 (동일) ---
@router.get("/station/hourly")
async def get_station_hourly(station_name: str, target_month: str, line_num: int = 1):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        start_date = f"{target_month}-01"
        end_date = f"{target_month}-31"
        query = text("""
            SELECT hour, AVG(on_cnt) as avg_on, AVG(off_cnt) as avg_off
            FROM `03_mart_hourly_kpi`
            WHERE stn_name = :name AND line_num = :line AND base_date BETWEEN :start AND :end
            GROUP BY hour ORDER BY hour ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "line": line_num, "start": start_date, "end": end_date})
        return df.to_dict(orient="records")
    except: return []

@router.get("/station/heatmap")
async def get_station_heatmap(station_name: str, target_month: str, line_num: int = 1):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        start_date = f"{target_month}-01"
        end_date = f"{target_month}-31"
        query = text("""
            SELECT DAY(a.base_date) as day, WEEKDAY(a.base_date) as day_of_week,
                   SUM(a.on_cnt + a.off_cnt) as daily_total, COALESCE(h.`공휴일구분`, '') as holiday_name 
            FROM `03_mart_hourly_kpi` a
            LEFT JOIN `00_공휴일` h ON a.base_date = h.`날짜`
            WHERE a.stn_name = :name AND a.line_num = :line AND a.base_date BETWEEN :start AND :end
            GROUP BY a.base_date ORDER BY a.base_date ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "line": line_num, "start": start_date, "end": end_date})
        return df.to_dict(orient="records")
    except: return []

@router.get("/stations")
async def get_all_stations():
    try:
        engine = get_engine()
        query = text("""
            SELECT s.stn_name as display_name, 
                   GROUP_CONCAT(DISTINCT s.line_num ORDER BY s.line_num ASC) as line_list,
                   MAX(p.위도) as lat, MAX(p.경도) as lng
            FROM `03_mart_station_spatial` s
            JOIN `00_위치` p ON REPLACE(s.stn_name, '역', '') = REPLACE(p.역명, '역', '')
            GROUP BY s.stn_name ORDER BY s.stn_name ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        result = df.to_dict(orient="records")
        for item in result:
            item['lines'] = item['line_list'].split(',') if item['line_list'] else []
        return {"data": result}
    except: return {"data": []}