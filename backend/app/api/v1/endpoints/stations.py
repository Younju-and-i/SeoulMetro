from fastapi import APIRouter, Query, HTTPException
import pandas as pd
import numpy as np
from sqlalchemy import text
from app.core.database import get_engine

router = APIRouter()

# [도움 함수] 역 이름 컨벤션 통일 (DB에는 '동묘앞역' 형태로 저장됨)
def format_station_name(name: str) -> str:
    if not name: return name
    return name if name.endswith("역") else f"{name}역"

# 1. 가용 날짜 리스트
@router.get("/available-dates")
async def get_available_dates():
    try:
        engine = get_engine()
        query = text("SELECT DISTINCT DATE_FORMAT(base_date, '%Y-%m') as month FROM `03_mart_hourly_kpi` ORDER BY month DESC")
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        return df['month'].tolist()
    except:
        return ["2021-12", "2021-11"]

# 2. 상권 지표 (500 에러 완벽 방어 버전)
@router.get("/station/metrics")
async def get_station_metrics(station_name: str, line_num: int = Query(None)):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        
        # 03_mart_station_profile을 기준으로 정보 결합
        query = text("""
            SELECT 
                p.daily_avg, p.weekday_avg, p.holiday_avg,
                COALESCE(r.total_traffic_score, 0) as total_traffic_score, 
                COALESCE(r.office_score, 0) as office_score, 
                COALESCE(r.night_life_score, 0) as night_life_score, 
                COALESCE(r.recommended_biz, '일반 상권') as recommended_biz,
                COALESCE(g.recovery_rate, 0) as recovery_rate
            FROM `03_mart_station_profile` p
            LEFT JOIN `03_mart_franchise_recommend` r ON p.stn_name = r.stn_name
            LEFT JOIN `03_mart_growth_trend` g ON p.stn_name = g.stn_name
            WHERE p.stn_name = :name
            LIMIT 1
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name})
        
        if df.empty:
            return {
                "main_metrics": {"flow": 0, "resilience": 0, "intensity": 0, "weekend": 0, "growth": 0},
                "summary": {"daily_avg": 0, "weekday_avg": 0, "holiday_ratio": 0, "office_score": 0, "night_score": 0},
                "recommendations": {"biz_type": "데이터 없음", "grade": "N/A"}
            }

        row = df.iloc[0]
        w_avg = float(row['weekday_avg']) if row['weekday_avg'] else 0
        h_avg = float(row['holiday_avg']) if row['holiday_avg'] else 0
        
        # 레이더 차트 수치 정규화
        metrics = {
            "flow": round(min(100, float(row['total_traffic_score']) * 10), 1),
            "resilience": round(min(100, float(row['recovery_rate'])), 1),
            "intensity": round(min(100, float(row['office_score']) * 1.5), 1),
            "weekend": round(min(100, (h_avg / w_avg * 100)), 1) if w_avg > 0 else 0,
            "growth": round(min(100, float(row['recovery_rate']) * 0.9), 1)
        }

        return {
            "main_metrics": metrics,
            "summary": {
                "daily_avg": int(row['daily_avg'] or 0),
                "weekday_avg": int(w_avg),
                "holiday_ratio": round((h_avg / w_avg * 100), 1) if w_avg > 0 else 0,
                "office_score": float(row['office_score']),
                "night_score": float(row['night_life_score'])
            },
            "recommendations": {
                "biz_type": str(row['recommended_biz']),
                "grade": "A" if metrics['flow'] > 75 else ("B" if metrics['flow'] > 40 else "C")
            }
        }
    except Exception as e:
        print(f"Metrics Error: {e}")
        return {"error": str(e)}

# 3. 역 목록 (가나다 순 정렬 및 좌표 정밀화)
@router.get("/stations")
async def get_all_stations():
    try:
        engine = get_engine()
        # ORDER BY s.stn_name ASC 를 명시하여 가나다 순 정렬
        query = text("""
            SELECT s.stn_name as display_name, 
                   GROUP_CONCAT(DISTINCT s.line_num ORDER BY s.line_num ASC) as line_list,
                   MAX(p.위도) as lat, MAX(p.경도) as lng
            FROM `03_mart_station_spatial` s
            JOIN `00_위치` p ON REPLACE(s.stn_name, '역', '') = REPLACE(p.역명, '역', '')
            GROUP BY s.stn_name 
            ORDER BY s.stn_name ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        
        result = df.to_dict(orient="records")
        for item in result:
            item['lines'] = item['line_list'].split(',') if item['line_list'] else []
        return {"data": result}
    except Exception as e:
        return {"data": [], "error": str(e)}

# 4. 시계열 성장 추이 (추가)
@router.get("/station/growth")
async def get_station_growth(station_name: str):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        query = text("SELECT base_ym as month, monthly_total_passenger as passengers, recovery_rate as recovery FROM `03_mart_growth_trend` WHERE stn_name = :name ORDER BY base_ym ASC")
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name})
        return df.replace([np.inf, -np.inf], np.nan).fillna(0).to_dict(orient="records")
    except: return []

# 5. 시간대/히트맵 (기존과 동일하되 안정성 강화)
@router.get("/station/hourly")
async def get_station_hourly(station_name: str, target_month: str):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        query = text("SELECT hour, AVG(on_cnt) as avg_on, AVG(off_cnt) as avg_off FROM `03_mart_hourly_kpi` WHERE stn_name = :name AND base_date LIKE :month GROUP BY hour ORDER BY hour ASC")
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "month": f"{target_month}%"})
        return df.to_dict(orient="records")
    except: return []