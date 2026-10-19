
# tests/test_cleanup_cli.py

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.workers import cleanup


def install_fake_dependencies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Prevent tests from initializing real database and storage clients."""
    fake_session = ModuleType("app.db.session")
    fake_session.AsyncSessionLocal = object()  # type: ignore[attr-defined]

    fake_storage = ModuleType("app.storage.minio")
    fake_storage.delete_objects = lambda **kwargs: 0  # type: ignore[attr-defined]
    fake_storage.delete_prefix = lambda **kwargs: 0  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "app.db.session", fake_session)
    monkeypatch.setitem(sys.modules, "app.storage.minio", fake_storage)


@pytest.fixture
def enabled_settings(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    settings = SimpleNamespace(
        cleanup_enabled=True,
        cleanup_interval_seconds=60,
    )
    monkeypatch.setattr(
        "app.core.settings.get_settings",
        lambda: settings,
    )
    return settings


@pytest.mark.asyncio
async def test_cli_once_runs_cleanup(
    enabled_settings: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake_dependencies(monkeypatch)

    worker = AsyncMock(
        return_value=cleanup.CleanupReport(
            drops_purged=2,
            objects_deleted=3,
            errors=0,
        )
    )
    monkeypatch.setattr(cleanup, "run_cleanup_once", worker)

    await cleanup._run_cli(once=True)

    worker.assert_awaited_once()


@pytest.mark.asyncio
async def test_cli_does_not_run_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.core.settings.get_settings",
        lambda: SimpleNamespace(
            cleanup_enabled=False,
            cleanup_interval_seconds=60,
        ),
    )

    worker = AsyncMock()
    monkeypatch.setattr(cleanup, "run_cleanup_once", worker)

    await cleanup._run_cli(once=True)

    worker.assert_not_awaited()


@pytest.mark.asyncio
async def test_cli_once_raises_when_cleanup_has_errors(
    enabled_settings: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_fake_dependencies(monkeypatch)

    worker = AsyncMock(
        return_value=cleanup.CleanupReport(
            drops_purged=1,
            objects_deleted=0,
            errors=1,
        )
    )
    monkeypatch.setattr(cleanup, "run_cleanup_once", worker)

    with pytest.raises(
        RuntimeError,
        match=r"Cleanup finished with 1 error",
    ):
        await cleanup._run_cli(once=True)

    worker.assert_awaited_once()
