# 이 파일은 spark를 이용한 `view 만들기`에서 `적재`로 목적이 바뀌었음
# (spark_init_org.py 파일에 강사님 피드백 참고)

from pyspark.sql.functions import col, trim, regexp_replace, expr, when
import pandas as pd
import os

# spark [유동인구] view
def init_spark(spark, engine):
    folder_path = "uploads"   
    file_list = [os.path.abspath(os.path.join(folder_path, f)) for f in os.listdir(folder_path) if f.endswith('.csv')]

    if not file_list:
        return {"status": False, "message": "파일이 없습니다."}

    try:
        first_run = True
        for file_path in sorted(file_list):
            print(f"📂 파일 로드 중: {os.path.basename(file_path)}")
            
            # 1. Pandas로 읽기 (모든 데이터를 문자열로 읽어 타입 충돌 방지)
            pdf = pd.read_csv(file_path, encoding="utf-8", header=0, dtype=str)
            pdf.columns = [c.replace(' ', '') for c in pdf.columns]
            
            spDf = spark.createDataFrame(pdf)
            
            # 2. [핵심] 시간대 컬럼만 정확하게 추출
            # '06~07' 처럼 물결(~)이나 시(시)가 포함된 컬럼만 골라냅니다.
            # '역번호', '날짜', '역명', '구분', '합계' 등은 절대 포함되지 않게 필터링
            exclude_keywords = ['역번호', '날짜', '역명', '구분', '합계', '연번', '호선']
            time_cols = [c for c in spDf.columns if any(char.isdigit() for char in c) 
                         and not any(k in c for k in exclude_keywords)]
            
            print(f"🕒 추출된 시간대 컬럼: {len(time_cols)}개")

            # 3. Stack 구문 생성
            # '{컬럼명}', `{컬럼명}` 쌍을 정확히 맞춥니다.
            stack_expr = ", ".join([f"'{c}', `{c}`" for c in time_cols])
            stack_query = f"stack({len(time_cols)}, {stack_expr}) as (`시간대`, `인원수_temp`)"

            # 4. 데이터 가공 (필요한 컬럼만 명시적으로 선택)
            # '구분' 컬럼이 stack 안으로 빨려 들어가지 않도록 분리합니다.
            df_processed = spDf.select(
                trim(col("날짜")).alias("날짜"),
                col("호선"),
                col("역번호"),
                col("역명"),
                col("구분"), # '구분'은 stack 밖에서 따로 선택
                expr(stack_query) 
            )

            # 5. 인원수 숫자 변환 (에러 방지를 위해 regexp_replace 후 cast)
            df_final = df_processed.withColumn(
                "인원수", 
                regexp_replace(col("인원수_temp"), ",", "").cast("long")
            ).drop("인원수_temp")

            # 6. 날짜별 루프 적재
            distinct_dates = [row['날짜'] for row in df_final.select("날짜").distinct().collect()]
            
            for target_date in sorted(distinct_dates):
                day_pdf = df_final.filter(col("날짜") == target_date).toPandas()
                
                if first_run:
                    day_pdf.to_sql("유동인구_통계2", con=engine, if_exists='replace', index=False)
                    first_run = False
                    print(f"🚀 [유동인구_통계2] 테이블 생성 및 {target_date} 적재...")
                else:
                    day_pdf.to_sql("유동인구_통계2", con=engine, if_exists='append', index=False)
            
            print(f"✅ {os.path.basename(file_path)} 파일 처리 완료!")

        return {"status": "success", "message": "6년치 전체 데이터 적재 성공!"}

    except Exception as e:
        print(f"❌ 에러 발생: {str(e)}")
        return {"status": False, "message": f"오류 발생: {str(e)}"}
    
# spark [년도] view
def init_spark(spark, engine):
    folder_path = "uploads"   
    file_list = [os.path.abspath(os.path.join(folder_path, f)) for f in os.listdir(folder_path) if f.endswith('.csv')]

    if not file_list:
        return {"status": False, "message": "파일이 없습니다."}

    try:
        print("📅 [년도] 마스터 테이블 적재 시작...")
        all_year_data = []

        for file_path in sorted(file_list):
            # 1. 파일 읽기 (메모리 효율을 위해 필요한 컬럼만 추출)
            # 파일마다 컬럼명이 다를 수 있으니 주의!
            pdf = pd.read_csv(file_path, encoding="utf-8", header=0, dtype=str)
            pdf.columns = [c.replace(' ', '') for c in pdf.columns]
            
            # 2. 필요한 컬럼만 추출 (날짜, 역번호 필수 / 공휴일구분은 없을 수도 있음)
            # 공휴일구분 컬럼이 없는 파일은 '평일'로 기본값 세팅
            if '공휴일구분' not in pdf.columns:
                pdf['공휴일구분'] = '평일'
                
            temp_df = pdf[['날짜', '공휴일구분', '역번호']].copy()
            all_year_data.append(temp_df)

        # 3. 모든 연도 데이터 합치기 및 중복 제거
        final_pdf = pd.concat(all_year_data, ignore_index=True)
        
        # 날짜 포맷 통일 (20170101 -> 2017-01-01) 
        # 하이픈(-)이 없는 경우를 대비해 전처리
        final_pdf['날짜'] = final_pdf['날짜'].str.replace('-', '').str.strip()
        final_pdf['날짜'] = final_pdf['날짜'].apply(lambda x: f"{x[:4]}-{x[4:6]}-{x[6:8]}" if len(x) == 8 else x)
        
        # 중복 데이터 제거 (날짜와 역번호가 같은 데이터는 하나만 남김)
        final_pdf = final_pdf.drop_duplicates(['날짜', '역번호'])

        # 4. DB 적재 (테이블명: 년도)
        print(f"🚀 총 {len(final_pdf):,}건의 마스터 데이터를 [년도] 테이블에 넣는 중...")
        
        final_pdf.to_sql(
            name="년도", 
            con=engine, 
            if_exists='replace', 
            index=False, 
            chunksize=10000
        )

        print("✅ [년도] 테이블 적재 완료!")
        return {"status": "success", "message": "년도 마스터 테이블 생성 성공"}

    except Exception as e:
        print(f"❌ [년도] 적재 중 에러: {str(e)}")
        return {"status": False, "message": f"년도 테이블 오류: {str(e)}"}