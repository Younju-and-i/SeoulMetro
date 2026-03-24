CREATE TABLE 03_mart_station_profile AS
WITH agg AS (
	SELECT stn_name,
	      SUM(on_cnt + off_cnt) AS total,
	     -- 인덱스 활용 및 가독성을 위해 단일 SUM 내 연산 최소화
	     SUM(CASE WHEN hour BETWEEN 7 AND 9 THEN on_cnt + off_cnt ELSE 0 END) AS morning,
	     SUM(CASE WHEN hour BETWEEN 11 AND 13 THEN on_cnt + off_cnt ELSE 0 END) AS lunch,
	     SUM(CASE WHEN hour BETWEEN 18 AND 21 THEN on_cnt + off_cnt ELSE 0 END) AS evening,
	     SUM(peak_morning_off) AS morning_off,
	     SUM(peak_evening_off) AS evening_off
	FROM (
		SELECT stn_name, `hour`, sum(on_cnt) AS on_cnt, sum(off_cnt) AS off_cnt, SUM(peak_morning_off) AS peak_morning_off, SUM(peak_evening_off) AS peak_evening_off
		FROM 03_mart_hourly_kpi
		 WHERE base_date BETWEEN '2018-01-01' AND '2021-12-31' 
		  AND (on_cnt > 0 OR off_cnt > 0)
		 GROUP BY stn_name, `hour`) AS t
	 GROUP BY stn_name
	 HAVING total > 0
)
SELECT
    stn_name,
    total AS total_cnt,
    ROUND(morning / total * 100, 2) AS morning_ratio,
    ROUND(lunch / total * 100, 2) AS lunch_ratio,
    ROUND(evening / total * 100, 2) AS evening_ratio,
    -- 중복 로직을 줄이기 위해 비율 계산 결과를 활용하거나 명확한 조건식 배치
    CASE 
        WHEN morning_off > evening_off * 1.3 THEN '오피스형'
        WHEN evening_off > morning_off * 1.3 THEN '상업/유흥형'
        ELSE '혼합형'
    END AS area_type,
    CASE 
        WHEN morning_off > evening_off * 1.3 THEN '샌드위치/커피'
        WHEN evening_off > morning_off * 1.3 THEN '치킨/주점'
        ELSE '일반식당/카페'
    END AS recommended_biz
FROM agg;
 