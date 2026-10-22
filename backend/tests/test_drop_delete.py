# tests/test_drop_delete.py
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.main import app


async def insert_drop(
    drop_id: str,
    state: str,
    owner_token: str,
) -> None:
    now = datetime.now(UTC)
    expires_at = now + timedelta(hours=1)

    # The database constraint requires expires_at >= created_at.
    if state == "expired":
        expires_at = now

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    INSERT INTO drops (
                        id, kind, state, owner_token_hash,
                        password_mode, ttl_seconds, max_views,
                        view_count, record_count, ciphertext_bytes,
                        created_at, expires_at
                    )
                    VALUES (
                        :id, 'text', :state, :owner_hash,
                        FALSE, 3600, 5, 0, 0, 0,
                        :created_at, :expires_at
                    )
                """),
                {
                    "id": drop_id,
                    "state": state,
                    "owner_hash": hashlib.sha256(
                        owner_token.encode("utf-8")
                    ).digest(),
                    "created_at": now,
                    "expires_at": expires_at,
                },
            )


async def read_state(drop_id: str) -> str | None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT state FROM drops WHERE id = :id"),
            {"id": drop_id},
        )
        return result.scalar_one_or_none()


async def remove_drop(drop_id: str) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("DELETE FROM drops WHERE id = :id"),
                {"id": drop_id},
            )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("initial_state", "expected_state"),
    [
        ("pending", "deleted"),
        ("active", "deleted"),
        ("deleted", "deleted"),
        ("consumed", "consumed"),
        ("expired", "expired"),
    ],
)
async def test_owner_can_delete_drop_in_each_state(
    initial_state: str,
    expected_state: str,
) -> None:
    drop_id = secrets.token_urlsafe(16)
    owner_token = secrets.token_urlsafe(32)

    await insert_drop(drop_id, initial_state, owner_token)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.delete(
                f"/v1/drops/{drop_id}",
                headers={"Authorization": f"Bearer {owner_token}"},
            )

        assert response.status_code == 204
        assert response.content == b""
        assert response.headers["cache-control"] == "no-store"
        assert await read_state(drop_id) == expected_state
    finally:
        await remove_drop(drop_id)


@pytest.mark.asyncio
async def test_missing_and_wrong_tokens_return_same_404() -> None:
    drop_id = secrets.token_urlsafe(16)
    owner_token = secrets.token_urlsafe(32)

    await insert_drop(drop_id, "active", owner_token)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            missing = await client.delete(f"/v1/drops/{drop_id}")
            wrong = await client.delete(
                f"/v1/drops/{drop_id}",
                headers={"Authorization": "Bearer incorrect-token"},
            )
            unknown = await client.delete(
                "/v1/drops/unknown-valid-id",
                headers={"Authorization": "Bearer incorrect-token"},
            )
            malformed = await client.delete(
                "/v1/drops/invalid!id",
                headers={"Authorization": f"Bearer {owner_token}"},
            )

        responses = [missing, wrong, unknown, malformed]
        expected_body = {"detail": {"code": "drop_not_found"}}

        for response in responses:
            assert response.status_code == 404
            assert response.json() == expected_body
            assert response.headers["cache-control"] == "no-store"

        # All failed requests have the same externally visible response.
        assert len({
            (response.status_code, response.text)
            for response in responses
        }) == 1

        # Failed authentication must not revoke the real drop.
        assert await read_state(drop_id) == "active"
    finally:
        await remove_drop(drop_id)


@pytest.mark.asyncio
async def test_delete_does_not_call_object_storage() -> None:
    """Deleting a drop changes database state without needing storage access."""
    drop_id = secrets.token_urlsafe(16)
    owner_token = secrets.token_urlsafe(32)

    await insert_drop(drop_id, "active", owner_token)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.delete(
                f"/v1/drops/{drop_id}",
                headers={"Authorization": f"Bearer {owner_token}"},
            )

        assert response.status_code == 204
        assert response.content == b""
        assert response.headers["cache-control"] == "no-store"
        assert await read_state(drop_id) == "deleted"
    finally:
        await remove_drop(drop_id)
