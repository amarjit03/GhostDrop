
from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    debug: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: SecretStr

    # MinIO / S3-compatible object storage settings.
    minio_endpoint: str = "http://127.0.0.1:9000"
    minio_access_key: SecretStr
    minio_secret_key: SecretStr
    minio_bucket: str = "ghostdrop-records"

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr) -> SecretStr:
        url = make_url(value.get_secret_value())

        if url.drivername != "postgresql+asyncpg":
            raise ValueError(
                "DATABASE_URL must use the postgresql+asyncpg driver"
            )

        if not url.database:
            raise ValueError("DATABASE_URL must specify a database name")

        if not url.host:
            raise ValueError("DATABASE_URL must specify a database host")

        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
