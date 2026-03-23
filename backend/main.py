from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints import stations  # 위에서 만든 라우터 임포트

app = FastAPI(title="Subway Analysis API")

# [CORS 설정]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [라우터 연결]
# /api라는 접두사를 붙여서 stations.py의 엔드포인트들을 연결합니다.
app.include_router(stations.router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Subway Analysis API is running"}