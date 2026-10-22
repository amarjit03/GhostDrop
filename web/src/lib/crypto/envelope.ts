
import {
  CHUNK_SIZE_BYTES,
  ENVELOPE_BASE_BYTES,
  ENVELOPE_MAGIC,
  ENVELOPE_PASSWORD_BYTES,
  FORMAT_VERSION,
  KDF_SALT_BYTES,
  NONCE_PREFIX_BYTES,
  PASSWORD_SALT_BYTES,
} from "./constants";

const PASSWORD_FLAG = 0x01;
const RESERVED_FLAG_MASK = 0xfe;

export interface EnvelopeParameters {
  noncePrefix: Uint8Array;
  kdfSalt: Uint8Array;
  /** Present only when password protection is enabled. */
  passwordSalt?: Uint8Array;
}

export interface DecodedEnvelope {
  version: 1;
  passwordProtected: boolean;
  chunkSize: number;
  noncePrefix: Uint8Array;
  kdfSalt: Uint8Array;
  passwordSalt?: Uint8Array;
}

function fail(message: string): never {
  throw new Error(`Invalid envelope: ${message}`);
}

function requireBytes(
  value: unknown,
  expectedLength: number,
  name: string,
): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== expectedLength) {
    fail(`${name} must be exactly ${expectedLength} bytes`);
  }
}

/**
 * Encode the fixed Ghostdrop v1 envelope.
 *
 * Layout:
 * magic[4] || version[1] || flags[1] || chunkSize[4] ||
 * noncePrefix[7] || kdfSalt[32] || optional passwordSalt[16].
 *
 * Integer fields are unsigned big-endian.
 */
export function encodeEnvelope(
  parameters: EnvelopeParameters,
): Uint8Array<ArrayBuffer> {
  if (parameters === null || typeof parameters !== "object") {
    fail("parameters must be an object");
  }

  requireBytes(
    parameters.noncePrefix,
    NONCE_PREFIX_BYTES,
    "nonce prefix",
  );
  requireBytes(parameters.kdfSalt, KDF_SALT_BYTES, "KDF salt");

  const passwordProtected = parameters.passwordSalt !== undefined;

  if (passwordProtected) {
    requireBytes(
      parameters.passwordSalt,
      PASSWORD_SALT_BYTES,
      "password salt",
    );
  }

  const output = new Uint8Array(
    passwordProtected ? ENVELOPE_PASSWORD_BYTES : ENVELOPE_BASE_BYTES,
  );

  output.set(ENVELOPE_MAGIC, 0);
  output[4] = FORMAT_VERSION;
  output[5] = passwordProtected ? PASSWORD_FLAG : 0;

  const view = new DataView(output.buffer);
  view.setUint32(6, CHUNK_SIZE_BYTES, false);

  let offset = 10;
  output.set(parameters.noncePrefix, offset);
  offset += NONCE_PREFIX_BYTES;

  output.set(parameters.kdfSalt, offset);
  offset += KDF_SALT_BYTES;

  if (passwordProtected) {
    output.set(parameters.passwordSalt!, offset);
  }

  return output;
}

/**
 * Decode and strictly validate a Ghostdrop v1 envelope.
 * Returned byte arrays are independent copies of the input.
 */
export function decodeEnvelope(
  input: Uint8Array,
): DecodedEnvelope {
  if (!(input instanceof Uint8Array)) {
    fail("input must be a byte array");
  }

  if (
    input.length !== ENVELOPE_BASE_BYTES &&
    input.length !== ENVELOPE_PASSWORD_BYTES
  ) {
    fail("invalid envelope length");
  }

  // Copy input so decoding doesn't retain a view into caller-owned memory.
  const bytes = new Uint8Array(input.length);
  bytes.set(input);

  for (let i = 0; i < ENVELOPE_MAGIC.length; i++) {
    if (bytes[i] !== ENVELOPE_MAGIC[i]) {
      fail("invalid magic bytes");
    }
  }

  if (bytes[4] !== FORMAT_VERSION) {
    fail("unsupported format version");
  }

  const flags = bytes[5]!;

  if ((flags & RESERVED_FLAG_MASK) !== 0) {
    fail("reserved flag bits must be zero");
  }

  const passwordProtected = (flags & PASSWORD_FLAG) !== 0;
  const expectedLength = passwordProtected
    ? ENVELOPE_PASSWORD_BYTES
    : ENVELOPE_BASE_BYTES;

  if (bytes.length !== expectedLength) {
    fail("envelope length does not match flags");
  }

  const view = new DataView(bytes.buffer);

  if (view.getUint32(6, false) !== CHUNK_SIZE_BYTES) {
    fail("unsupported chunk size");
  }

  let offset = 10;

  const noncePrefix = bytes.slice(
    offset,
    offset + NONCE_PREFIX_BYTES,
  );
  offset += NONCE_PREFIX_BYTES;

  const kdfSalt = bytes.slice(offset, offset + KDF_SALT_BYTES);
  offset += KDF_SALT_BYTES;

  if (passwordProtected) {
    const passwordSalt = bytes.slice(
      offset,
      offset + PASSWORD_SALT_BYTES,
    );

    return {
      version: 1,
      passwordProtected: true,
      chunkSize: CHUNK_SIZE_BYTES,
      noncePrefix,
      kdfSalt,
      passwordSalt,
    };
  }

  return {
    version: 1,
    passwordProtected: false,
    chunkSize: CHUNK_SIZE_BYTES,
    noncePrefix,
    kdfSalt,
  };
}
