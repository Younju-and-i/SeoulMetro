from pydantic_settings import BaseSettings,SettingsConfigDict


class Settings(BaseSettings):
    MARIADB_HOST: str 
    MARIADB_PORT: int
    MARIADB_USER: str
    MARIADB_PASSWORD: str
    MARIADB_DB: str 
    spark_url: str
    host_ip: str
    file_dir: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        )

settings = Settings()