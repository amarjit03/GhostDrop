# app/api/v1/drops.py


import asyncio
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
    GCM_TAG_BYTES,
    MAX_METADATA_PLAINTEXT,
    MAX_TEXT_BYTES,
    OWNER_TOKEN_BYTES,
    RECORD_HEADER_BYTES,
)
from app.db.dependencies import get_db
from app.db.models.drop import Drop
from app.db.models.record import Record
from app.schemas.drop import (
    CreateDropRequest,
    CreateDropResponse,
    DropLimits,
    FinalizeDropRequest,
)
from app.storage.minio import (
    delete_record,
    download_record,
    upload_record,
)
from datetime import datetime, timedelta, timezone

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


def _validate_record_frame(data: bytes, path_index: int) -> tuple[int, bool, int]:
    """Validate a text record's public frame structure."""
    if path_index not in (0, 1):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_record_index"},
        )

    if len(data) < RECORD_HEADER_BYTES + GCM_TAG_BYTES:
        raise HTTPException(
            status_code=422,
            detail={"code": "record_too_short"},
        )

    # The first four bytes bind the frame to its requested record index.
    frame_index = int.from_bytes(data[0:4], "big")
    record_type = data[4]
    flags = data[5]
    plaintext_len = int.from_bytes(data[6:10], "big")

    if frame_index != path_index:
        raise HTTPException(
            status_code=422,
            detail={"code": "record_index_mismatch"},
        )

    # Only bit zero is defined in the record flags.
    if flags & ~0x01:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_record_flags"},
        )

    is_final = bool(flags & 0x01)

    # The browser encrypts the plaintext; the API checks lengths, not GCM tags.
    expected_frame_bytes = RECORD_HEADER_BYTES + plaintext_len + GCM_TAG_BYTES
    if len(data) != expected_frame_bytes:
        raise HTTPException(
            status_code=422,
            detail={"code": "record_length_mismatch"},
        )

    if path_index == 0:
        if record_type != 0 or is_final:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_metadata_record"},
            )
        if plaintext_len > MAX_METADATA_PLAINTEXT:
            raise HTTPException(
                status_code=413,
                detail={"code": "metadata_too_large"},
            )
    else:
        if record_type != 1 or not is_final:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_text_record"},
            )
        if plaintext_len > MAX_TEXT_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"code": "text_too_large"},
            )

    return record_type, is_final, plaintext_len


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
    result = await db.execute(select(Drop).where(Drop.id == drop_id).with_for_update())
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


