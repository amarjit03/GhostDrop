
# app/workers/scheduler.py

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.settings import get_settings
from app.db.session import AsyncSessionLocal
from app.storage import minio as cleanup_storage
from app.workers.cleanup import run_cleanup_once

logger = logging.getLogger(__name__)


def start_cleanup_scheduler() -> AsyncIOScheduler | None:
    """Start periodic cleanup when enabled."""
    settings = get_settings()

    if not settings.cleanup_enabled:
        logger.info("Cleanup scheduler is disabled")
        return None

    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        run_cleanup_once,
        trigger="interval",
        seconds=settings.cleanup_interval_seconds,
        args=[AsyncSessionLocal, cleanup_storage, settings],
        id="drop_cleanup",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=30,
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "Cleanup scheduler started (interval_seconds=%d)",
        settings.cleanup_interval_seconds,
    )

    return scheduler
