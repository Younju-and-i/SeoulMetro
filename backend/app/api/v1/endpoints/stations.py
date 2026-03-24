from fastapi import APIRouter, Query, HTTPException
import pandas as pd
import numpy as np
from sqlalchemy import text
from app.core.database import get_engine

router = APIRouter()

# [도움 함수] 역 이름 컨벤션 통일
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
    except Exception as e:
        print(f"Date Error: {e}")
        return ["2021-12", "2021-11"]

# 2. 상권 지표 (핵심 수정: JOIN 및 CASE문 로직 반영)
# 2. 상권 지표 (에러 방지 강화 버전)
@router.get("/station/metrics")
async def get_station_metrics(station_name: str, line_num: int = Query(3)):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        
        # 1. 기초 통계 조회
        stats_query = text("""
            SELECT 
                AVG(daily_total) as daily_avg,
                STDDEV(daily_total) as daily_std,
                AVG(CASE WHEN WEEKDAY(base_date) < 5 THEN daily_total END) as weekday_avg,
                AVG(CASE WHEN WEEKDAY(base_date) >= 5 THEN daily_total END) as holiday_avg,
                AVG(CASE WHEN YEAR(base_date) = 2019 THEN daily_total END) as v2019,
                AVG(CASE WHEN YEAR(base_date) = 2021 THEN daily_total END) as v2021
            FROM (
                SELECT base_date, SUM(on_cnt + off_cnt) as daily_total
                FROM `03_mart_hourly_kpi`
                WHERE stn_name = :name AND line_num = :line
                GROUP BY base_date
            ) t
        """)

        # 2. 상권 특성 조회
        mart_query = text("""
            SELECT 
                p.morning_ratio, p.evening_ratio,
                r.total_traffic_score, r.office_score, r.night_life_score, r.recommended_biz,
                CASE 
                    WHEN r.office_score > 30 THEN '오피스 집중형'
                    WHEN r.night_life_score > 25 THEN '유흥/상업 중심형'
                    ELSE '주거/복합 상권'
                END AS area_type
            FROM `03_mart_station_profile` p
            LEFT JOIN `03_mart_franchise_recommend` r ON p.stn_name = r.stn_name
            WHERE p.stn_name = :name
            LIMIT 1
        """)
        
        with engine.connect() as conn:
            stats_df = pd.read_sql(stats_query, conn, params={"name": target_name, "line": line_num})
            mart_df = pd.read_sql(mart_query, conn, params={"name": target_name})
        
        # --- [에러 해결 핵심 구간] ---
        # 1. 데이터 자체가 없는 경우 (Series Ambiguous 에러 원천 차단)
        if stats_df.empty:
            return {"error": "데이터가 없습니다.", "analysis_score": 0}

        # 2. iloc[0]으로 한 행만 추출한 뒤, 개별 값이 NaN인지 체크
        s = stats_df.iloc[0]
        if pd.isna(s['daily_avg']):
            return {"error": "조회된 통계값이 없습니다.", "analysis_score": 0}

        # 3. mart_df 처리
        m = mart_df.iloc[0] if not mart_df.empty else None
        
        # --- [안전한 데이터 가공] ---
        daily_avg = float(s['daily_avg'] or 0)
        daily_std = float(s['daily_std'] or 0)
        cv = daily_std / daily_avg if daily_avg > 0 else 0
        
        # 프론트엔드와 100% 일치하는 키값 전달
        return {
            "v2019": int(s['v2019'] or daily_avg),
            "v2021": int(s['v2021'] or daily_avg),
            "weekday_avg": int(s['weekday_avg'] or 0),
            "recovery_rate": round(float(s['v2021'] or 1) / float(s['v2019'] or 1), 2),
            "volatility": round(cv, 3),
            "stability_val": round((1 - cv) * 100, 1),
            "holiday_sensitivity": round(float(s['holiday_avg'] or 0) / float(s['weekday_avg'] or 1), 2), # 추가
            "analysis_score": int(float(m['total_traffic_score'] or 0) * 10) if m is not None else 50,
            "commercial_type": str(m['area_type']) if m is not None else "복합 상권",
            "recommendation_desc": f"{m['recommended_biz'] if m is not None else '일반 음식점'} 추천",
            "location_grade": "A" if (m is not None and float(m['total_traffic_score'] or 0) > 5) else "B",
            "recommendations": [
                {"rank": "1st", "category": "추천", "desc": m['recommended_biz'] if m is not None else "데이터 분석 중"},
                {"rank": "2nd", "category": "특성", "desc": f"오전 유입 {m['morning_ratio'] if m is not None else 0}%"}
            ]
        }
    except Exception as e:
        # 에러 로그를 더 자세히 찍도록 수정
        import traceback
        print(f"Metrics Error Detail: {traceback.format_exc()}")
        return {"error": str(e), "analysis_score": 0}

# 3. 역 목록 (조인 조건 최적화)
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

# 4. 시간대별 패턴 (안정성 강화)
@router.get("/station/hourly")
async def get_station_hourly(station_name: str, target_month: str, line_num: int = Query(3)):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        query = text("""
            SELECT hour, AVG(on_cnt) as avg_on, AVG(off_cnt) as avg_off 
            FROM `03_mart_hourly_kpi` 
            WHERE stn_name = :name 
              AND line_num = :line
              AND DATE_FORMAT(base_date, '%Y-%m') = :month 
            GROUP BY hour ORDER BY hour ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "month": target_month, "line": line_num})
        # NaN 값을 0으로 채워 프론트엔드 에러 방지
        df = df.fillna(0)
        return df.to_dict(orient="records")
    except: return []

# 5. 히트맵 데이터 (날짜 형식 준수)
@router.get("/station/heatmap")
async def get_station_heatmap(station_name: str, target_month: str, line_num: int = Query(3)):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        query = text("""
            SELECT 
                DATE_FORMAT(base_date, '%Y-%m-%d') as date, 
                SUM(on_cnt + off_cnt) as count 
            FROM `03_mart_hourly_kpi` 
            WHERE stn_name = :name 
              AND line_num = :line
              AND DATE_FORMAT(base_date, '%Y-%m') = :month 
            GROUP BY base_date ORDER BY base_date ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "month": target_month, "line": line_num})
        return df.to_dict(orient="records")
    except: return []