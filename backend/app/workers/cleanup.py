# app/workers/cleanup.py

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic
from typing import Protocol

from sqlalchemy import String, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CleanupSettings(Protocol):
    pending_ttl_seconds: int
    consumed_grace_seconds: int
    cleanup_max_drops_per_run: int


class CleanupStorage(Protocol):
    def delete_objects(self, *, keys: list[str]) -> int: ...

    def delete_prefix(self, *, prefix: str) -> int: ...


@dataclass(frozen=True, slots=True)
class CleanupReport:
    drops_purged: int
    objects_deleted: int
    errors: int


# app/workers/cleanup.py

_CANDIDATE_QUERY = text("""
    SELECT id
    FROM drops
    WHERE id <> ALL(:excluded_ids)
      AND (
          state = 'deleted'
          OR (
              state = 'consumed'
              AND consumed_at < now()
                  - (:grace_seconds * interval '1 second')
          )
          OR (
              state IN ('active', 'expired')
              AND expires_at < now()
                  - (:grace_seconds * interval '1 second')
          )
          OR (
              state = 'pending'
              AND created_at < now()
                  - (:pending_ttl_seconds * interval '1 second')
          )
      )
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
""").bindparams(
    bindparam("excluded_ids", type_=ARRAY(String()))
)


async def run_cleanup_once(
    session_factory: Callable[[], AsyncSession],
    storage: CleanupStorage,
    settings: CleanupSettings,
) -> CleanupReport:
    """Purge eligible drops and their stored objects.

    A failed drop is retried on a later run, not repeatedly in this run.
    """
    started_at = monotonic()
    failed_ids: set[str] = set()
    drops_purged = 0
    objects_deleted = 0
    errors = 0
    attempts = 0

    max_drops = settings.cleanup_max_drops_per_run

    while attempts < max_drops:
        drop_id: str | None = None

        try:
            async with session_factory() as session:
                async with session.begin():
                    result = await session.execute(
                        _CANDIDATE_QUERY,
                        {
                            "excluded_ids": sorted(failed_ids),
                            "grace_seconds": settings.consumed_grace_seconds,
                            "pending_ttl_seconds": (
                                settings.pending_ttl_seconds
                            ),
                        },
                    )
                    drop_id = result.scalar_one_or_none()

                    if drop_id is None:
                        break

                    attempts += 1

                    result = await session.execute(
                        text("""
                            SELECT object_key
                            FROM records
                            WHERE drop_id = :drop_id
                            ORDER BY idx
                        """),
                        {"drop_id": drop_id},
                    )
                    object_keys = list(result.scalars().all())

                    if object_keys:
                        objects_deleted += await asyncio.to_thread(
                            storage.delete_objects,
                            keys=object_keys,
                        )

                    objects_deleted += await asyncio.to_thread(
                        storage.delete_prefix,
                        prefix=f"drops/{drop_id}/",
                    )

                    result = await session.execute(
                        text("DELETE FROM drops WHERE id = :drop_id"),
                        {"drop_id": drop_id},
                    )

                    if result.rowcount != 1:
                        raise RuntimeError(
                            "Expected exactly one drop row to be deleted"
                        )

            drops_purged += 1

        except Exception as exc:
            errors += 1

            if drop_id is None:
                logger.warning(
                    "Cleanup candidate selection failed (error_type=%s)",
                    type(exc).__name__,
                )
                break

            failed_ids.add(drop_id)

            logger.warning(
                "Cleanup failed for one drop (error_type=%s)",
                type(exc).__name__,
            )

    duration_seconds = monotonic() - started_at

    logger.info(
        "Cleanup run finished "
        "(drops_purged=%d, objects_deleted=%d, errors=%d, "
        "duration_seconds=%.3f)",
        drops_purged,
        objects_deleted,
        errors,
        duration_seconds,
    )

    return CleanupReport(
        drops_purged=drops_purged,
        objects_deleted=objects_deleted,
        errors=errors,
    )
    

# app/workers/cleanup.py


# app/workers/cleanup.py

# app/workers/cleanup.py

async def _run_cli(*, once: bool) -> None:
    from app.core.settings import get_settings

    settings = get_settings()

    if not settings.cleanup_enabled:
        logger.info("Cleanup worker is disabled")
        return

    from app.db.session import AsyncSessionLocal
    from app.storage import minio as cleanup_storage

    if once:
        report = await run_cleanup_once(
            AsyncSessionLocal,
            cleanup_storage,
            settings,
        )
        if report.errors:
            raise RuntimeError(
                f"Cleanup finished with {report.errors} error(s)"
            )
        return

    while True:
        report = await run_cleanup_once(
            AsyncSessionLocal,
            cleanup_storage,
            settings,
        )
        if report.errors:
            logger.warning(
                "Continuous cleanup run completed with errors "
                "(errors=%d)",
                report.errors,
            )
        await asyncio.sleep(settings.cleanup_interval_seconds)
        
        
def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Purge eligible GhostDrop records and stored objects."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one cleanup pass and exit.",
    )
    args = parser.parse_args()

    try:
        asyncio.run(_run_cli(once=args.once))
    except KeyboardInterrupt:
        logger.info("Cleanup worker stopped")
    except Exception:
        logger.exception("Cleanup worker terminated with an error")
        raise


if __name__ == "__main__":
    main()
