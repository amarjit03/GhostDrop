
# tests/test_consume_config.py

import pytest
from pydantic import SecretStr, ValidationError

from app.core.settings import Settings
from app.schemas.drop import (
    ConsumeRecordResponse,
    DropConsumeResponse,
)


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": SecretStr(
            "postgresql+asyncpg://user:pass@localhost:5432/ghostdrop"
        ),
        "minio_access_key": SecretStr("test-access"),
        "minio_secret_key": SecretStr("test-secret"),
        "presigned_url_ttl_seconds": 300,
        "consumed_grace_seconds": 600,
    }
    values.update(overrides)
    return Settings(**values)


def test_default_consume_settings() -> None:
    settings = make_settings()

    assert settings.presigned_url_ttl_seconds == 300
    assert settings.consumed_grace_seconds == 600


def test_grace_period_must_exceed_url_ttl() -> None:
    with pytest.raises(ValidationError):
        make_settings(
            presigned_url_ttl_seconds=600,
            consumed_grace_seconds=600,
        )


def test_presigned_url_ttl_must_be_positive() -> None:
    with pytest.raises(ValidationError):
        make_settings(presigned_url_ttl_seconds=0)


def test_consume_response_schema() -> None:
    record = ConsumeRecordResponse(
        index=0,
        frame_bytes=100,
        url="http://localhost:9000/example",
    )
    response = DropConsumeResponse(
        envelope="YWJj",
        password_required=False,
        record_count=1,
        expires_at="2026-10-19T10:00:00Z",
        views_remaining=2,
        records=[record],
    )

    assert set(response.model_dump()) == {
        "envelope",
        "password_required",
        "record_count",
        "expires_at",
        "views_remaining",
        "records",
    }
    assert response.records[0].index == 0
