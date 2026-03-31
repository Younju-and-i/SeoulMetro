# 역할: FastAPI 실행
# 실제 서비스 로직임을 명시


FROM python:3.12-slim
# uv 설치
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /workspace

# 프로젝트 파일 복사
COPY pyproject.toml uv.lock .python-version ./
# 의존성 동기화 (venv 생성)
RUN uv sync --frozen

# 소스 코드 및 필요 파일 복사
COPY app/ ./app/
COPY main.py .
COPY mariadb-java-client-3.5.7.jar .
# uploads 폴더 생성 (볼륨 연결용)
RUN mkdir -p uploads

# 환경 변수 설정
ENV PATH="/workspace/.venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# 실행 명령 (compose의 command와 동일하게 유지)
CMD ["uv", "run", "fastapi", "run", "main.py", "--proxy-headers", "--forwarded-allow-ips", "*"]