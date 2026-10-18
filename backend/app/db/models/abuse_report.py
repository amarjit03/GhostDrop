# app/db/models/abuse_report.py

from sqlalchemy import (
    TIMESTAMP,
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Identity,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AbuseReport(Base):
    __tablename__ = "abuse_reports"

    __table_args__ = (
        CheckConstraint(
            "length(reason) BETWEEN 1 AND 2000",
            name="ck_abuse_reports_reason_length",
        ),
        CheckConstraint(
            "length(reporter_hash) BETWEEN 1 AND 128",
            name="ck_abuse_reports_reporter_hash_length",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    drop_id: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("drops.id", ondelete="SET NULL"),
        nullable=True,
    )

    reason: Mapped[str] = mapped_column(
        String(2000),
        nullable=False,
    )

    reporter_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    reported_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
