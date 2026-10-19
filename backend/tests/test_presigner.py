
# tests/test_presigner.py

from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from pydantic import SecretStr

from app.core import settings as settings_module
from app.storage import presigner


def test_presigned_url_uses_public_host_and_configured_ttl(
    monkeypatch,
) -> None:
    public_endpoint = "http://localhost:9000"

    fake_settings = SimpleNamespace(
        s3_public_endpoint_url=public_endpoint,
        s3_region="us-east-1",
        minio_access_key=SecretStr("test-access"),
        minio_secret_key=SecretStr("test-secret"),
        minio_bucket="ghostdrop-records",
        presigned_url_ttl_seconds=123,
    )

    monkeypatch.setattr(
        settings_module,
        "get_settings",
        lambda: fake_settings,
    )
    monkeypatch.setattr(
        presigner,
        "get_settings",
        lambda: fake_settings,
    )

    # Ensure the cached client uses this test's endpoint and credentials.
    presigner._get_presigning_client.cache_clear()

    try:
        drop_id = "test_drop-123"
        object_key = presigner.build_record_object_key(drop_id, 0)
        url = presigner.presign_record_get_url(object_key)

        parsed = urlsplit(url)
        query = parse_qs(parsed.query)

        assert parsed.scheme == "http"
        assert parsed.netloc == "localhost:9000"
        assert parsed.path.endswith(
            "/ghostdrop-records/drops/test_drop-123/0000000"
        )
        assert query["X-Amz-Expires"] == ["123"]
        assert "X-Amz-Signature" in query
    finally:
        presigner._get_presigning_client.cache_clear()


def test_record_object_key_format() -> None:
    assert presigner.build_record_object_key(
        "abc_123",
        7,
    ) == "drops/abc_123/0000007"


def test_record_object_key_rejects_invalid_id() -> None:
    try:
        presigner.build_record_object_key("bad/id", 0)
    except ValueError as exc:
        assert str(exc) == "Invalid drop ID"
    else:
        raise AssertionError("Expected invalid drop ID to be rejected")


def test_record_object_key_rejects_negative_index() -> None:
    try:
        presigner.build_record_object_key("valid-id", -1)
    except ValueError as exc:
        assert str(exc) == "Invalid record index"
    else:
        raise AssertionError("Expected negative index to be rejected")
