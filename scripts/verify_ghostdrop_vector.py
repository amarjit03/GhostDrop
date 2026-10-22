
#!/usr/bin/env python3
"""Independent Ghostdrop v1 crypto-vector verification."""

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


# Fixed values from the Ghostdrop v1 protocol specification.
URL_KEY = bytes.fromhex(
    "000102030405060708090a0b0c0d0e0f"
    "101112131415161718191a1b1c1d1e1f"
)

KDF_SALT = bytes.fromhex(
    "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf"
    "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf"
)

EXPECTED_KEY = bytes.fromhex(
    "cd12dd1230882b16941d09612c81fe48"
    "8bbf7c1bb702d44e893da0a182ec0232"
)

NONCE_PREFIX = bytes.fromhex("01020304050607")
DROP_ID = "00112233445566778899aabbccddeeff"
PLAINTEXT = b"hello"

EXPECTED_NONCE = bytes.fromhex("010203040506070000000101")

EXPECTED_AAD = bytes.fromhex(
    "47686f737464726f702f414541442f7631"
    "0001002030303131323233333434353536"
    "363737383839396161626263636464656566"
    "660100000001010000000500200000"
)

EXPECTED_BODY = bytes.fromhex(
    "f2012492d7227b9baf5700f382809f4667858db6f9"
)

CHUNK_SIZE = 2_097_152
FORMAT_VERSION = 1
RECORD_TYPE_DATA = 1
FINAL_FLAG = 1


def derive_key() -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=KDF_SALT,
        info=b"Ghostdrop/v1/content-encryption-key",
    ).derive(URL_KEY)


def build_nonce() -> bytes:
    return NONCE_PREFIX + (1).to_bytes(4, "big") + bytes([FINAL_FLAG])


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
