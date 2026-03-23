-- =========================
-- 승차 전체 시간대 INSERT
-- =========================

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '05', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`06:00 이전`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '06', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`06:00-07:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '07', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`07:00-08:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '08', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`08:00-09:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '09', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`09:00-10:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '10', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`10:00-11:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '11', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`11:00-12:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '12', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`12:00-13:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '13', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`13:00-14:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '14', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`14:00-15:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '15', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`15:00-16:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '16', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`16:00-17:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '17', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`17:00-18:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '18', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`18:00-19:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '19', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`19:00-20:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '20', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`20:00-21:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '21', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`21:00-22:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '22', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`22:00-23:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '23', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`23:00-24:00`, 0) + 0, 0 FROM 승차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '24', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), COALESCE(`24:00 이후`, 0) + 0, 0 FROM 승차;

-- =========================
-- 하차 전체 시간대 INSERT
-- =========================

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '05', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`06:00 이전`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '06', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`06:00-07:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '07', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`07:00-08:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '08', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`08:00-09:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '09', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`09:00-10:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '10', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`10:00-11:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '11', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`11:00-12:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '12', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`12:00-13:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '13', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`13:00-14:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '14', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`14:00-15:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '15', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`15:00-16:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '16', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`16:00-17:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '17', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`17:00-18:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '18', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`18:00-19:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '19', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`19:00-20:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '20', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`20:00-21:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '21', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`21:00-22:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '22', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`22:00-23:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '23', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`23:00-24:00`, 0) + 0 FROM 하차;

INSERT INTO raw_subway
SELECT TRIM(`날짜`), '24', TRIM(`역명`), TRIM(REPLACE(`호선`, '호선', '')), 0, COALESCE(`24:00 이후`, 0) + 0 FROM 하차;
