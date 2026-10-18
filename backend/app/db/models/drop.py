# app/db/models/drop.py

from sqlalchemy import (
    TIMESTAMP,
    BigInteger,
    Boolean,
    CheckConstraint,
    Index,
    Integer,
    LargeBinary,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Drop(Base):
    __tablename__ = "drops"

    __table_args__ = (
        Index("ix_drops_state_expires_at", "state", "expires_at"),
        CheckConstraint(
            "id ~ '^[A-Za-z0-9_-]{1,128}$'",
            name="ck_drops_id_format",
        ),
        CheckConstraint(
            "kind IN ('text', 'file')",
            name="ck_drops_kind",
        ),
        CheckConstraint(
            "state IN ('pending', 'active', 'consumed', 'expired', 'deleted')",
            name="ck_drops_state",
        ),
        CheckConstraint(
            "octet_length(owner_token_hash) = 32",
            name="ck_drops_owner_token_hash_length",
        ),
        CheckConstraint(
            "envelope IS NULL OR "
            "(password_mode = FALSE AND octet_length(envelope) = 49) OR "
            "(password_mode = TRUE AND octet_length(envelope) = 65)",
            name="ck_drops_envelope_length",
        ),
        CheckConstraint(
            "ttl_seconds IN (3600, 86400, 604800)",
            name="ck_drops_ttl_seconds",
        ),
        CheckConstraint(
            "max_views BETWEEN 1 AND 100",
            name="ck_drops_max_views",
        ),
        CheckConstraint(
            "view_count BETWEEN 0 AND max_views",
            name="ck_drops_view_count",
        ),
        CheckConstraint(
            "record_count >= 0",
            name="ck_drops_record_count",
        ),
        CheckConstraint(
            "ciphertext_bytes >= 0",
            name="ck_drops_ciphertext_bytes",
        ),
        CheckConstraint(
            "expires_at IS NULL OR expires_at >= created_at",
            name="ck_drops_expiration",
        ),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)

    kind: Mapped[str] = mapped_column(String(16), nullable=False)

    state: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'pending'"),
    )

    owner_token_hash: Mapped[bytes] = mapped_column(
        LargeBinary,
        nullable=False,
    )

    # The encrypted envelope may be absent while the drop is pending.
    envelope: Mapped[bytes | None] = mapped_column(
        LargeBinary,
        nullable=True,
    )

    password_mode: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )

    ttl_seconds: Mapped[int] = mapped_column(Integer, nullable=False)

    max_views: Mapped[int] = mapped_column(Integer, nullable=False)

    view_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )

    record_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )

    ciphertext_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        server_default=text("0"),
    )

    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    finalized_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    expires_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    consumed_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )
