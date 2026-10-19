
import base64
import secrets
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.main import app


@pytest.mark.asyncio
async def test_active_drop_metadata():
    drop_id = secrets.token_urlsafe(16)
    envelope_bytes = b"x" * 49
    expires_at = datetime.now(UTC) + timedelta(hours=1)

    # Create an active drop in the test database.
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    INSERT INTO drops (
                        id, kind, state, owner_token_hash, envelope,
                        password_mode, ttl_seconds, max_views, view_count,
                        record_count, ciphertext_bytes, expires_at
                    )
                    VALUES (
                        :id, 'text', 'active', :owner_hash, :envelope,
                        FALSE, 3600, 5, 2, 2, 120, :expires_at
                    )
                """),
                {
                    "id": drop_id,
                    "owner_hash": secrets.token_bytes(32),
                    "envelope": envelope_bytes,
                    "expires_at": expires_at,
                },
            )

    try:
        # Call the real FastAPI endpoint.
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get(f"/v1/drops/{drop_id}/meta")

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"

        data = response.json()

        # Verify the response contains exactly the public fields.
        assert set(data) == {
            "state",
            "password_required",
            "envelope",
            "record_count",
            "ciphertext_bytes",
            "expires_at",
            "views_remaining",
        }

        assert data["state"] == "active"
        assert data["password_required"] is False
        assert data["envelope"] == (
            base64.urlsafe_b64encode(envelope_bytes)
            .decode("ascii")
            .rstrip("=")
        )
        assert data["record_count"] == 2
        assert data["ciphertext_bytes"] == 120
        assert data["views_remaining"] == 3

        # Private fields must not leak into the response.
        assert "owner_token_hash" not in data
        assert "object_key" not in data
        assert "id" not in data

    finally:
        # Remove the test row even if an assertion fails.
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text("DELETE FROM drops WHERE id = :id"),
                    {"id": drop_id},
                )


@pytest.mark.asyncio
async def test_unavailable_drops_return_same_404():
    drop_ids = {
        "pending": secrets.token_urlsafe(16),
        "consumed": secrets.token_urlsafe(16),
        "expired": secrets.token_urlsafe(16),
    }

    now = datetime.now(UTC)

    # Insert rows that should all be unavailable through the metadata endpoint.
    async with AsyncSessionLocal() as session:
        async with session.begin():
            for state, drop_id in drop_ids.items():
                if state == "expired":
                    created_at = now - timedelta(hours=2)
                    expires_at = now - timedelta(hours=1)
                else:
                    created_at = now
                    expires_at = now + timedelta(hours=1)

                await session.execute(
                    text("""
                        INSERT INTO drops (
                            id,
                            kind,
                            state,
                            owner_token_hash,
                            envelope,
                            password_mode,
                            ttl_seconds,
                            max_views,
                            view_count,
                            record_count,
                            ciphertext_bytes,
                            created_at,
                            expires_at
                        )
                        VALUES (
                            :id,
                            'text',
                            :state,
                            :owner_hash,
                            :envelope,
                            FALSE,
                            3600,
                            5,
                            0,
                            2,
                            120,
                            :created_at,
                            :expires_at
                        )
                    """),
                    {
                        "id": drop_id,
                        "state": state,
                        "owner_hash": secrets.token_bytes(32),
                        "envelope": b"x" * 49,
                        "created_at": created_at,
                        "expires_at": expires_at,
                    },
                )

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            responses = []

            # Pending, consumed, and expired drops.
            for drop_id in drop_ids.values():
                responses.append(
                    await client.get(f"/v1/drops/{drop_id}/meta")
                )

            # A syntactically valid but nonexistent ID.
            responses.append(
                await client.get("/v1/drops/unknown-valid-id/meta")
            )

            # A malformed ID (encoded slash).
            responses.append(
                await client.get("/v1/drops/invalid%2Fid/meta")
            )

        expected_body = {
            "detail": {"code": "drop_not_found"}
        }

        for response in responses:
            assert response.status_code == 404
            assert response.json() == expected_body

        # Every unavailable case must return the same status and body.
        assert len({
            (response.status_code, response.text)
            for response in responses
        }) == 1

    finally:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text("DELETE FROM drops WHERE id = ANY(:ids)"),
                    {"ids": list(drop_ids.values())},
                )
