
#!/usr/bin/env python3
"""Independent Ghostdrop v1 crypto-vector verification."""

import json
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

REPO_ROOT = Path(__file__).resolve().parents[1]
VECTOR_PATH = REPO_ROOT / "tests" / "vectors" / "v1-record.json"

VECTOR = json.loads(VECTOR_PATH.read_text(encoding="utf-8"))

URL_KEY = bytes.fromhex(VECTOR["url_key_hex"])
KDF_SALT = bytes.fromhex(VECTOR["kdf_salt_hex"])
EXPECTED_KEY = bytes.fromhex(VECTOR["derived_key_hex"])

NONCE_PREFIX = bytes.fromhex(VECTOR["nonce_prefix_hex"])
DROP_ID = VECTOR["drop_id"]
PLAINTEXT = bytes.fromhex(VECTOR["plaintext_hex"])

EXPECTED_NONCE = bytes.fromhex(VECTOR["nonce_hex"])
EXPECTED_AAD = bytes.fromhex(VECTOR["aad_hex"])
EXPECTED_BODY = bytes.fromhex(VECTOR["ciphertext_and_tag_hex"])

CHUNK_SIZE = VECTOR["chunk_size"]
FORMAT_VERSION = 1
RECORD_TYPE_DATA = VECTOR["record_type"]
FINAL_FLAG = VECTOR["final_flag"]
RECORD_INDEX = VECTOR["record_index"]


def derive_key() -> bytes:
    info = VECTOR["hkdf_info_utf8"].encode("utf-8")
    return HKDF(
       algorithm=hashes.SHA256(),
       length=32,
       salt=KDF_SALT,
       info=info,
       ).derive(URL_KEY)

def build_nonce() -> bytes:
    return NONCE_PREFIX + RECORD_INDEX.to_bytes(4, "big") + bytes([FINAL_FLAG])


def build_aad() -> bytes:
    drop_id = DROP_ID.encode("ascii")

    return b"".join(
        [
            b"Ghostdrop/AEAD/v1",
            b"\x00",
            bytes([FORMAT_VERSION]),
            len(drop_id).to_bytes(2, "big"),
            drop_id,
            bytes([RECORD_TYPE_DATA]),
            (1).to_bytes(4, "big"),
            bytes([FINAL_FLAG]),
            len(PLAINTEXT).to_bytes(4, "big"),
            CHUNK_SIZE.to_bytes(4, "big"),
        ]
    )


def main() -> None:
    assert len(URL_KEY) == 32
    assert len(KDF_SALT) == 32
    assert len(NONCE_PREFIX) == 7

    key = derive_key()
    assert key == EXPECTED_KEY, f"HKDF mismatch: {key.hex()}"

    nonce = build_nonce()
    assert nonce == EXPECTED_NONCE, f"Nonce mismatch: {nonce.hex()}"

    aad = build_aad()
    assert aad == EXPECTED_AAD, f"AAD mismatch: {aad.hex()}"

    body = AESGCM(key).encrypt(nonce, PLAINTEXT, aad)
    assert body == EXPECTED_BODY, f"AES-GCM mismatch: {body.hex()}"

    # Confirm that the expected body decrypts with the independent
    # implementation and the same protocol inputs.
    recovered = AESGCM(key).decrypt(nonce, EXPECTED_BODY, aad)
    assert recovered == PLAINTEXT

    # A changed AAD must cause authentication to fail.
    try:
        AESGCM(key).decrypt(nonce, EXPECTED_BODY, aad + b"\x00")
    except Exception:
        pass
    else:
        raise AssertionError("AES-GCM accepted modified AAD")

    print("PASS: HKDF-SHA256 key derivation")
    print("PASS: 12-byte record nonce")
    print("PASS: canonical AAD construction")
    print("PASS: AES-256-GCM ciphertext and tag")
    print("PASS: decryption and modified-AAD rejection")
    print("All independent crypto-vector checks passed.")


if __name__ == "__main__":
    main()
