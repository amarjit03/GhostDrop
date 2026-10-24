#!/usr/bin/env python3
"""Independent Python producer/consumer for Ghostdrop v1 text-drop interop tests.

Wire bytes are handled explicitly here; crypto primitives come from cryptography.
Input/output JSON represents byte strings as arrays of integers so the script has
no dependency on a particular base64 library or application serializer.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

MAGIC = b"GSDP"
VERSION = 1
CHUNK_SIZE = 2 * 1024 * 1024
NONCE_PREFIX_BYTES = 7
KDF_SALT_BYTES = 32
TAG_BYTES = 16
HEADER_BYTES = 10
MAX_METADATA_BYTES = 65_536
MAX_TEXT_BYTES = CHUNK_SIZE
AAD_DOMAIN = b"Ghostdrop/AEAD/v1"
HKDF_INFO = b"Ghostdrop/v1/content-encryption-key"
DROP_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def cbor_uint(value: int) -> bytes:
    if value < 0:
        raise ValueError("CBOR unsigned integer cannot be negative")
    if value < 24:
        return bytes([value])
    if value <= 0xFF:
        return b"\x18" + bytes([value])
    if value <= 0xFFFF:
        return b"\x19" + value.to_bytes(2, "big")
    if value <= 0xFFFFFFFF:
        return b"\x1a" + value.to_bytes(4, "big")
    return b"\x1b" + value.to_bytes(8, "big")


def cbor_text(value: str) -> bytes:
    raw = value.encode("utf-8", errors="strict")
    length = len(raw)
    if length < 24:
        prefix = bytes([0x60 | length])
    elif length <= 0xFF:
        prefix = b"\x78" + bytes([length])
    elif length <= 0xFFFF:
        prefix = b"\x79" + length.to_bytes(2, "big")
    else:
        prefix = b"\x7a" + length.to_bytes(4, "big")
    return prefix + raw


def encode_text_metadata(size: int) -> bytes:
    # Canonical CBOR map with integer keys 0..5 in ascending order.
    return (
        b"\xa6"
        + b"\x00\x01"  # contentKind = text
        + b"\x01\x60"  # filename = ""
        + b"\x02" + cbor_text("text/plain")
        + b"\x03" + cbor_uint(size)
        + b"\x04\x01"  # exactly one data record, including empty text
        + b"\x05\x01"  # schema version
    )


def make_nonce(prefix: bytes, index: int, final_flag: int) -> bytes:
    if len(prefix) != NONCE_PREFIX_BYTES or not 0 <= index <= 0xFFFFFFFF or final_flag not in (0, 1):
        raise ValueError("Invalid nonce parameters")
    return prefix + index.to_bytes(4, "big") + bytes([final_flag])


def make_aad(drop_id: str, record_type: int, index: int, final_flag: int, plaintext_length: int) -> bytes:
    if not DROP_ID_RE.fullmatch(drop_id):
        raise ValueError("Invalid drop ID")
    drop_id_bytes = drop_id.encode("ascii")
    if record_type not in (0, 1) or not 0 <= index <= 0xFFFFFFFF or final_flag not in (0, 1):
        raise ValueError("Invalid AAD record fields")
    if not 0 <= plaintext_length <= 0xFFFFFFFF:
        raise ValueError("Invalid plaintext length")
    return (
        AAD_DOMAIN + b"\x00" + bytes([VERSION])
        + len(drop_id_bytes).to_bytes(2, "big") + drop_id_bytes
        + bytes([record_type]) + index.to_bytes(4, "big") + bytes([final_flag])
        + plaintext_length.to_bytes(4, "big") + CHUNK_SIZE.to_bytes(4, "big")
    )


def encode_frame(index: int, record_type: int, final_flag: int, plaintext: bytes, key: bytes, prefix: bytes, drop_id: str) -> bytes:
    aad = make_aad(drop_id, record_type, index, final_flag, len(plaintext))
    body = AESGCM(key).encrypt(make_nonce(prefix, index, final_flag), plaintext, aad)
    return index.to_bytes(4, "big") + bytes([record_type, final_flag]) + len(plaintext).to_bytes(4, "big") + body


def derive_key(url_key: bytes, salt: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=HKDF_INFO).derive(url_key)


def to_json(key_fragment: str, drop_id: str, envelope: bytes, stream: bytes) -> dict[str, Any]:
    return {
        "keyFragment": key_fragment,
        "payload": {
            "dropId": drop_id,
            "envelope": list(envelope),
            "stream": list(stream),
        },
    }


def from_json(value: Any) -> tuple[str, str, bytes, bytes]:
    if not isinstance(value, dict) or not isinstance(value.get("payload"), dict):
        raise ValueError("Expected text-drop JSON object")
    fragment = value.get("keyFragment")
    payload = value["payload"]
    drop_id = payload.get("dropId")
    if not isinstance(fragment, str) or not fragment.startswith("#"):
        raise ValueError("Invalid URL key fragment")
    encoded = fragment[1:]
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", encoded):
        raise ValueError("Invalid URL key fragment")
    url_key = base64.urlsafe_b64decode(encoded + "=")
    if len(url_key) != 32:
        raise ValueError("Invalid URL key length")
    if not isinstance(drop_id, str) or not DROP_ID_RE.fullmatch(drop_id):
        raise ValueError("Invalid drop ID")
    def byte_array(name: str) -> bytes:
        data = payload.get(name)
        if not isinstance(data, list) or any(type(x) is not int or x < 0 or x > 255 for x in data):
            raise ValueError(f"Invalid {name} byte array")
        return bytes(data)
    return fragment, drop_id, byte_array("envelope"), byte_array("stream")


def parse_frames(stream: bytes) -> list[tuple[int, int, int, int, bytes]]:
    frames = []
    offset = 0
    while offset < len(stream):
        if len(stream) - offset < HEADER_BYTES:
            raise ValueError("Truncated frame header")
        header = stream[offset:offset + HEADER_BYTES]
        index = int.from_bytes(header[0:4], "big")
        record_type, final_flag = header[4], header[5]
        plaintext_length = int.from_bytes(header[6:10], "big")
        if record_type not in (0, 1) or final_flag not in (0, 1):
            raise ValueError("Invalid frame type or final flag")
        body_length = plaintext_length + TAG_BYTES
        end = offset + HEADER_BYTES + body_length
        if end > len(stream):
            raise ValueError("Truncated frame body")
        body = stream[offset + HEADER_BYTES:end]
        frames.append((index, record_type, final_flag, plaintext_length, body))
        offset = end
    if offset != len(stream):
        raise ValueError("Trailing bytes")
    return frames


def parse_envelope(envelope: bytes) -> tuple[bytes, bytes]:
    if len(envelope) != 49 or envelope[:4] != MAGIC or envelope[4] != VERSION or envelope[5] != 0:
        raise ValueError("Invalid no-password v1 envelope")
    if int.from_bytes(envelope[6:10], "big") != CHUNK_SIZE:
        raise ValueError("Invalid chunk size")
    return envelope[10:17], envelope[17:49]


def decrypt_text(value: Any) -> str:
    fragment, drop_id, envelope, stream = from_json(value)
    prefix, salt = parse_envelope(envelope)
    url_key = base64.urlsafe_b64decode(fragment[1:] + "=")
    key = derive_key(url_key, salt)
    frames = parse_frames(stream)
    if len(frames) != 2:
        raise ValueError("Text drop must contain exactly two records")
    meta_frame, data_frame = frames
    for expected, frame, record_type, final_flag in (
        (0, meta_frame, 0, 0), (1, data_frame, 1, 1)
    ):
        index, typ, final, plain_len, body = frame
        if index != expected or typ != record_type or final != final_flag or len(body) != plain_len + TAG_BYTES:
            raise ValueError("Invalid record sequence")
    def decrypt(frame: tuple[int, int, int, int, bytes]) -> bytes:
        index, typ, final, plain_len, body = frame
        aad = make_aad(drop_id, typ, index, final, plain_len)
        plaintext = AESGCM(key).decrypt(make_nonce(prefix, index, final), body, aad)
        if len(plaintext) != plain_len:
            raise ValueError("Record plaintext length mismatch")
        return plaintext
    metadata = decrypt(meta_frame)
    text_bytes = decrypt(data_frame)
    if len(metadata) > MAX_METADATA_BYTES or len(text_bytes) > MAX_TEXT_BYTES:
        raise ValueError("Text drop exceeds protocol limit")
    # Exact expected bytes enforce canonical CBOR, all six fields, and size/count.
    if metadata != encode_text_metadata(len(text_bytes)):
        raise ValueError("Invalid or noncanonical text metadata")
    return text_bytes.decode("utf-8", errors="strict")


def produce() -> dict[str, Any]:
    text = "Python → TypeScript interop 🌱\nsecond line"
    text_bytes = text.encode("utf-8", errors="strict")
    if len(text_bytes) > MAX_TEXT_BYTES:
        raise ValueError("Text too large")
    # Fixed test-only material makes failures reproducible. Never use this for real drops.
    url_key = bytes(range(32))
    salt = bytes(range(0xA0, 0xC0))
    prefix = bytes([1, 2, 3, 4, 5, 6, 7])
    drop_id = "python_interop_01"
    key = derive_key(url_key, salt)
    metadata = encode_text_metadata(len(text_bytes))
    stream = (
        encode_frame(0, 0, 0, metadata, key, prefix, drop_id)
        + encode_frame(1, 1, 1, text_bytes, key, prefix, drop_id)
    )
    envelope = MAGIC + bytes([VERSION, 0]) + CHUNK_SIZE.to_bytes(4, "big") + prefix + salt
    fragment = "#" + base64.urlsafe_b64encode(url_key).decode("ascii").rstrip("=")
    return to_json(fragment, drop_id, envelope, stream)


def main() -> int:
    try:
        if len(sys.argv) != 2 or sys.argv[1] not in ("produce", "consume"):
            raise ValueError("Usage: ghostdrop_text_interop.py produce|consume")
        if sys.argv[1] == "produce":
            print(json.dumps(produce(), ensure_ascii=False))
        else:
            value = json.load(sys.stdin)
            print(decrypt_text(value), end="")
        return 0
    except Exception as exc:
        print(f"interop error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