@router.put("/{drop_id}/records/{index}")
async def upload_text_record(
    drop_id: str,
    index: int,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if not drop_id or len(drop_id) > 128 or index not in (0, 1):
        raise (
            _not_found()
            if index not in (0, 1)
            else HTTPException(
                status_code=422,
                detail={"code": "invalid_drop_id"},
            )
        )

    # Require the owner secret in the header, never in a URL.
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _not_found()

    # Authenticate and check state before consuming the request body.
    result = await db.execute(select(Drop).where(Drop.id == drop_id))
    drop = result.scalar_one_or_none()
    _validate_owner_token(drop, token)

    if drop.state != "pending":
        raise HTTPException(
            status_code=409,
            detail={"code": "drop_not_pending"},
        )

    # Bound the stream even if Content-Length is missing or dishonest.
    max_plaintext = MAX_METADATA_PLAINTEXT if index == 0 else MAX_TEXT_BYTES
    max_frame_bytes = RECORD_HEADER_BYTES + max_plaintext + GCM_TAG_BYTES
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > max_frame_bytes:
                raise HTTPException(
                    status_code=413,
                    detail={"code": "record_too_large"},
                )
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_content_length"},
            )

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > max_frame_bytes:
            raise HTTPException(
                status_code=413,
                detail={"code": "record_too_large"},
            )
        body.extend(chunk)

    frame = bytes(body)
    record_type, is_final, plaintext_len = _validate_record_frame(frame, index)

    # Lock and recheck after receiving the body to serialize against finalize.
    result = await db.execute(select(Drop).where(Drop.id == drop_id).with_for_update())
    drop = result.scalar_one_or_none()
    _validate_owner_token(drop, token)

    if drop.state != "pending":
        raise HTTPException(
            status_code=409,
            detail={"code": "drop_not_pending"},
        )

    if drop.kind != "text":
        raise HTTPException(
            status_code=422,
            detail={"code": "unsupported_drop_kind"},
        )

    object_key = f"drops/{drop_id}/{index:07d}"

    existing_result = await db.execute(
        select(Record).where(
            Record.drop_id == drop_id,
            Record.idx == index,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing is not None:
        # Compare exact ciphertext; a retry must not replace an earlier frame.
        stored = await asyncio.to_thread(
            download_record, object_key=existing.object_key
        )
        if hmac.compare_digest(stored, frame):
            response.headers["Cache-Control"] = "no-store"
            return {"status": "ok"}
        raise HTTPException(
            status_code=409,
            detail={"code": "record_conflict"},
        )

    created_object = False

    try:
        # boto3 is synchronous, so keep network I/O off the event loop.
        await asyncio.to_thread(
            upload_record,
            object_key=object_key,
            body=frame,
        )
        created_object = True

        db.add(
            Record(
                drop_id=drop_id,
                idx=index,
                record_type=record_type,
                is_final=is_final,
                plaintext_len=plaintext_len,
                frame_bytes=len(frame),
                object_key=object_key,
            )
        )
        await db.commit()

    except FileExistsError:
        # An object without its DB row can remain after a prior interrupted
        # attempt. Accept it only if its bytes match this exact retry.
        stored = await asyncio.to_thread(download_record, object_key=object_key)
        if not hmac.compare_digest(stored, frame):
            raise HTTPException(
                status_code=409,
                detail={"code": "record_conflict"},
            )

        db.add(
            Record(
                drop_id=drop_id,
                idx=index,
                record_type=record_type,
                is_final=is_final,
                plaintext_len=plaintext_len,
                frame_bytes=len(frame),
                object_key=object_key,
            )
        )
        await db.commit()

    except Exception:
        await db.rollback()

        # Remove only an object this request created, and only after DB failure.
        if created_object:
            try:
                await asyncio.to_thread(delete_record, object_key=object_key)
            except Exception:
                # Leave cleanup to reconciliation if object deletion fails.
                pass
        raise

    response.headers["Cache-Control"] = "no-store"
    return {"status": "ok"}


@router.post("/{drop_id}/finalize")
async def finalize_drop(
    drop_id: str,
    payload: FinalizeDropRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # Reject malformed IDs before querying the database.
    if not drop_id or len(drop_id) > 128:
        raise _not_found()

    # Require the owner token in the Authorization header, never the URL.
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _not_found()

    # Prevent intermediaries and browsers from caching sensitive responses.
    response.headers["Cache-Control"] = "no-store"

    # Lock the drop row so record uploads and finalization cannot race.
    result = await db.execute(
        select(Drop)
        .where(Drop.id == drop_id)
        .with_for_update()
    )
    drop = result.scalar_one_or_none()

    # Missing drops and invalid tokens deliberately produce the same response.
    _validate_owner_token(drop, token)

    # Allow a retry after a successful finalize, but never change its record count.
    if drop.state == "active":
        if drop.record_count != payload.record_count:
            raise HTTPException(
                status_code=409,
                detail={"code": "finalize_conflict"},
            )
        return {"id": drop.id, "expires_at": drop.expires_at}

    # Only pending drops can be finalized for the first time.
    if drop.state != "pending":
        raise HTTPException(
            status_code=409,
            detail={"code": "drop_not_pending"},
        )

    # File drops are not supported by this protocol version yet.
    if drop.kind != "text":
        raise HTTPException(
            status_code=422,
            detail={"code": "unsupported_drop_kind"},
        )

    # Records must not be accepted as a complete drop without an envelope.
    if drop.envelope is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "envelope_missing"},
        )

    # A text drop consists of metadata record 0 and text record 1.
    if payload.record_count != 2:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_record_count"},
        )

    # Load all database records in order; do not trust the submitted count alone.
    records_result = await db.execute(
        select(Record)
        .where(Record.drop_id == drop_id)
        .order_by(Record.idx)
    )
    records = list(records_result.scalars().all())

    # Missing or non-contiguous records mean the upload is not complete.
    if len(records) != 2 or [record.idx for record in records] != [0, 1]:
        raise HTTPException(
            status_code=409,
            detail={"code": "records_incomplete"},
        )

    metadata, text_record = records

    # Verify metadata record structure against the text protocol.
    if (
        metadata.record_type != 0
        or metadata.is_final
        or metadata.plaintext_len > MAX_METADATA_PLAINTEXT
        or metadata.frame_bytes
        != RECORD_HEADER_BYTES + metadata.plaintext_len + GCM_TAG_BYTES
    ):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_metadata_record"},
        )

    # Verify the text record is the final record and has a valid frame size.
    if (
        text_record.record_type != 1
        or not text_record.is_final
        or text_record.plaintext_len > MAX_TEXT_BYTES
        or text_record.frame_bytes
        != RECORD_HEADER_BYTES + text_record.plaintext_len + GCM_TAG_BYTES
    ):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_text_record"},
        )

    # Calculate expiration only when the drop becomes active.
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=drop.ttl_seconds)

    # Update all finalization fields in the same database transaction.
    drop.state = "active"
    drop.finalized_at = now
    drop.expires_at = expires_at
    drop.record_count = len(records)
    drop.ciphertext_bytes = sum(record.frame_bytes for record in records)

    await db.commit()

    return {
        "id": drop.id,
        "expires_at": expires_at,
    }
