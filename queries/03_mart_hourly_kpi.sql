DROP TABLE IF EXISTS 03_mart_hourly_kpi;

CREATE TABLE 03_mart_hourly_kpi
AS
WITH base AS (
    SELECT
        r.`date` AS base_date,
        CONCAT(TRIM(REPLACE(SUBSTRING_INDEX(r.`station`, '(', 1), '역', '')), '역') AS stn_name,
        CAST(REGEXP_REPLACE(r.`line`, '[^0-9]', '') AS UNSIGNED) AS line_num,
        CAST(REGEXP_REPLACE(r.`hour`, '[^0-9]', '') AS UNSIGNED) AS hour,
        r.`boarding` AS on_cnt,
        r.`alighting` AS off_cnt
    FROM 01_raw_subway r
)
SELECT
    base_date,
    stn_name,
    line_num,
    hour,
    on_cnt,
    off_cnt,

    -- peak 계산은 이미 정제된 hour 사용
    CASE WHEN hour BETWEEN 7 AND 9 THEN on_cnt ELSE 0 END AS peak_morning_on,
    CASE WHEN hour BETWEEN 7 AND 9 THEN off_cnt ELSE 0 END AS peak_morning_off,

    CASE WHEN hour BETWEEN 11 AND 13 THEN on_cnt ELSE 0 END AS peak_lunch_on,
    CASE WHEN hour BETWEEN 11 AND 13 THEN off_cnt ELSE 0 END AS peak_lunch_off,

    CASE WHEN hour BETWEEN 19 AND 23 THEN on_cnt ELSE 0 END AS peak_evening_on,
    CASE WHEN hour BETWEEN 19 AND 23 THEN off_cnt ELSE 0 END AS peak_evening_off

FROM base;

-- 인덱스는 나중에 추가
ALTER TABLE 03_mart_hourly_kpi 
ADD INDEX idx_main (base_date, stn_name, hour),
ADD INDEX idx_stn (stn_name);