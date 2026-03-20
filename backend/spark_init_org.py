# 채훈이 학습용으로 남긴 파일
# 추후 프로젝트에서는 빼야되는 파일

from pyspark.sql.functions import col, trim, regexp_replace, sum
import pandas as pd
import os

def init_spark(spark):

    folder_path = "uploads"   
    file_list = [os.path.abspath(os.path.join(folder_path, f)) for f in os.listdir(folder_path)]

    if len(file_list) > 0:
        df = pd.read_csv(file_list[0], encoding="utf-8", header=0, thousands=',', quotechar='"', skipinitialspace=True)
        spDf = spark.createDataFrame(df)
        spDf.createOrReplaceTempView("subway_data")

        df_cleaned = spDf.select(
            trim(col("날짜")).alias("년도"), 
            regexp_replace(trim(col("합 계")), ",", "").cast("long").alias("유동인구"))
        df_result = df_cleaned.groupby("년도").agg(sum("유동인구").alias("총_유동인구")).orderBy("년도")
        print( df_result.show(5) )
        print( df_result.count() )
        
        # 강사님 피드백: 
        # 시각화 할 때를 생각하면 HeidiSQL에 [년도]랑 [유동인구] 테이블에 directly 데이터를 넣는게 좋을 것 같다 하심
        # 사유: 이렇게 뷰 형식으로 하면 너무 오래 걸림 (365일*6년 데이터양 너무 빡세서 limit 줘도 의미 없을거 같음)
        # 핵심: 시각화를 할 때 spark를 돌리면 시간이 너무 오래 걸리니까 (적재까지만) 이 때는 DB 테이블을 사용한다
        # => 적재 및 정제는 spark, 시각화는 db
        # return df_result.limit(50).toPandas().to_dict(orient="records") 
        return df_result.toPandas().to_dict(orient="records") 
    return None