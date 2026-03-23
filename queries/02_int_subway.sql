/* int_subway 생성 */
DROP TABLE IF EXISTS int_subway;

CREATE TABLE int_subway AS
SELECT 
    -- 날짜 변환
    STR_TO_DATE(r.date, '%Y-%m-%d') AS date,

    r.hour,

    -- 역명 표준화 (핵심)
    CASE 
        WHEN TRIM(r.station) LIKE '%역' THEN TRIM(r.station)
        ELSE CONCAT(TRIM(r.station), '역')
    END AS station,

    r.line,

    -- station_id 매핑
    l.`역번호` AS station_id,

    r.boarding,
    r.alighting

FROM raw_subway r
LEFT JOIN 위치 l
ON (
    CASE 
        WHEN TRIM(r.station) LIKE '%역' THEN TRIM(r.station)
        ELSE CONCAT(TRIM(r.station), '역')
    END
) = TRIM(l.station_clean);