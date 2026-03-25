from fastapi import APIRouter, Query, HTTPException
import pandas as pd
from sqlalchemy import text
from app.core.database import get_engine
import traceback

router = APIRouter()

# [도움 함수] 역 이름 컨벤션 통일
def format_station_name(name: str) -> str:
    if not name:
        return name
    return name if name.endswith("역") else f"{name}역"

# 1. 가용 날짜 리스트
@router.get("/available-dates")
async def get_available_dates():
    try:
        engine = get_engine()
        query = text("SELECT DISTINCT base_ym FROM `03_mart_growth_trend` ORDER BY base_ym DESC")
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        return df['base_ym'].tolist()
    except Exception as e:
        print(f"Date Fetch Error: {e}")
        return ["2021-12", "2021-11", "2020-12", "2019-12"]

# 2. 상권 지표 및 컨설팅 데이터 (최종 보강 버전)
@router.get("/station/metrics")
async def get_station_metrics(
    station_name: str, 
    line_num: int = Query(2), 
    target_year: int = Query(2021) 
):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        
        # 유동인구 분석 쿼리
        analysis_query = text("""
            SELECT 
                stn_name,
                line_num,
                ROUND(AVG(CASE WHEN YEAR(base_date) = :year AND day_label = '평일' THEN (on_cnt + off_cnt) END), 0) AS weekday_avg,
                ROUND(AVG(CASE WHEN YEAR(base_date) = :year THEN (on_cnt + off_cnt) END) - 
                      AVG(CASE WHEN YEAR(base_date) = :year - 1 THEN (on_cnt + off_cnt) END), 0) AS diff_amount,
                ROUND(AVG(CASE WHEN YEAR(base_date) = 2019 THEN (on_cnt + off_cnt) END), 0) AS v2017,
                ROUND(AVG(CASE WHEN YEAR(base_date) = 2019 THEN (on_cnt + off_cnt) END), 0) AS v2018,
                ROUND(AVG(CASE WHEN YEAR(base_date) = 2019 THEN (on_cnt + off_cnt) END), 0) AS v2019,
                ROUND(AVG(CASE WHEN YEAR(base_date) = 2020 THEN (on_cnt + off_cnt) END), 0) AS v2020,
                ROUND(AVG(CASE WHEN YEAR(base_date) = 2020 THEN (on_cnt + off_cnt) END), 0) AS v2021,
                ROUND(STDDEV(CASE WHEN YEAR(base_date) = :year THEN (on_cnt + off_cnt) END) / 
                      NULLIF(AVG(CASE WHEN YEAR(base_date) = :year THEN (on_cnt + off_cnt) END), 0), 3) AS volatility,
                CASE 
                    WHEN (AVG(CASE WHEN YEAR(base_date) = :year THEN (on_cnt + off_cnt) END) / 
                          NULLIF(AVG(CASE WHEN YEAR(base_date) = :year - 1 THEN (on_cnt + off_cnt) END), 0)) > 1.05 THEN '성장기'
                    WHEN (AVG(CASE WHEN YEAR(base_date) = :year THEN (on_cnt + off_cnt) END) / 
                          NULLIF(AVG(CASE WHEN YEAR(base_date) = :year - 1 THEN (on_cnt + off_cnt) END), 0)) BETWEEN 0.95 AND 1.05 THEN '성숙기'
                    ELSE '정체/쇠퇴기'
                END AS market_maturity,
                ROUND(((AVG(CASE WHEN YEAR(base_date) = :year THEN (on_cnt + off_cnt) END) - 
                        AVG(CASE WHEN YEAR(base_date) = :year - 1 THEN (on_cnt + off_cnt) END)) / 
                        NULLIF(AVG(CASE WHEN YEAR(base_date) = :year - 1 THEN (on_cnt + off_cnt) END), 0) * 100), 2) AS growth_rate
            FROM `03_mart_daily_trend`
            WHERE stn_name = :name AND line_num = :line
            GROUP BY stn_name, line_num
        """)

        # 상권 프로필 및 업종 추천 쿼리
        profile_query = text("""
                            SELECT 
                                p.area_type, 
                                r.base_ym, 
                                r.total_traffic_score, 
                                r.office_score, 
                                r.night_life_score, 
                                r.recommended_biz
                            FROM `03_mart_station_profile` p
                            LEFT JOIN `03_mart_franchise_recommend` r 
                                ON p.stn_name = r.stn_name AND YEAR(r.base_ym) = :year
                            WHERE p.stn_name = :name
                            ORDER BY r.base_ym ASC
                        """)
        
        with engine.connect() as conn:
            analysis_res = pd.read_sql(analysis_query, conn, params={"name": target_name, "line": line_num, "year": target_year})
            profile_res = pd.read_sql(profile_query, conn, params={"name": target_name})

        if analysis_res.empty:
            raise HTTPException(status_code=404, detail=f"{target_name}에 대한 분석 데이터를 찾을 수 없습니다.")

        a_row = analysis_res.iloc[0]
        p_row = profile_res.iloc[0] if not profile_res.empty else {}

        # 추천 업종 데이터 가공 (이 부분이 프론트의 '분석 중'을 해결합니다)
        biz_name = p_row.get('recommended_biz')
        office_score = float(p_row.get('office_score', 0) or 0)
        night_score = float(p_row.get('night_life_score', 0) or 0)
        
        recommendations = []
        if biz_name:
            reason = "오피스 상권 중심 전략 추천" if office_score > night_score else "저녁/주말 상권 특화 전략 추천"
            recommendations.append({
                "category": str(biz_name),
                "desc": reason
            })
        else:
            recommendations.append({"category": "데이터 없음", "desc": "추천 업종 정보를 불러올 수 없습니다."})

        # 입지 등급 계산
        traffic = float(p_row.get('total_traffic_score', 0) or 0)
        avg_score = (traffic + office_score + night_score) / 3
        grade = "S" if avg_score >= 19.0 else ("A" if avg_score >= 16.5 else "B")

        # 인사이트 텍스트
        d_amount = int(a_row['diff_amount'] or 0)
        status_text = "감소" if d_amount < 0 else "증가"
        insight = f"{target_name}은 {target_year}년 기준 전년 대비 유동인구가 약 {abs(d_amount):,}명 {status_text}하였습니다."

        return {
            "station_name": str(a_row['stn_name']),
            "weekday_avg": int(a_row['weekday_avg'] or 0),
            "growth_rate": float(a_row['growth_rate'] or 0),
            "diff_amount": d_amount,
            "volatility": float(a_row['volatility'] or 0),
            "market_maturity": str(a_row['market_maturity']),
            "location_grade": grade,
            "analysis_score": round(float(avg_score * 4.4), 1),
            "commercial_type": str(p_row.get('area_type', '복합 상권')),
            "insight_text": insight,
            "v2017": int(a_row['v2017'] or 0), 
            "v2018": int(a_row['v2018'] or 0), 
            "v2019": int(a_row['v2019'] or 0), 
            "v2020": int(a_row['v2020'] or 0),
            "v2021": int(a_row['v2021'] or 0),
            "recovery_rate": round(int(a_row['v2020'] or 0) / int(a_row['v2019'] or 1), 2),
            "recommendations": recommendations  # 리스트 형태로 전달
        }
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"서버 내부 오류: {str(e)}")

