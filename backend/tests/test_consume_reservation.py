
# tests/test_consume_reservation.py

import secrets
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.db.consume import reserve_view
from app.db.session import AsyncSessionLocal


async def insert_active_drop(
    session,
    *,
    max_views: int = 3,
    view_count: int = 0,
) -> str:
    drop_id = secrets.token_urlsafe(16)

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
                FALSE, 3600, :max_views, :view_count,
                2, 120, :created_at, :created_at, :expires_at
            )
        """),
        {
            "id": drop_id,
            "owner_hash": secrets.token_bytes(32),
            "envelope": b"x" * 49,
            "max_views": max_views,
            "view_count": view_count,
            "created_at": datetime.now(UTC),
            "expires_at": datetime.now(UTC) + timedelta(hours=1),
        },
    )
    return drop_id


@pytest.mark.asyncio
async def test_reservation_increments_view_count():
    drop_id = secrets.token_urlsafe(16)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            drop_id = await insert_active_drop(
                session,
                max_views=3,
                view_count=0,
            )

            row = await reserve_view(session, drop_id)

            assert row is not None
            assert row["view_count"] == 1
            assert row["max_views"] == 3

            result = await session.execute(
                text("SELECT state FROM drops WHERE id = :id"),
                {"id": drop_id},
            )
            assert result.scalar_one() == "active"


@pytest.mark.asyncio
async def test_final_reservation_consumes_drop():
    async with AsyncSessionLocal() as session:
        async with session.begin():
            drop_id = await insert_active_drop(
                session,
                max_views=1,
                view_count=0,
            )

            row = await reserve_view(session, drop_id)

            assert row is not None
            assert row["view_count"] == 1

            result = await session.execute(
                text("""
                    SELECT state, consumed_at
                    FROM drops
                    WHERE id = :id
                """),
                {"id": drop_id},
            )
            state, consumed_at = result.one()

            assert state == "consumed"
            assert consumed_at is not None


@pytest.mark.asyncio
async def test_consumed_drop_cannot_reserve_another_view():
    async with AsyncSessionLocal() as session:
        async with session.begin():
            drop_id = await insert_active_drop(
                session,
                max_views=1,
                view_count=0,
            )

            first = await reserve_view(session, drop_id)
            second = await reserve_view(session, drop_id)

            assert first is not None
            assert second is None
