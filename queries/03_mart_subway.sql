/* mart_subway 생성 */
DROP TABLE IF EXISTS mart_subway;

CREATE TABLE mart_subway AS
SELECT 
    station_id,
    station,
    line,
    hour,

    SUM(boarding) AS boarding,
    SUM(alighting) AS alighting,

    -- 🔥 핵심 지표
    SUM(boarding) - SUM(alighting) AS net_flow

FROM int_subway
WHERE station_id IS NOT NULL   -- 🔥 중요
GROUP BY station_id, station, line, HOUR;

/* 검증 */
SELECT *
FROM mart_subway
ORDER BY net_flow DESC
LIMIT 20;

/* 시간대별 패턴 분석 */
SELECT 
    station,
    SUM(CASE WHEN hour BETWEEN '07' AND '09' THEN boarding ELSE 0 END) AS morning_peak,
    SUM(CASE WHEN hour BETWEEN '18' AND '20' THEN boarding ELSE 0 END) AS evening_peak
FROM mart_subway
GROUP BY station;