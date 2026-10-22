
export const FORMAT_VERSION = 0x01;

export const AES_KEY_BYTES = 32;
export const GCM_NONCE_BYTES = 12;
export const GCM_TAG_BYTES = 16;

export const URL_KEY_BYTES = 32;
export const URL_KEY_BASE64URL_LENGTH = 43;

export const KDF_SALT_BYTES = 32;
export const NONCE_PREFIX_BYTES = 7;
export const PASSWORD_SALT_BYTES = 16;

export const CHUNK_SIZE_BYTES = 2_097_152;
export const MAX_DATA_CHUNKS = 2 ** 20;
export const MAX_TEXT_BYTES = CHUNK_SIZE_BYTES;
export const MAX_METADATA_BYTES = 65_536;

export const HKDF_INFO =
  "Ghostdrop/v1/content-encryption-key";

export const AAD_DOMAIN = "Ghostdrop/AEAD/v1";

export const ENVELOPE_MAGIC = new Uint8Array([
  0x47, 0x53, 0x44, 0x50, // GSDP
]);

export const ENVELOPE_BASE_BYTES = 49;
export const ENVELOPE_PASSWORD_BYTES = 65;

export const RECORD_HEADER_BYTES = 10;
export const RECORD_TYPE_METADATA = 0x00;
export const RECORD_TYPE_DATA = 0x01;
