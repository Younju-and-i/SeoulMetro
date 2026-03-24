DROP TABLE IF EXISTS 03_mart_station_spatial;

CREATE TABLE 03_mart_station_spatial (
    stn_name VARCHAR(100) COMMENT '정제된 역 이름 (역 포함)',
    line_num INT COMMENT '호선 번호 (숫자)',
    total_on_cnt BIGINT COMMENT '전체 기간 승차 인원 합계',
    total_off_cnt BIGINT COMMENT '전체 기간 하차 인원 합계',
    net_flow_cnt BIGINT COMMENT '전체 기간 순유입 (승차-하차)',
    INDEX idx_stn_line (stn_name, line_num)
) COMMENT='지도 시각화용 역별 총괄 지표 마트'
AS
SELECT 
    -- 역명 정제
    CONCAT(TRIM(REPLACE(SUBSTRING_INDEX(r.`station`, '(', 1), '역', '')), '역') AS stn_name,
    -- 호선 숫자화
    CAST(REGEXP_REPLACE(r.`line`, '[^0-9]', '') AS UNSIGNED) AS line_num,
    -- 이미 나누어진 영문 컬럼(boarding, alighting)을 바로 합산
    SUM(r.`boarding`) AS total_on_cnt,
    SUM(r.`alighting`) AS total_off_cnt,
    SUM(r.`boarding`) - SUM(r.`alighting`) AS net_flow_cnt
FROM `01_raw_subway` r
GROUP BY stn_name, line_num;