from pyspark.sql import functions as F
from pyspark.sql.window import Window

def run_full_analysis(spark, settings):
    # --- 0. 원천 데이터 로드 ---
    jdbc_url = f"jdbc:mysql://{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}"
    connection_properties = {
        "user": settings.MARIADB_USER,
        "password": settings.MARIADB_PASSWORD,
        "driver": "com.mysql.cj.jdbc.Driver"
    }

    # 원본 승하차 데이터 로드
    df_on = spark.read.format("jdbc").options(url=jdbc_url, dbtable="승차", **connection_properties).load()
    df_off = spark.read.format("jdbc").options(url=jdbc_url, dbtable="하차", **connection_properties).load()

    # --- 1. 시간대별 데이터 정규화 (03_mart_hourly_kpi) ---
    # 차트용: 각 시간대 컬럼을 행(Row)으로 변환 (Unpivot)
    time_columns = [c for c in df_on.columns if ":" in c]
    
    on_unpivot = df_on.select("날짜", "역명", "호선", 
        F.expr(f"stack({len(time_columns)}, " + ", ".join([f"'{c.split('-')[0]}', `{c}`" for c in time_columns]) + ") as (hour, on_cnt)"))
    
    off_unpivot = df_off.select("날짜", "역명", "호선", 
        F.expr(f"stack({len(time_columns)}, " + ", ".join([f"'{c.split('-')[0]}', `{c}`" for c in time_columns]) + ") as (hour, off_cnt)"))

    hourly_kpi = on_unpivot.join(off_unpivot, ["날짜", "역명", "호선", "hour"]) \
        .select(
            F.col("날짜").alias("base_date"),
            F.col("역명").alias("stn_name"),
            F.col("호선").alias("line_num"),
            F.regexp_replace("hour", ":00", "").cast("int").alias("hour"),
            F.col("on_cnt").cast("int"),
            F.col("off_cnt").cast("int")
        )

    # --- 2. 일자별/역별 합계 데이터 (03_mart_station_spatial) ---
    # 히트맵용: 일별 전체 유동량 계산
    daily_kpi = hourly_kpi.groupBy("base_date", "stn_name", "line_num").agg(
        F.sum("on_cnt").alias("on_sum"),
        F.sum("off_cnt").alias("off_sum"),
        (F.sum("on_cnt") + F.sum("off_cnt")).alias("total_flow")
    )

    # --- 3. 핵심 분석 지표 (analysis_mart) : 2019 vs 2020 집중 ---
    # 코로나 타격 분석을 위해 19년도와 20년도 데이터만 추출
    analysis_base = daily_kpi.withColumn("year", F.year("base_date"))
    
    # 19-20년도 평균 유동량 계산
    covid_df = analysis_base.filter(F.col("year").isin([2019, 2020])) \
        .groupBy("stn_name").pivot("year", [2019, 2020]).avg("total_flow") \
        .select(
            F.col("stn_name"),
            F.col("2019").alias("v2019"),
            F.col("2020").alias("v2020")
        ) \
        .withColumn("shock_index", (F.col("v2020") - F.col("v2019")) / F.col("v2019"))

    # 변동성 지표 (전체 기간 대상)
    volatility_df = analysis_base.groupBy("stn_name").agg(
        (F.stddev("total_flow") / F.avg("total_flow")).alias("volatility")
    )

    # 최종 분석 마트 결합
    final_mart = covid_df.join(volatility_df, "stn_name")

    # --- 4. DB 저장 (Overwrite 모드) ---
    
    # [Table 1] 시간대별 데이터 (FastAPI /station/hourly 대응)
    hourly_kpi.write.format("jdbc").options(url=jdbc_url, dbtable="03_mart_hourly_kpi", **connection_properties).mode("overwrite").save()
    
    # [Table 2] 일별 데이터 (FastAPI /station/heatmap 대응)
    daily_kpi.write.format("jdbc").options(url=jdbc_url, dbtable="03_mart_station_spatial", **connection_properties).mode("overwrite").save()
    
    # [Table 3] 지표 데이터 (FastAPI /station/metrics 대응)
    final_mart.write.format("jdbc").options(url=jdbc_url, dbtable="analysis_mart", **connection_properties).mode("overwrite").save()

    print("✅ 모든 분석 마트(Hourly, Spatial, Analysis)가 19-20년도 기준으로 구축되었습니다!")