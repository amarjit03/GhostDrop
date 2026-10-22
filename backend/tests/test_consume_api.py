
# tests/test_consume_api.py

import base64
import secrets
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.main import app


@pytest.mark.asyncio
async def test_consume_rejects_get_method():
    """The consume endpoint must only accept POST requests."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/v1/drops/valid-drop-id/consume"
        )

    assert response.status_code == 405


@pytest.mark.asyncio
async def test_unknown_drop_returns_generic_404():
    """Unknown drop IDs must return the generic not-found response."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/v1/drops/unknown-valid-id/consume"
        )

    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "drop_not_found"}
    }
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_malformed_drop_id_returns_generic_404():
    """Malformed IDs must not reveal whether a drop exists."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/v1/drops/invalid!id/consume"
        )

    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "drop_not_found"}
    }
    assert response.headers["cache-control"] == "no-store"

@pytest.mark.asyncio
async def test_successful_consume_returns_public_response(monkeypatch):
    """A valid consume request returns records and reserves one view."""
    from app.api.v1 import drops as drops_api

    drop_id = secrets.token_urlsafe(16)
    envelope_bytes = b"x" * 49
    expires_at = datetime.now(UTC) + timedelta(hours=1)

    # Create an active drop with one record.
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    INSERT INTO drops (
                        id, kind, state, owner_token_hash, envelope,
                        password_mode, ttl_seconds, max_views, view_count,
                        record_count, ciphertext_bytes, created_at,
                        finalized_at, expires_at
                    )
                    VALUES (
                        :id, 'text', 'active', :owner_hash, :envelope,
                        FALSE, 3600, 3, 0, 1, 100, :created_at,
                        :created_at, :expires_at
                    )
                """),
                {
                    "id": drop_id,
                    "owner_hash": secrets.token_bytes(32),
                    "envelope": envelope_bytes,
                    "created_at": datetime.now(UTC),
                    "expires_at": expires_at,
                },
            )

            await session.execute(
                text("""
                    INSERT INTO records (
                        drop_id, idx, record_type, is_final,
                        plaintext_len, frame_bytes, object_key
                    )
                    VALUES (
                        :drop_id, 0, 0, TRUE,
                        84, 100, :object_key
                    )
                """),
                {
                    "drop_id": drop_id,
                    "object_key": f"drops/{drop_id}/0000000",
                },
            )

    # Avoid contacting MinIO; assert the endpoint uses the expected key.
    def fake_presign(object_key: str) -> str:
        assert object_key == f"drops/{drop_id}/0000000"
        return "https://storage.example.test/signed-record"

    monkeypatch.setattr(
        drops_api,
        "presign_record_get_url",
        fake_presign,
    )

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                f"/v1/drops/{drop_id}/consume"
            )

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"

        data = response.json()

        # Only public response fields should be returned.
        assert set(data) == {
            "envelope",
            "password_required",
            "record_count",
            "expires_at",
            "views_remaining",
            "records",
        }

        assert data["envelope"] == (
            base64.urlsafe_b64encode(envelope_bytes)
            .decode("ascii")
            .rstrip("=")
        )
        assert data["password_required"] is False
        assert data["record_count"] == 1
        assert data["views_remaining"] == 2
        assert data["records"] == [
            {
                "index": 0,
                "frame_bytes": 100,
                "url": "https://storage.example.test/signed-record",
            }
        ]

        # Internal fields must not leak into the response.
        assert "owner_token_hash" not in data
        assert "object_key" not in response.text
        assert drop_id not in response.text

        # The successful request must reserve exactly one view.
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT view_count, state
                    FROM drops
                    WHERE id = :id
                """),
                {"id": drop_id},
            )
            view_count, state = result.one()

        assert view_count == 1
        assert state == "active"

    finally:
        # Delete the drop; the record is removed by its foreign key cascade
        # if the database schema defines that cascade.
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text("DELETE FROM records WHERE drop_id = :id"),
                    {"id": drop_id},
                )
                await session.execute(
                    text("DELETE FROM drops WHERE id = :id"),
                    {"id": drop_id},
                )

@pytest.mark.asyncio
async def test_consume_rolls_back_when_presigning_fails(monkeypatch):
    """A presigning failure must not consume a view."""
    from app.api.v1 import drops as drops_api

    drop_id = secrets.token_urlsafe(16)
    expires_at = datetime.now(UTC) + timedelta(hours=1)
    created_at = datetime.now(UTC)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    INSERT INTO drops (
                        id, kind, state, owner_token_hash, envelope,
                        password_mode, ttl_seconds, max_views, view_count,
                        record_count, ciphertext_bytes, created_at,
                        finalized_at, expires_at
                    )
                    VALUES (
                        :id, 'text', 'active', :owner_hash, :envelope,
                        FALSE, 3600, 3, 0, 1, 100, :created_at,
                        :created_at, :expires_at
                    )
                """),
                {
                    "id": drop_id,
                    "owner_hash": secrets.token_bytes(32),
                    "envelope": b"x" * 49,
                    "created_at": created_at,
                    "expires_at": expires_at,
                },
            )
            await session.execute(
                text("""
                    INSERT INTO records (
                        drop_id, idx, record_type, is_final,
                        plaintext_len, frame_bytes, object_key
                    )
                    VALUES (
                        :drop_id, 0, 0, TRUE, 84, 100, :object_key
                    )
                """),
                {
                    "drop_id": drop_id,
                    "object_key": f"drops/{drop_id}/0000000",
                },
            )

    def fail_presign(object_key: str) -> str:
        raise RuntimeError("simulated presigning failure")

    monkeypatch.setattr(
        drops_api,
        "presign_record_get_url",
        fail_presign,
    )

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                f"/v1/drops/{drop_id}/consume"
            )

        assert response.status_code == 500
        assert response.json() == {
            "detail": {"code": "internal_error"}
        }
        assert response.headers["cache-control"] == "no-store"

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT view_count, state
                    FROM drops
                    WHERE id = :id
                """),
                {"id": drop_id},
            )
            row = result.one()

        assert row.view_count == 0
        assert row.state == "active"

    finally:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text("DELETE FROM drops WHERE id = :id"),
                    {"id": drop_id},
                )

@pytest.mark.asyncio
async def test_encoded_slash_drop_id_returns_generic_404():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/v1/drops/invalid%2Fid/consume"
        )

    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "drop_not_found"}
    }
    assert response.headers["cache-control"] == "no-store"