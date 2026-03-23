/* int_subway 생성 */
DROP TABLE IF EXISTS int_subway;

CREATE TABLE int_subway AS
SELECT 
    STR_TO_DATE(r.date, '%Y-%m-%d') AS date,
    r.hour,

    r.station,
    r.line,

    l.station_id,

    r.boarding,
    r.alighting

FROM raw_subway r

LEFT JOIN (
    SELECT 
        TRIM(station_clean) AS station_clean,
        MIN(`역번호`) AS station_id
    FROM 위치
    GROUP BY TRIM(station_clean)
) l

ON 
-- 🔥 핵심: 괄호 제거 + "역" 제거
TRIM(
    REPLACE(
        SUBSTRING_INDEX(r.station, '(', 1),  -- 괄호 앞만
        '역',
        ''
    )
) COLLATE utf8mb4_uca1400_ai_ci

= l.station_clean COLLATE utf8mb4_uca1400_ai_ci;


/* 실패율 검증 쿼리 */
SELECT 
    ROUND(SUM(station_id IS NULL)/COUNT(*)*100,2) AS fail_rate
FROM int_subway;


/* 총합 비교 쿼리 */
SELECT 
    SUM(boarding),
    SUM(alighting)
FROM raw_subway;

SELECT 
    SUM(boarding),
    SUM(alighting)
FROM int_subway;