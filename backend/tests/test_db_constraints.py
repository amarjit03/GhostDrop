import secrets

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.session import AsyncSessionLocal


def valid_drop_id() -> str:
    return secrets.token_urlsafe(16)


async def insert_drop(
    session,
    *,
    drop_id: str | None = None,
    state: str = "pending",
    max_views: int = 5,
    view_count: int = 0,
    envelope: bytes | None = None,
    password_mode: bool = False,
) -> str:
    drop_id = drop_id or valid_drop_id()

    await session.execute(
        text("""
            INSERT INTO drops (
                id, kind, state, owner_token_hash, envelope,
                password_mode, ttl_seconds, max_views, view_count
            )
            VALUES (
                :id, 'text', :state, :owner_hash, :envelope,
                :password_mode, 3600, :max_views, :view_count
            )
        """),
        {
            "id": drop_id,
            "state": state,
            "owner_hash": secrets.token_bytes(32),
            "envelope": envelope,
            "password_mode": password_mode,
            "max_views": max_views,
            "view_count": view_count,
        },
    )
    return drop_id


@pytest.mark.asyncio
async def test_valid_drop_can_be_inserted():
    async with AsyncSessionLocal() as session:
        async with session.begin():
            drop_id = await insert_drop(session)
            result = await session.execute(
                text("SELECT id FROM drops WHERE id = :id"),
                {"id": drop_id},
            )
            assert result.scalar_one() == drop_id


@pytest.mark.asyncio
async def test_invalid_drop_id_is_rejected():
    async with AsyncSessionLocal() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await insert_drop(session, drop_id="invalid/id")


@pytest.mark.asyncio
async def test_invalid_drop_state_is_rejected():
    async with AsyncSessionLocal() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await insert_drop(session, state="unknown")


@pytest.mark.asyncio
async def test_view_count_cannot_exceed_max_views():
    async with AsyncSessionLocal() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await insert_drop(session, max_views=3, view_count=4)


@pytest.mark.asyncio
async def test_wrong_envelope_length_is_rejected():
    async with AsyncSessionLocal() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await insert_drop(
                    session,
                    envelope=b"x" * 48,
                    password_mode=False,
                )


@pytest.mark.asyncio
async def test_duplicate_record_index_is_rejected():
    async with AsyncSessionLocal() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                drop_id = await insert_drop(session)

                params = {
                    "drop_id": drop_id,
                    "record_type": 0,
                    "is_final": True,
                    "plaintext_len": 10,
                    "frame_bytes": 20,
                    "object_key": f"drops/{drop_id}/0000000",
                }

                statement = text("""
                    INSERT INTO records (
                        drop_id, idx, record_type, is_final,
                        plaintext_len, frame_bytes, object_key
                    )
                    VALUES (
                        :drop_id, 0, :record_type, :is_final,
                        :plaintext_len, :frame_bytes, :object_key
                    )
                """)

                await session.execute(statement, params)
                await session.execute(statement, params)


@pytest.mark.asyncio
async def test_deleting_drop_cascades_to_records():
    async with AsyncSessionLocal() as session:
        async with session.begin():
            drop_id = await insert_drop(session)

            await session.execute(
                text("""
                    INSERT INTO records (
                        drop_id, idx, record_type, is_final,
                        plaintext_len, frame_bytes, object_key
                    )
                    VALUES (
                        :drop_id, 0, 0, TRUE, 10, 20, :object_key
                    )
                """),
                {
                    "drop_id": drop_id,
                    "object_key": f"drops/{drop_id}/0000000",
                },
            )

            await session.execute(
                text("DELETE FROM drops WHERE id = :id"),
                {"id": drop_id},
            )

            result = await session.execute(
                text("SELECT count(*) FROM records WHERE drop_id = :id"),
                {"id": drop_id},
            )
            assert result.scalar_one() == 0
