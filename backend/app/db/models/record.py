# app/db/models/record.py

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Record(Base):
    __tablename__ = "records"

    __table_args__ = (
        CheckConstraint(
            "idx BETWEEN 0 AND 1048576",
            name="ck_records_idx",
        ),
        CheckConstraint(
            "record_type IN (0, 1)",
            name="ck_records_record_type",
        ),
        CheckConstraint(
            "plaintext_len BETWEEN 0 AND 2097152",
            name="ck_records_plaintext_len",
        ),
        CheckConstraint(
            "frame_bytes > 0",
            name="ck_records_frame_bytes",
        ),
        CheckConstraint(
            "object_key ~ '^drops/[A-Za-z0-9_-]{1,128}/[0-9]{7}$'",
            name="ck_records_object_key_format",
        ),
    )

    drop_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("drops.id", ondelete="CASCADE"),
        primary_key=True,
    )

    idx: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    record_type: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
    )

    is_final: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
    )

    plaintext_len: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    frame_bytes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    object_key: Mapped[str] = mapped_column(
        String(256),
        nullable=False,
        unique=True,
    )
