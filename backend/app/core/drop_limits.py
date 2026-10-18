# app/core/drop_limits.py

# Maximum plaintext bytes represented by one encrypted data record.
CHUNK_SIZE = 2_097_152  # 2 MiB

# Record zero contains the encrypted metadata/header.
MAX_METADATA_PLAINTEXT = 65_536  # 64 KiB

# Maximum plaintext size for a text drop.
MAX_TEXT_BYTES = 2_097_152  # 2 MiB

# AES-GCM adds a 16-byte authentication tag to the ciphertext.
GCM_TAG_BYTES = 16

# Record framing: index (4), type (1), flags (1), plaintext length (4).
RECORD_HEADER_BYTES = 10

# 128-bit random drop ID, encoded as 22 URL-safe Base64 characters.
DROP_ID_BYTES = 16

# 256-bit random owner token, encoded as 43 URL-safe Base64 characters.
OWNER_TOKEN_BYTES = 32

# A few attempts are enough to handle the astronomically unlikely ID collision.
DROP_ID_COLLISION_ATTEMPTS = 3

# Upper bound for the advisory client size hint.
MAX_SIZE_HINT = (
    MAX_METADATA_PLAINTEXT + MAX_TEXT_BYTES + RECORD_HEADER_BYTES + GCM_TAG_BYTES
)
