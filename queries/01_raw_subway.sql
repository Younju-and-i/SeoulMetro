/* raw_subway table 생성 */
USE `seoul_metro`;
CREATE TABLE `raw_subway` AS
SELECT
    b.`date`,
    b.`hour`,
    b.`station`,
    b.`line`,
    b.`boarding`,
    a.`alighting`
FROM (
    -- 🚇 승차 UNPIVOT + 영어 변환
    SELECT 
        `날짜` AS `date`,
        `역명` AS `station`,
        `호선` AS `line`,
        '05' AS `hour`,
        `06:00 이전` AS `boarding`
    FROM `승차`

    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '06', `06:00-07:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '07', `07:00-08:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '08', `08:00-09:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '09', `09:00-10:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '10', `10:00-11:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '11', `11:00-12:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '12', `12:00-13:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '13', `13:00-14:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '14', `14:00-15:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '15', `15:00-16:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '16', `16:00-17:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '17', `17:00-18:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '18', `18:00-19:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '19', `19:00-20:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '20', `20:00-21:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '21', `21:00-22:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '22', `22:00-23:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '23', `23:00-24:00` FROM `승차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '24', `24:00 이후` FROM `승차`
) b
JOIN (
    -- 🚇 하차 UNPIVOT + 영어 변환
    SELECT 
        `날짜` AS `date`,
        `역명` AS `station`,
        `호선` AS `line`,
        '05' AS `hour`,
        `06:00 이전` AS `alighting`
    FROM `하차`

    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '06', `06:00-07:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '07', `07:00-08:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '08', `08:00-09:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '09', `09:00-10:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '10', `10:00-11:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '11', `11:00-12:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '12', `12:00-13:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '13', `13:00-14:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '14', `14:00-15:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '15', `15:00-16:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '16', `16:00-17:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '17', `17:00-18:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '18', `18:00-19:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '19', `19:00-20:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '20', `20:00-21:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '21', `21:00-22:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '22', `22:00-23:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '23', `23:00-24:00` FROM `하차`
    UNION ALL
    SELECT `날짜`, `역명`, `호선`, '24', `24:00 이후` FROM `하차`
) a
ON b.`date` = a.`date`
AND b.`station` = a.`station`
AND b.`line` = a.`line`
AND b.`hour` = a.`hour`;


/* 데이터가 어떻게 들어갔는지 확인하는 용 */
SELECT
    station,
    REPLACE(SUBSTRING_INDEX(station, '(', 1), ' ', '') AS cleaned_station,
    line,
    REGEXP_SUBSTR(line, '[0-9]+') AS cleaned_line
FROM raw_subway
LIMIT 100;


/* 정제를 위한 추가 옵션들 */
UPDATE raw_subway
SET station = REPLACE(station, ' ', '');

UPDATE raw_subway
SET station = SUBSTRING_INDEX(station, '(', 1);

UPDATE raw_subway
SET station = CONCAT(station, '역')
WHERE station NOT LIKE '%역';

UPDATE raw_subway
SET line = REPLACE(line, '호선', '');

UPDATE raw_subway
SET line = TRIM(line);