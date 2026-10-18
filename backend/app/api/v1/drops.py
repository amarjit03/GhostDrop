
# app/api/v1/drops.py


import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.drop_limits import (
    CHUNK_SIZE,
    DROP_ID_BYTES,
    DROP_ID_COLLISION_ATTEMPTS,
    OWNER_TOKEN_BYTES,
)
from app.db.dependencies import get_db
from app.db.models.drop import Drop
from app.schemas.drop import CreateDropRequest, CreateDropResponse, DropLimits


router = APIRouter(prefix="/v1/drops", tags=["Drops"])


def _not_found() -> HTTPException:
    # Use the same response for missing drops and invalid tokens.
    return HTTPException(status_code=404, detail={"code": "drop_not_found"})


def _validate_owner_token(drop: Drop | None, token: str | None) -> None:
    # Reject missing credentials without revealing whether the drop exists.
    if drop is None or not token:
        raise _not_found()

    # Hash the supplied token so only its digest is compared with the stored digest.
    supplied_hash = hashlib.sha256(token.encode("utf-8")).digest()

    # Constant-time comparison reduces timing leaks during authentication.
    if not hmac.compare_digest(supplied_hash, drop.owner_token_hash):
        raise _not_found()


def _validate_envelope(data: bytes) -> bool:
    # The envelope has a fixed layout, except for the optional password salt.
    if len(data) not in (49, 65):
        raise HTTPException(status_code=422, detail={"code": "invalid_envelope_length"})

    # Validate the protocol magic and version before accepting the envelope.
    if data[:4] != b"GSDP" or data[4] != 0x01:
        raise HTTPException(status_code=422, detail={"code": "invalid_envelope_header"})

    flags = data[5]

    # Only bit zero is defined; reject unknown flags rather than guessing.
    if flags & ~0x01:
        raise HTTPException(status_code=422, detail={"code": "invalid_envelope_flags"})

    password_mode = bool(flags & 0x01)

    # Password mode adds a 16-byte salt to the 49-byte base envelope.
    expected_length = 65 if password_mode else 49
    if len(data) != expected_length:
        raise HTTPException(status_code=422, detail={"code": "invalid_envelope_length"})

    # Interpret the chunk size as a big-endian unsigned 32-bit integer.
    chunk_size = int.from_bytes(data[6:10], byteorder="big")
    if chunk_size != CHUNK_SIZE:
        raise HTTPException(status_code=422, detail={"code": "invalid_chunk_size"})

    return password_mode


@router.post(
    "",
    response_model=CreateDropResponse,
    status_code=201,
)
async def create_drop(
    payload: CreateDropRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CreateDropResponse:
    # Prevent caches and shared proxies from retaining the one-time owner token.
    response.headers["Cache-Control"] = "no-store"

    # Generate the secret independently of the public drop ID.
    owner_token = secrets.token_urlsafe(OWNER_TOKEN_BYTES)

    # Store only a fixed-length digest; the database never needs the raw token.
    owner_token_hash = hashlib.sha256(owner_token.encode("ascii")).digest()

    for _ in range(DROP_ID_COLLISION_ATTEMPTS):
        # Generate a fresh ID for each attempt so a collision cannot overwrite a drop.
        drop_id = secrets.token_urlsafe(DROP_ID_BYTES)

        # PostgreSQL handles the rare primary-key collision atomically.
        statement = (
            pg_insert(Drop)
            .values(
                id=drop_id,
                kind=payload.kind,
                state="pending",
                owner_token_hash=owner_token_hash,
                ttl_seconds=payload.ttl_seconds,
                max_views=payload.max_views,
            )
            .on_conflict_do_nothing(index_elements=[Drop.id])
            .returning(Drop.id)
        )

        async with db.begin():
            result = await db.execute(statement)
            created_id = result.scalar_one_or_none()

        if created_id is not None:
            # Return the raw token only after the insert transaction succeeds.
            return CreateDropResponse(
                id=created_id,
                owner_token=owner_token,
                limits=DropLimits(),
            )

    # Do not expose database details or generated secrets in the error response.
    from fastapi import HTTPException

    raise HTTPException(
        status_code=503,
        detail={"code": "drop_id_generation_failed"},
    )

@router.put("/{drop_id}/envelope")
async def upload_envelope(
    drop_id: str,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    # Avoid database work for malformed IDs.
    if not drop_id or len(drop_id) > 128:
        raise _not_found()

    # Require the owner token in the Authorization header, never in the URL.
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not token:
        raise _not_found()

    # Lock the row so envelope upload cannot race with finalization.
    result = await db.execute(
        select(Drop)
        .where(Drop.id == drop_id)
        .with_for_update()
    )
    drop = result.scalar_one_or_none()

    _validate_owner_token(drop, token)

    # The envelope can only be attached to a drop that is still pending.
    if drop.state != "pending":
        raise HTTPException(status_code=409, detail={"code": "drop_not_pending"})

    # Read at most 66 bytes: valid envelopes are 49 or 65 bytes.
    # Reading one extra byte lets us reject oversized requests without buffering them.
    data = bytearray()
    async for chunk in request.stream():
        remaining = 66 - len(data)
        data.extend(chunk[:remaining])
        if len(data) > 65 or len(chunk) > remaining:
            raise HTTPException(status_code=413, detail={"code": "envelope_too_large"})

    envelope = bytes(data)
    password_mode = _validate_envelope(envelope)

    # Identical retries are safe; different retries must never overwrite an envelope.
    if drop.envelope is not None:
        if hmac.compare_digest(drop.envelope, envelope):
            response.headers["Cache-Control"] = "no-store"
            return {"status": "ok"}
        raise HTTPException(status_code=409, detail={"code": "envelope_conflict"})

    drop.envelope = envelope
    drop.password_mode = password_mode

    await db.commit()

    response.headers["Cache-Control"] = "no-store"
    return {"status": "ok"}