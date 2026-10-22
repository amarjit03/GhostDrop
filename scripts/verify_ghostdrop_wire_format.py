#!/usr/bin/env python3
"""Independent Ghostdrop envelope and canonical-CBOR wire-format verifier."""

from __future__ import annotations

MAGIC = b"GSDP"
VERSION = 1
PASSWORD_FLAG = 0x01
CHUNK_SIZE = 2_097_152

NONCE_PREFIX = bytes.fromhex("01020304050607")
KDF_SALT = bytes.fromhex(
    "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf"
    "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf"
)
PASSWORD_SALT = bytes.fromhex("303132333435363738393a3b3c3d3e3f")

EXPECTED_BASE_HEX = (
    "47534450010000200000"
    "01020304050607"
    "a0a1a2a3a4a5a6a7a8a9aaabacadae"
    "afb0b1b2b3b4b5b6b7b8b9babbbcbdbebf"
)

EXPECTED_TEXT_METADATA_HEX = (
    "a600010160026a746578742f706c61696e030504010501"
)


def build_envelope(password_salt: bytes | None = None) -> bytes:
    """Build the protocol envelope from its defined fields."""
    if password_salt is not None and len(password_salt) != 16:
        raise ValueError("Password salt must be exactly 16 bytes")

    flags = PASSWORD_FLAG if password_salt is not None else 0

    parts = [
        MAGIC,
        bytes([VERSION]),
        bytes([flags]),
        CHUNK_SIZE.to_bytes(4, "big"),
        NONCE_PREFIX,
        KDF_SALT,
    ]

    if password_salt is not None:
        parts.append(password_salt)

    return b"".join(parts)


def validate_envelope(data: bytes) -> None:
    """Validate envelope structure according to the protocol."""
    if len(data) < 49:
        raise ValueError("Envelope is truncated")

    if data[:4] != MAGIC:
        raise ValueError("Invalid envelope magic")

    if data[4] != VERSION:
        raise ValueError("Unsupported envelope version")

    flags = data[5]
    if flags & ~PASSWORD_FLAG:
        raise ValueError("Reserved envelope flags must be zero")

    expected_length = 65 if flags & PASSWORD_FLAG else 49
    if len(data) != expected_length:
        raise ValueError("Invalid envelope length")

    chunk_size = int.from_bytes(data[6:10], "big")
    if chunk_size != CHUNK_SIZE:
        raise ValueError("Invalid chunk size")


def cbor_head(major_type: int, value: int) -> bytes:
    """Encode a CBOR major-type header using the shortest representation."""
    if value < 0:
        raise ValueError("CBOR value cannot be negative")

    prefix = major_type << 5

    if value < 24:
        return bytes([prefix | value])
    if value <= 0xFF:
        return bytes([prefix | 24, value])
    if value <= 0xFFFF:
        return bytes([prefix | 25]) + value.to_bytes(2, "big")
    if value <= 0xFFFFFFFF:
        return bytes([prefix | 26]) + value.to_bytes(4, "big")

    return bytes([prefix | 27]) + value.to_bytes(8, "big")


def cbor_uint(value: int) -> bytes:
    return cbor_head(0, value)


def cbor_text(value: str) -> bytes:
    encoded = value.encode("utf-8")
    return cbor_head(3, len(encoded)) + encoded


def build_text_metadata() -> bytes:
    """Encode the canonical six-key metadata map for text 'hello'."""
    fields = [
        cbor_uint(0) + cbor_uint(1),          # 0: text content kind
        cbor_uint(1) + cbor_text(""),         # 1: empty filename
        cbor_uint(2) + cbor_text("text/plain"),  # 2: MIME type
        cbor_uint(3) + cbor_uint(5),          # 3: plaintext size
        cbor_uint(4) + cbor_uint(1),          # 4: data record count
        cbor_uint(5) + cbor_uint(1),          # 5: schema version
    ]
    return cbor_head(5, len(fields)) + b"".join(fields)


def expect_rejected(label: str, data: bytes) -> None:
    try:
        validate_envelope(data)
    except ValueError:
        print(f"PASS: rejects {label}")
        return

    raise AssertionError(f"Invalid envelope was accepted: {label}")


def main() -> None:
    # 1. Unprotected envelope vector.
    expected_base = bytes.fromhex(EXPECTED_BASE_HEX)
    base = build_envelope()

    assert len(NONCE_PREFIX) == 7
    assert len(KDF_SALT) == 32
    assert len(base) == 49
    assert base == expected_base

    validate_envelope(base)
    print("PASS: 49-byte base envelope vector")

    # 2. Password-protected envelope vector.
    # Derive the expected value from the independently fixed base vector.
    expected_password = (
    expected_base[:5]
    + bytes([PASSWORD_FLAG])
    + expected_base[6:]
    + PASSWORD_SALT
)
    protected = build_envelope(PASSWORD_SALT)

    assert len(PASSWORD_SALT) == 16
    assert len(protected) == 65
    assert protected == expected_password
    assert protected[:5] == expected_base[:5]
    assert protected[5] == PASSWORD_FLAG
    assert protected[6:49] == expected_base[6:]
    assert protected[49:] == PASSWORD_SALT
    assert protected[49:] == PASSWORD_SALT

    validate_envelope(protected)
    print("PASS: 65-byte password-protected envelope vector")

    # 3. Reject malformed envelopes.
    expect_rejected("incorrect magic", b"X" + base[1:])
    expect_rejected("unsupported version", base[:4] + b"\x02" + base[5:])
    expect_rejected("reserved flag bit", base[:5] + b"\x02" + base[6:])
    expect_rejected(
        "incorrect chunk size",
        base[:6] + (1024).to_bytes(4, "big") + base[10:],
    )
    expect_rejected("truncated envelope", base[:-1])
    expect_rejected("unexpected trailing byte", base + b"\x00")
    expect_rejected("truncated password envelope", protected[:-1])

    # 4. Canonical CBOR text metadata vector.
    expected_metadata = bytes.fromhex(EXPECTED_TEXT_METADATA_HEX)
    metadata = build_text_metadata()

    assert metadata == expected_metadata
    print("PASS: canonical CBOR text metadata vector")

    # 5. Guard against non-minimal CBOR integer encoding.
    assert cbor_uint(1) == b"\x01"
    assert cbor_uint(23) == b"\x17"
    assert cbor_uint(24) == b"\x18\x18"
    print("PASS: shortest-form CBOR unsigned integers")

    print("\nAll independent wire-format checks passed.")


if __name__ == "__main__":
    main()
