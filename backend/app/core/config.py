# backend/app/core/settings.py

from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    """Validated runtime settings loaded from environment variables."""
    
    debug: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # SecretStr helps prevent accidental disclosure when the value is printed.
    database_url: SecretStr

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr) -> SecretStr:
        # Parse the URL rather than relying on a fragile string prefix check.
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
    # Cache settings so the application uses one validated configuration.
    return Settings()