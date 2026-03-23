import urllib.parse
from sqlalchemy import create_engine
from .settings import settings  

def get_engine():
    safe_password = urllib.parse.quote_plus(settings.MARIADB_PASSWORD)
    return create_engine(
        f"mysql+pymysql://{settings.MARIADB_USER}:{safe_password}"
        f"@{settings.MARIADB_HOST}:{settings.MARIADB_PORT}/{settings.MARIADB_DB}?charset=utf8mb4"
    )