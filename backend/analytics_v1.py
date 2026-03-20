# spark에서 계산하는 애들을 여기로 빼 둠
# sql문 안쓰고 강사님이 피드백 주신 방식으로 최대한 함수로 해보려 함

from pyspark.sql import functions as F
from pyspark.sql.window import Window

# 1. 공통 데이터 로드 함수 (DB -> Spark DF)
def load_data(spark, table_name, settings):
    return spark.read.format("jdbc").options(
        url=f"jdbc:mysql://{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}",
        dbtable=table_name,
        user=settings.MARIADB_USER,
        password=settings.MARIADB_PASSWORD,
        driver="com.mysql.cj.jdbc.Driver"
    ).load()

# 2. 순유입 TOP 10 계산 (지표 3.1)
def get_top_net_flow(spark, settings):
    df_on = load_data(spark, "승차", settings)
    df_off = load_data(spark, "하차", settings)

    # 순유입 = 하차 - 승차 (역번호/날짜 기준 조인)
    net_flow_df = df_off.alias("off").join(
        df_on.alias("on"), 
        (F.col("off.날짜") == F.col("on.날짜")) & (F.col("off.역번호") == F.col("on.역번호"))
    ).select(
        F.col("off.역명"),
        (F.col("off.하차합계") - F.col("on.승차합계")).alias("net_flow")
    )

    # 역별 합계 및 정렬
    result = net_flow_df.groupBy("역명").agg(F.sum("net_flow").alias("total_net_flow")) \
        .orderBy(F.desc("total_net_flow")).limit(10)
    
    return result.toPandas().to_dict(orient="records")

# 3. 코로나 충격도 (지표 3.4)
def get_covid_shock_index(spark, settings):
    df_on = load_data(spark, "승차", settings)
    
    # 연도별 평균 유동인구 추출
    yearly_avg = df_on.withColumn("year", F.year("날짜")) \
        .groupBy("year").agg(F.avg("승차합계").alias("avg_vol"))
    
    # 2019년과 2020년 데이터 필터링 후 Shock Index 계산
    vol_2019 = yearly_avg.filter(F.col("year") == 2019).collect()[0]["avg_vol"]
    vol_2020 = yearly_avg.filter(F.col("year") == 2020).collect()[0]["avg_vol"]
    
    shock_index = (vol_2020 - vol_2019) / vol_2019
    return {"shock_index": shock_index}

# 4. 시간대 집중도 (지표 3.2)
def get_time_concentration(spark, settings):
    df_on = load_data(spark, "승차", settings)
    # PM 집중도: 18~21시 / 전체
    res = df_on.select(
        F.avg((F.col("18:00-19:00") + F.col("19:00-20:00") + F.col("20:00-21:00")) / F.col("승차합계")).alias("pm_index")
    )
    return res.toPandas().to_dict(orient="records")