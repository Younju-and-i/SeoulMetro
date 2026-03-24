DROP TABLE IF EXISTS 03_mart_franchise_recommend;

CREATE TABLE 03_mart_franchise_recommend
AS
WITH agg AS (
    SELECT
        DATE_FORMAT(base_date, '%Y-%m-01') AS base_ym,
        stn_name,
        SUM(on_cnt + off_cnt) AS total,
        SUM(off_cnt) AS total_off,
        SUM(peak_morning_off) AS morning_off,
        SUM(peak_evening_off) AS evening_off
    FROM 03_mart_hourly_kpi
    WHERE base_date >= '2017-01-01'
      AND base_date <= '2021-12-31'
    GROUP BY base_ym, stn_name
)
SELECT
    base_ym,
    stn_name,

    -- 1. 전체 유동량 점수
    ROUND(total / 1000000, 2) AS total_traffic_score,

    -- 2. 오피스 점수
    ROUND(morning_off / NULLIF(total_off, 0) * 100, 2) AS office_score,

    -- 3. 야간 소비 점수
    ROUND(evening_off / NULLIF(total_off, 0) * 100, 2) AS night_life_score,

    -- 4. 추천 업종
    CASE 
        WHEN morning_off > evening_off THEN '오피스/카페/조식테이크아웃'
        WHEN evening_off > morning_off THEN '주점/치킨/고깃집'
        ELSE '복합상권/일반음식점'
    END AS recommended_biz

FROM agg;