# 3. 전체 역 목록
@router.get("/stations")
async def get_stations():
    try:
        engine = get_engine()
        query = text("""
            SELECT 
                s.stn_name as display_name, 
                s.line_num, 
                p.위도 as lat, 
                p.경도 as lng
            FROM `03_mart_station_spatial` s
            JOIN `00_위치` p ON REPLACE(TRIM(s.stn_name), '역', '') = REPLACE(TRIM(p.station_clean), '역', '')
            GROUP BY s.stn_name, s.line_num
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
        return {"data": df.to_dict(orient='records')}
    except Exception as e:
        return {"data": [], "error": str(e)}

# 4. 차트 데이터 (필요할 때만 호출)
@router.get("/station/chart-data")
async def get_station_chart_data(
    station_name: str, 
    target_month: str, 
    line_num: int = Query(...)  # 필수 값으로 변경
):
    try:
        engine = get_engine()
        target_name = format_station_name(station_name)
        # 시간순(ORDER BY hour) 정렬 추가
        query = text("""
            SELECT 
                hour,
                ROUND(AVG(day_on), 0) AS avg_on,
                ROUND(AVG(day_off), 0) AS avg_off
            FROM (
                SELECT 
                    base_date,
                    hour,
                    SUM(on_cnt) AS day_on,
                    SUM(off_cnt) AS day_off
                FROM `03_mart_hourly_kpi`
                WHERE stn_name = :name
                AND line_num = :line
                AND DATE_FORMAT(base_date, '%Y-%m') = :month
                GROUP BY base_date, hour
            ) t
            GROUP BY hour
            ORDER BY hour ASC;
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"name": target_name, "month": target_month, "line": line_num})
        
        if df.empty:
            return []
            
        # 모든 값을 순수 int로 변환하여 리스트로 반환
        return df.astype(int).to_dict(orient="records")
    except Exception as e:
        print(f"Chart Data Error: {e}")
        return []

# 5. 히트맵
@router.get("/station/heatmap")
async def get_station_heatmap(station_name: str, target_month: str):
    try:
        engine = get_engine()
        query = text("""
            SELECT 
                DATE_FORMAT(base_date, '%Y-%m-%d') as date, 
                CAST(SUM(on_cnt + off_cnt) AS SIGNED) as count,
                MAX(day_label) as day_label
            FROM `03_mart_daily_trend`
            WHERE stn_name = :name AND base_date LIKE :month_pattern
            GROUP BY date
            ORDER BY date ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={
                "name": format_station_name(station_name),
                "month_pattern": f"{target_month}%"
            })
        return df.to_dict(orient="records")
    except Exception as e:
        return {"error": str(e)}