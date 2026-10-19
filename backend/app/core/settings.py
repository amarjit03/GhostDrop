
# app/core/settings.py

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    debug: bool = False

    model_config = SettingsConfigDict(
    env_file=Path(__file__).resolve().parents[2] / ".env",
    env_file_encoding="utf-8",
    extra="ignore",
)
    database_url: SecretStr

    # Internal endpoint used by the API to communicate with object storage.
    minio_endpoint: str = "http://127.0.0.1:9000"
    minio_access_key: SecretStr
    minio_secret_key: SecretStr
    minio_bucket: str = "ghostdrop-records"

    # Browser-reachable endpoint used when signing download URLs.
    s3_public_endpoint_url: str = "http://localhost:9000"

    # Use "auto" for Cloudflare R2; MinIO commonly uses "us-east-1".
    s3_region: str = "us-east-1"

    # Keep URLs short-lived because anyone holding one can download the object.
    presigned_url_ttl_seconds: int = 300

    # Preserve blobs long enough for already-issued download URLs to work.
    consumed_grace_seconds: int = 600

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

    @model_validator(mode="after")
    def validate_consumed_grace(self) -> "Settings":
        # The cleanup grace must outlast every URL issued by this service.
        if self.consumed_grace_seconds <= self.presigned_url_ttl_seconds:
            raise ValueError(
                "CONSUMED_GRACE_SECONDS must be greater than "
                "PRESIGNED_URL_TTL_SECONDS"
            )

        if self.presigned_url_ttl_seconds < 1:
            raise ValueError("PRESIGNED_URL_TTL_SECONDS must be positive")

        if self.consumed_grace_seconds < 1:
            raise ValueError("CONSUMED_GRACE_SECONDS must be positive")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
