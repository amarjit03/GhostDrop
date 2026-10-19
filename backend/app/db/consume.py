
# app/db/consume.py

from sqlalchemy import case, func, select, update
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.drop import Drop
from app.db.models.record import Record


async def reserve_view(
    session: AsyncSession,
    drop_id: str,
) -> RowMapping | None:
    """Atomically reserve one view for an active, unexpired drop."""

    next_view_count = Drop.view_count + 1
    final_view_reserved = next_view_count >= Drop.max_views

    statement = (
        update(Drop)
        .where(
            Drop.id == drop_id,
            Drop.state == "active",
            Drop.expires_at > func.now(),
            Drop.view_count < Drop.max_views,
            )
        .values(
            view_count=next_view_count,
            state=case(
                (final_view_reserved, "consumed"),
                else_=Drop.state,
            ),
            consumed_at=case(
                (final_view_reserved, func.now()),
                else_=Drop.consumed_at,
            ),
        )
        .returning(
            Drop.envelope.label("envelope"),
            Drop.password_mode.label("password_mode"),
            Drop.record_count.label("record_count"),
            Drop.expires_at.label("expires_at"),
            Drop.max_views.label("max_views"),
            Drop.view_count.label("view_count"),
        )
    )

    result = await session.execute(statement)
    return result.mappings().one_or_none()


async def get_records_for_consume(
    session: AsyncSession,
    drop_id: str,
) -> list[RowMapping]:
    """Fetch a drop's record metadata in index order."""

    statement = (
        select(
            Record.idx.label("index"),
            Record.frame_bytes.label("frame_bytes"),
            Record.object_key.label("object_key"),
        )
        .where(Record.drop_id == drop_id)
        .order_by(Record.idx.asc())
    )

    result = await session.execute(statement)
    return list(result.mappings().all())
