# tests/test_cleanup_worker.py

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.workers.cleanup import run_cleanup_once


class FakeStorage:
    def __init__(self, *, failing_prefixes: set[str] | None = None) -> None:
        self.failing_prefixes = failing_prefixes or set()
        self.deleted_keys: list[str] = []
        self.deleted_prefixes: list[str] = []

    def delete_objects(self, *, keys: list[str]) -> int:
        self.deleted_keys.extend(keys)
        return len(keys)

    def delete_prefix(self, *, prefix: str) -> int:
        self.deleted_prefixes.append(prefix)

        if prefix in self.failing_prefixes:
            raise RuntimeError("Simulated storage failure")

        return 0


def cleanup_settings() -> SimpleNamespace:
    return SimpleNamespace(
        pending_ttl_seconds=3600,
        consumed_grace_seconds=600,
        cleanup_max_drops_per_run=10,
    )


async def insert_cleanup_drop(
    drop_id: str,
    *,
    state: str,
    created_at: datetime,
    expires_at: datetime | None,
) -> None:
    owner_token = secrets.token_urlsafe(32)

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
                    "created_at": created_at,
                    "expires_at": expires_at,
                },
            )


async def drop_exists(drop_id: str) -> bool:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT EXISTS (SELECT 1 FROM drops WHERE id = :id)"),
            {"id": drop_id},
        )
        return bool(result.scalar_one())


async def remove_test_drops(drop_ids: list[str]) -> None:
    if not drop_ids:
        return

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("DELETE FROM drops WHERE id = ANY(:ids)"),
                {"ids": drop_ids},
            )


@pytest.mark.asyncio
async def test_cleanup_purges_deleted_drop() -> None:
    now = datetime.now(UTC)
    drop_id = secrets.token_urlsafe(16)

    await insert_cleanup_drop(
        drop_id,
        state="deleted",
        created_at=now - timedelta(hours=2),
        expires_at=now + timedelta(hours=1),
    )

    storage = FakeStorage()

    try:
        report = await run_cleanup_once(
            AsyncSessionLocal,
            storage,
            cleanup_settings(),
        )

        assert report.drops_purged == 1
        assert report.objects_deleted == 0
        assert report.errors == 0
        assert storage.deleted_prefixes == [f"drops/{drop_id}/"]
        assert not await drop_exists(drop_id)
    finally:
        await remove_test_drops([drop_id])


@pytest.mark.asyncio
async def test_cleanup_leaves_ineligible_active_drop() -> None:
    now = datetime.now(UTC)
    drop_id = secrets.token_urlsafe(16)

    await insert_cleanup_drop(
        drop_id,
        state="active",
        created_at=now - timedelta(hours=2),
        expires_at=now + timedelta(hours=1),
    )

    storage = FakeStorage()

    try:
        report = await run_cleanup_once(
            AsyncSessionLocal,
            storage,
            cleanup_settings(),
        )

        assert report.drops_purged == 0
        assert report.errors == 0
        assert storage.deleted_prefixes == []
        assert await drop_exists(drop_id)
    finally:
        await remove_test_drops([drop_id])


@pytest.mark.asyncio
async def test_cleanup_continues_after_storage_failure() -> None:
    now = datetime.now(UTC)
    failed_id = secrets.token_urlsafe(16)
    successful_id = secrets.token_urlsafe(16)

    await insert_cleanup_drop(
        failed_id,
        state="deleted",
        created_at=now - timedelta(hours=3),
        expires_at=now + timedelta(hours=1),
    )
    await insert_cleanup_drop(
        successful_id,
        state="deleted",
        created_at=now - timedelta(hours=2),
        expires_at=now + timedelta(hours=1),
    )

    storage = FakeStorage(
        failing_prefixes={f"drops/{failed_id}/"},
    )

    try:
        report = await run_cleanup_once(
            AsyncSessionLocal,
            storage,
            cleanup_settings(),
        )

        assert report.drops_purged == 1
        assert report.errors == 1
        assert await drop_exists(failed_id)
        assert not await drop_exists(successful_id)
        assert f"drops/{failed_id}/" in storage.deleted_prefixes
        assert f"drops/{successful_id}/" in storage.deleted_prefixes
    finally:
        await remove_test_drops([failed_id, successful_id])