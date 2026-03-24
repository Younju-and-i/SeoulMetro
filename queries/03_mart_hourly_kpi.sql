DROP TABLE IF EXISTS 03_mart_hourly_kpi;

CREATE TABLE 03_mart_hourly_kpi (
    base_date DATE COMMENT '기준 일자',
    stn_name VARCHAR(100) COMMENT '정제된 역 이름',
    line_num INT COMMENT '호선 번호',
    hour INT COMMENT '시간대 (0~23)',
    on_cnt INT COMMENT '승차 인원',
    off_cnt INT COMMENT '하차 인원',
    -- 업종 선정을 위한 핵심 3대 피크 (하차 기준)
    peak_morning_off INT COMMENT '출근 피크 (07-09시)',
    peak_lunch_off INT COMMENT '점심 피크 (11-13시)',
    peak_evening_off INT COMMENT '저녁/심야 통합 피크 (19-23시)',
    INDEX idx_date_stn_hour (base_date, stn_name, hour)
) COMMENT='프랜차이즈 입지 분석용 3대 피크 타임 마트'
AS
SELECT 
    r.`date` AS base_date,
    CONCAT(TRIM(REPLACE(SUBSTRING_INDEX(r.`station`, '(', 1), '역', '')), '역') AS stn_name,
    CAST(REGEXP_REPLACE(r.`line`, '[^0-9]', '') AS UNSIGNED) AS line_num,
    CAST(REGEXP_REPLACE(r.`hour`, '[^0-9]', '') AS UNSIGNED) AS hour,
    r.`boarding` AS on_cnt,
    r.`alighting` AS off_cnt,
    -- 통합된 시간대별 로직 (19-23시 반영)
    CASE WHEN CAST(REGEXP_REPLACE(r.`hour`, '[^0-9]', '') AS UNSIGNED) BETWEEN 7 AND 9 THEN r.`alighting` ELSE 0 END AS peak_morning_off,
    CASE WHEN CAST(REGEXP_REPLACE(r.`hour`, '[^0-9]', '') AS UNSIGNED) BETWEEN 11 AND 13 THEN r.`alighting` ELSE 0 END AS peak_lunch_off,
    CASE WHEN CAST(REGEXP_REPLACE(r.`hour`, '[^0-9]', '') AS UNSIGNED) BETWEEN 19 AND 23 THEN r.`alighting` ELSE 0 END AS peak_evening_off
FROM `01_raw_subway` r;