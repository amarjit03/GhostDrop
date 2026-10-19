# app/schemas/drop.py

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.drop_limits import (
    CHUNK_SIZE,
    MAX_METADATA_PLAINTEXT,
    MAX_SIZE_HINT,
    MAX_TEXT_BYTES,
)


class CreateDropRequest(BaseModel):
    """Validated public input for reserving a text drop."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["text"] = "text"
    ttl_seconds: Literal[3600, 86400, 604800]
    max_views: int = Field(ge=1, le=100)
    size_hint: int | None = Field(default=None, ge=0, le=MAX_SIZE_HINT)


class DropLimits(BaseModel):
    chunk_size: int = CHUNK_SIZE
    max_metadata_plaintext: int = MAX_METADATA_PLAINTEXT
    max_text_bytes: int = MAX_TEXT_BYTES


class CreateDropResponse(BaseModel):
    id: str
    owner_token: str
    limits: DropLimits


class FinalizeDropRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_count: int = Field(ge=1, le=1_048_577)

class DropMetadataResponse(BaseModel):
    state: Literal["active"]
    password_required: bool
    envelope: str
    record_count: int
    ciphertext_bytes: int
    expires_at: datetime
    views_remaining: int
    


class ConsumeRecordResponse(BaseModel):
    index: int
    frame_bytes: int
    url: str


class DropConsumeResponse(BaseModel):
    envelope: str
    password_required: bool
    record_count: int
    expires_at: datetime
    views_remaining: int
    records: list[ConsumeRecordResponse]
