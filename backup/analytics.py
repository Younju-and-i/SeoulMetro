from pyspark.sql import functions as F
from pyspark.sql.window import Window

def run_full_analysis(spark, settings):
    # --- 0. 원천 데이터 로드 ---
    # (이미 DB에 '승차', '하차', '공휴일' 테이블이 있다고 가정)
    df_on = spark.read.format("jdbc").options(
        url=f"jdbc:mysql://{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}",
        dbtable="승차", user=settings.MARIADB_USER, password=settings.MARIADB_PASSWORD, driver="com.mysql.cj.jdbc.Driver"
    ).load()
    
    df_off = spark.read.format("jdbc").options(
        url=f"jdbc:mysql://{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}",
        dbtable="하차", user=settings.MARIADB_USER, password=settings.MARIADB_PASSWORD, driver="com.mysql.cj.jdbc.Driver"
    ).load()

    df_hol = spark.read.format("jdbc").options(
        url=f"jdbc:mysql://{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}",
        dbtable="공휴일", user=settings.MARIADB_USER, password=settings.MARIADB_PASSWORD, driver="com.mysql.cj.jdbc.Driver"
    ).load()

    # --- 3.1 & 3.2 순유입 및 PM 집중도 통합 계산 ---
    # PM 시간대: 18시~21시 (퇴근 시간대)
    analysis_base = df_on.alias("on").join(df_off.alias("off"), ["날짜", "역번호", "호선"]) \
        .select(
            "날짜", "역번호", "on.역명", "호선",
            (F.col("off.하차합계") - F.col("on.승차합계")).alias("net_flow"), # 순유입
            ((F.col("on.18:00-19:00") + F.col("on.19:00-20:00") + F.col("on.20:00-21:00")) / F.col("on.승차합계")).alias("pm_concentration"), # PM 집중도
            (F.col("on.승차합계") + F.col("off.하차합계")).alias("total_flow")
        )

    # --- 3.3 변동성 (Volatility) ---
    # 역별 일일 유동인구의 표준편차 / 평균
    volatility_df = analysis_base.groupBy("역번호", "역명").agg(
        (F.stddev("total_flow") / F.avg("total_flow")).alias("volatility")
    )

    # --- 3.4 & 3.5 코로나 충격도 및 회복률 ---
    yearly_traffic = analysis_base.withColumn("year", F.year("날짜")) \
        .groupBy("역번호", "역명", "year").agg(F.avg("total_flow").alias("avg_traffic"))
    
    # pivot을 사용하여 연도별 컬럼 생성 (2019, 2020, 2021)
    covid_df = yearly_traffic.groupBy("역번호", "역명").pivot("year").avg("avg_traffic") \
        .withColumnRenamed("2019", "v2019").withColumnRenamed("2020", "v2020").withColumnRenamed("2021", "v2021") \
        .withColumn("shock_index", (F.col("v2020") - F.col("v2019")) / F.col("v2019")) \
        .withColumn("recovery_rate", (F.col("v2021") - F.col("v2020")) / (F.col("v2019") - F.col("v2020")))

    # --- 3.6 공휴일 민감도 ---
    holiday_df = analysis_base.join(df_hol, "날짜") \
        .withColumn("is_holiday", F.when(F.col("공휴일구분") == "평일", "weekday").otherwise("holiday")) \
        .groupBy("역번호", "역명").pivot("is_holiday").avg("total_flow") \
        .withColumn("holiday_sensitivity", F.col("holiday") - F.col("weekday"))

    # --- 최종 결과 합치기 및 DB 저장 ---
    final_mart = covid_df.join(volatility_df, ["역번호", "역명"]) \
                         .join(holiday_df, ["역번호", "역명"])

    # MariaDB에 'analysis_mart' 테이블로 저장 (HeidiSQL에서 확인 가능)
    final_mart.write.format("jdbc").options(
        url=f"jdbc:mysql://{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}",
        dbtable="analysis_mart", user=settings.MARIADB_USER, password=settings.MARIADB_PASSWORD, driver="com.mysql.cj.jdbc.Driver"
    ).mode("overwrite").save()

    print("✅ 모든 분석 지표가 'analysis_mart' 테이블에 저장되었습니다!")