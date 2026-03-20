# main.py가 너무 복잡해서 여기로 따로 빼둠

import shutil
import pandas as pd
import holidays
from pathlib import Path
from datetime import datetime
from pyspark.sql import SparkSession
from pyspark.sql.functions import udf
from pyspark.sql.types import StringType, StructField, StructType
from fastapi import FastAPI, BackgroundTasks, File, UploadFile, Query
from spark_init import init_spark
from sqlalchemy import text
from settings import settings
from pyspark.sql import functions as F

# --- 3. 공휴일 생성 및 적재 함수 (Spark 활용) ---
def process_holiday_gen(start_date: str, end_date: str):
    try:
        engine = get_engine()
        # 1. 날짜 범위 생성
        dates = pd.date_range(start=start_date, end=end_date)
        
        # 2. 공휴일 판단 (Pandas 단계에서 처리 - Spark 의존성 제거)
        s_year, e_year = int(start_date[:4]), int(end_date[:4])
        kr_holidays = holidays.KR(years=range(s_year, e_year + 1))

        def get_label(dt):
            if dt in kr_holidays:
                return kr_holidays.get(dt)
            elif dt.weekday() >= 5:
                return "주말"
            else:
                return "평일"

        # Pandas DF 생성
        final_df = pd.DataFrame({
            "날짜": dates.strftime("%Y-%m-%d"),
            "공휴일구분": [get_label(d) for d in dates]
        })

        # 3. DB 적재 (Spark를 거치지 않고 바로 Pandas로 적재)
        final_df.to_sql('tmp_공휴일', con=engine, if_exists='replace', index=False)
        
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO 공휴일 (날짜, 공휴일구분)
                SELECT 날짜, 공휴일구분 FROM tmp_공휴일
                ON DUPLICATE KEY UPDATE 공휴일구분 = VALUES(공휴일구분)
            """))
            conn.execute(text("DROP TABLE tmp_공휴일"))
            
        print(f"✅ {start_date} ~ {end_date} 공휴일 데이터 적재 완료!")
    except Exception as e:
        print(f"❌ 공휴일 처리 중 오류 발생: {e}")

# --- 4. 지하철 데이터 적재 함수 (기존 로직) ---
def process_and_insert(file_path: Path, target_type: str = "승차"):
    try:
        engine = get_engine()
        
        # 1. 헤더 위치 파악 및 데이터 로드
        temp_df = pd.read_csv(str(file_path), encoding="utf-8", nrows=2, header=None)
        header_idx = 0 if '날짜' in str(temp_df.iloc[0]) else 1
        df = pd.read_csv(str(file_path), encoding="utf-8", header=header_idx, dtype=str)
        df.columns = df.columns.str.strip()

        # 2. 진짜 '승하차' 구분 컬럼 찾기
        type_col = None
        for c in df.columns:
            if df[c].astype(str).str.contains(target_type).any():
                type_col = c
                break
        
        if not type_col: return
        df = df[df[type_col].astype(str).str.contains(target_type)].copy()

        # 3. 필수 기본 정보 컬럼 추출
        col_date = next((c for c in df.columns if '날짜' in c), None)
        col_line = next((c for c in df.columns if '호선' in c), None)
        col_id = next((c for c in df.columns if '역번호' in c), None)
        col_name = next((c for c in df.columns if '역명' in c), None)
        
        # 숫자나 특수기호(:, ~)가 포함된 시간대 컬럼만 추출 (합계 제외)
        time_cols = [c for c in df.columns if any(char in c for char in '0123456789:~')]
        time_cols = [c for c in time_cols if '합계' not in c and '날짜' not in c and '번호' not in c]

        # 4. 날짜 변환 (17~21년 모든 형식 대응)
        df[col_date] = df[col_date].astype(str).str.strip()
        try:
            df['날짜_dt'] = pd.to_datetime(df[col_date], format='mixed', dayfirst=True, errors='coerce').dt.date
        except:
            df['날짜_dt'] = pd.to_datetime(df[col_date], dayfirst=True, errors='coerce').dt.date
        
        df = df.dropna(subset=['날짜_dt'])

        # 5. DB 테이블 규격 설정 (합계 컬럼명 동적 변경)
        total_col_name = f"{target_type}합계" # '승차합계' 또는 '하차합계'
        
        final_cols = [
            '날짜', '호선', '역번호', '역명', 
            '06:00 이전', '06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00',
            '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00',
            '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00', '21:00-22:00', '22:00-23:00',
            '23:00-24:00', '24:00 이후', total_col_name
        ]

        processed_df = pd.DataFrame(index=df.index)
        processed_df['날짜'] = df['날짜_dt']
        processed_df['호선'] = df[col_line].astype(str).str.replace('호선', '')
        processed_df['역번호'] = df[col_id]
        processed_df['역명'] = df[col_name]

        # 시간대 데이터 정제 및 20개 컬럼 채우기
        # (2017/2018년은 05시부터 시작하므로 처음 20개를 가져오면 됨)
        for i, target_col in enumerate(final_cols[4:24]):
            if i < len(time_cols):
                source_col = time_cols[i]
                processed_df[target_col] = pd.to_numeric(
                    df[source_col].astype(str).str.replace(r'[",\s]', '', regex=True), 
                    errors='coerce'
                ).fillna(0).astype(int)
            else:
                processed_df[target_col] = 0

        # 해당 테이블에 맞는 합계 계산
        processed_df[total_col_name] = processed_df[final_cols[4:24]].sum(axis=1)

        # 6. DB 적재
        table_name = target_type
        temp_table = f"temp_{target_type}_{file_path.stem}"
        
        processed_df.to_sql(temp_table, con=engine, if_exists='replace', index=False)
        
        col_names_sql = ", ".join([f"`{c}`" for c in final_cols])
        
        with engine.begin() as conn:
            conn.execute(text(f"""
                REPLACE INTO `{table_name}` ({col_names_sql}) 
                SELECT {col_names_sql} FROM `{temp_table}`
            """))
            conn.execute(text(f"DROP TABLE `{temp_table}`"))
        
        print(f"✅ {file_path.name} ({target_type}) 적재 완료! (📈 {len(processed_df):,} 건)")

    except Exception as e:
        print(f"❌ {target_type} 처리 중 오류 발생: {e}")

# --- 5. 지하철 위치 데이터 적재 함수 ---
def process_station_master(file_path: Path):
    try:
        print(f"🔄 station 마스터 데이터 읽기 시도: {file_path.name}")
        
        # 1. Pandas로 직접 읽기 (FastAPI 서버 로컬 파일을 직접 읽으므로 안전함)
        pdf = pd.read_csv(file_path, encoding="utf-8")
        pdf.columns = pdf.columns.str.strip() # 컬럼명 공백 제거

        # 2. 컬럼명 정제 (Spark 코드에서 했던 로직과 동일)
        if "고유역번호(외부역코드)" in pdf.columns:
            pdf = pdf.rename(columns={"고유역번호(외부역코드)": "역번호"})
        
        # 3. DB 적재
        engine = get_engine()
        table_name = "위치"
        
        # 테이블에 먼저 넣기
        pdf.to_sql(f"{table_name}", con=engine, if_exists='replace', index=False)
            
        print(f"✅ station.csv 마스터 데이터 적재 완료! (총 {len(pdf)}개 역)")

    except Exception as e:
        print(f"❌ station 마스터 처리 중 오류 발생: {e}")

# --- 6. 엔드포인트 ---

# 1. 업로드(CSV 넣으면 자동으로 승/하차 테이블)
@app.post("/upload")
async def upload_subway_csv(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    file_path = UPLOAD_DIR / file.filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    background_tasks.add_task(process_and_insert, file_path, "승차")
    background_tasks.add_task(process_and_insert, file_path, "하차")
    return {"status": "success", "message": f"{file.filename} 적재 시작"}

# 위치 업로드
@app.post("/upload-station")
async def upload_station_master_api(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # 1. 파일 저장
    file_path = UPLOAD_DIR / file.filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # 2. 백그라운드 작업 등록 (수정된 Pandas 기반 함수 호출)
    background_tasks.add_task(process_station_master, file_path)
    
    return {"status": "success", "message": f"{file.filename} 역 마스터 데이터 적재 시작"}

# 공휴일 생성
@app.post("/generate-holidays")
async def generate_holidays(
    background_tasks: BackgroundTasks,
    start_date: str = Query(..., example="2017-01-01"),
    end_date: str = Query(..., example="2021-12-31")
):
    # 백그라운드 작업으로 공휴일 생성 등록
    background_tasks.add_task(process_holiday_gen, start_date, end_date)
    return {"status": "success", "message": f"{start_date}~{end_date} 공휴일 생성 작업이 시작되었습니다."}

# Spark 불러서 API에서 씀
@app.get("/api/daily")
def get_daily():
    df = spark.sql("SELECT * FROM daily_flow")
    return df.toPandas().to_dict(orient="records")
    

# 리액트로 JSON 전달
@app.get("/api/station-report/{station_name}")
async def get_station_report(station_name: str):
    # Spark 뷰(yearly_flow)에서 해당 역의 데이터만 추출해서 JSON으로 변환
    report_df = spark.sql(f"""
        SELECT 년도, 날짜, 총유동인구, 공휴일구분 
        FROM yearly_flow 
        WHERE 역명 = '{station_name}'
        ORDER BY 날짜 ASC
    """)
    
    # 리액트가 읽기 좋게 JSON(list of dict)으로 변환
    return report_df.toPandas().to_dict(orient="records")

# --- test용 ---
# @app.get("/test-spark")
# def test_spark():
#     global spark
    
#     df = spark.read.format("jdbc").options(
#         url=f"jdbc:mysql://{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}",
#         dbtable="승차",
#         user=settings.MARIADB_USER,
#         password=settings.MARIADB_PASSWORD,
#         driver="com.mysql.cj.jdbc.Driver"
#     ).load()

#     return {
#         "columns": df.columns,
#         "count": df.count()
#     }

# --- 7. view 용 ---

# [유동인구 view]
@app.get("/test")
def test():
    try:
        result = init_spark(spark, get_engine())
        return {"status": True, "data": result}
    except Exception as e:
        return {"status": False, "message": str(e)}
    
# [년도 view]
@app.get("/test2")
def test():
    try:
        result = init_spark(spark, get_engine())
        return {"status": True, "data": result}
    except Exception as e:
        return {"status": False, "message": str(e)}