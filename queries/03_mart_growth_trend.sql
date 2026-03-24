DROP TABLE IF EXISTS 03_mart_growth_trend;

CREATE TABLE 03_mart_growth_trend
AS
SELECT
    cur.base_ym,
    cur.stn_name,
    cur.monthly_total AS monthly_total_passenger,
    prev.monthly_total AS prev_year_passenger,
    ROUND(cur.monthly_total / NULLIF(prev.monthly_total, 0) * 100, 2) AS recovery_rate
FROM (
    SELECT
        DATE_FORMAT(base_date, '%Y-%m-01') AS base_ym,
        stn_name,
        SUM(on_cnt + off_cnt) AS monthly_total
    FROM 03_mart_daily_trend
    WHERE base_date >= '2017-01-01'
      AND base_date <= '2021-12-31'
    GROUP BY base_ym, stn_name
) cur
LEFT JOIN (
    SELECT
        DATE_FORMAT(base_date, '%Y-%m-01') AS base_ym,
        stn_name,
        SUM(on_cnt + off_cnt) AS monthly_total
    FROM 03_mart_daily_trend
    WHERE base_date >= '2017-01-01'
      AND base_date <= '2021-12-31'
    GROUP BY base_ym, stn_name
) prev
ON cur.stn_name = prev.stn_name
AND cur.base_ym = DATE_ADD(prev.base_ym, INTERVAL 1 YEAR);