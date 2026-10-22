
import {
  CHUNK_SIZE_BYTES,
  MAX_DATA_CHUNKS,
  MAX_METADATA_BYTES,
  MAX_TEXT_BYTES,
} from "./constants";

export interface DropMetadata {
  contentKind: 0 | 1;
  filename: string;
  mimeType: string;
  plaintextSize: number;
  dataRecordCount: number;
  schemaVersion: 1;
}

const MAX_FILE_BYTES = CHUNK_SIZE_BYTES * MAX_DATA_CHUNKS;
const MAX_SAFE_CBOR_INTEGER = Number.MAX_SAFE_INTEGER;

const encoder = new TextEncoder();

function invalid(message: string): never {
  throw new Error(`Invalid metadata: ${message}`);
}

function isSafeUnsigned(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/** Encode a CBOR head using the shortest valid representation. */
function encodeHead(
  majorType: number,
  value: number,
): Uint8Array<ArrayBuffer> {
  if (!isSafeUnsigned(value)) {
    invalid("invalid CBOR integer");
  }

  if (value < 24) {
    return Uint8Array.of((majorType << 5) | value);
  }

  if (value <= 0xff) {
    return Uint8Array.of((majorType << 5) | 24, value);
  }

  if (value <= 0xffff) {
    const result = new Uint8Array(3);
    result[0] = (majorType << 5) | 25;
    new DataView(result.buffer).setUint16(1, value, false);
    return result;
  }

  if (value <= 0xffff_ffff) {
    const result = new Uint8Array(5);
    result[0] = (majorType << 5) | 26;
    new DataView(result.buffer).setUint32(1, value, false);
    return result;
  }

  const result = new Uint8Array(9);
  result[0] = (majorType << 5) | 27;
  new DataView(result.buffer).setBigUint64(1, BigInt(value), false);
  return result;
}

function encodeUint(value: number): Uint8Array<ArrayBuffer> {
  return encodeHead(0, value);
}

function encodeText(value: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(value);
  const head = encodeHead(3, bytes.length);
  return concatenate([head, bytes]);
}

function concatenate(
  parts: readonly Uint8Array[],
): Uint8Array<ArrayBuffer> {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function expectedDataRecordCount(size: number): number {
  return size === 0 ? 0 : Math.ceil(size / CHUNK_SIZE_BYTES);
}

function validateMetadata(metadata: DropMetadata): void {
  if (
    metadata.contentKind !== 0 &&
    metadata.contentKind !== 1
  ) {
    invalid("unsupported content kind");
  }

  if (typeof metadata.filename !== "string") {
    invalid("filename must be text");
  }

  if (metadata.filename.normalize("NFC") !== metadata.filename) {
    invalid("filename must be NFC-normalized");
  }

  if (typeof metadata.mimeType !== "string") {
    invalid("MIME type must be text");
  }

  if (
    !/^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/.test(
      metadata.mimeType,
    )
  ) {
    invalid("invalid MIME type");
  }

  if (
    !isSafeUnsigned(metadata.plaintextSize) ||
    !isSafeUnsigned(metadata.dataRecordCount)
  ) {
    invalid("size and record count must be unsigned integers");
  }

  if (metadata.schemaVersion !== 1) {
    invalid("unsupported schema version");
  }

  if (metadata.contentKind === 1) {
    if (metadata.filename !== "") {
      invalid("text metadata filename must be empty");
    }

    if (metadata.mimeType !== "text/plain") {
      invalid("text metadata MIME type must be text/plain");
    }

    if (metadata.plaintextSize > MAX_TEXT_BYTES) {
      invalid("text exceeds maximum size");
    }

    // Text secrets always use exactly one data record,
    // including an empty text secret.
    if (metadata.dataRecordCount !== 1) {
      invalid("text must have exactly one data record");
    }

    return;
  }

  if (metadata.plaintextSize > MAX_FILE_BYTES) {
    invalid("file exceeds maximum size");
  }

  if (metadata.dataRecordCount > MAX_DATA_CHUNKS) {
    invalid("too many data records");
  }

  if (
    metadata.dataRecordCount !==
    expectedDataRecordCount(metadata.plaintextSize)
  ) {
    invalid("file size and data record count disagree");
  }
}

/**
 * Encode the exact six-key metadata map using deterministic CBOR.
 * Map keys are unsigned integers 0 through 5 in ascending order.
 */
export function encodeMetadata(
  metadata: DropMetadata,
): Uint8Array<ArrayBuffer> {
  validateMetadata(metadata);

  const result = concatenate([
    encodeHead(5, 6), // map of exactly six entries
    encodeUint(0),
    encodeUint(metadata.contentKind),
    encodeUint(1),
    encodeText(metadata.filename),
    encodeUint(2),
    encodeText(metadata.mimeType),
    encodeUint(3),
    encodeUint(metadata.plaintextSize),
    encodeUint(4),
    encodeUint(metadata.dataRecordCount),
    encodeUint(5),
    encodeUint(metadata.schemaVersion),
  ]);

  if (result.length > MAX_METADATA_BYTES) {
    invalid("encoded metadata exceeds size limit");
  }

  return result;
}

interface CborHead {
  major: number;
  value: number;
}

/** Read a CBOR head and reject non-minimal integer/length encodings. */
function readHead(
  bytes: Uint8Array,
  state: { offset: number },
): CborHead {
  if (state.offset >= bytes.length) {
    invalid("truncated CBOR");
  }

  const first = bytes[state.offset++]!;
  const major = first >>> 5;
  const additional = first & 0x1f;

  if (additional < 24) {
    return { major, value: additional };
  }

  let value: number;

  if (additional === 24) {
    if (state.offset + 1 > bytes.length) invalid("truncated CBOR");
    value = bytes[state.offset++]!;
    if (value < 24) invalid("noncanonical CBOR integer");
  } else if (additional === 25) {
    if (state.offset + 2 > bytes.length) invalid("truncated CBOR");
    value = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint16(state.offset, false);
    state.offset += 2;
    if (value <= 0xff) invalid("noncanonical CBOR integer");
  } else if (additional === 26) {
    if (state.offset + 4 > bytes.length) invalid("truncated CBOR");
    value = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(state.offset, false);
    state.offset += 4;
    if (value <= 0xffff) invalid("noncanonical CBOR integer");
  } else if (additional === 27) {
    if (state.offset + 8 > bytes.length) invalid("truncated CBOR");
    const bigValue = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getBigUint64(state.offset, false);
    state.offset += 8;

    if (bigValue <= BigInt(0xffff_ffff)) {
      invalid("noncanonical CBOR integer");
    }

    if (bigValue > BigInt(MAX_SAFE_CBOR_INTEGER)) {
      invalid("integer exceeds JavaScript safe range");
    }

    value = Number(bigValue);
  } else {
    invalid("indefinite lengths and reserved encodings are unsupported");
  }

  return { major, value };
}

function readUint(
  bytes: Uint8Array,
  state: { offset: number },
): number {
  const head = readHead(bytes, state);
  if (head.major !== 0) invalid("expected unsigned integer");
  return head.value;
}

function readText(
  bytes: Uint8Array,
  state: { offset: number },
): string {
  const head = readHead(bytes, state);
  if (head.major !== 3) invalid("expected text string");

  if (head.value > bytes.length - state.offset) {
    invalid("truncated text string");
  }

  const slice = bytes.subarray(state.offset, state.offset + head.value);
  state.offset += head.value;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(slice);
  } catch {
    invalid("invalid UTF-8");
  }
}

/**
 * Decode and strictly validate one complete metadata map.
 * Duplicate keys, unknown keys, missing keys, noncanonical encodings,
 * and trailing bytes are rejected.
 */
export function decodeMetadata(
  input: Uint8Array,
): DropMetadata {
  if (input.length > MAX_METADATA_BYTES) {
    invalid("encoded metadata exceeds size limit");
  }

  const bytes = new Uint8Array(input.length);
  bytes.set(input);

  const state = { offset: 0 };
  const mapHead = readHead(bytes, state);

  if (mapHead.major !== 5 || mapHead.value !== 6) {
    invalid("metadata must be a six-entry map");
  }

  const values: unknown[] = [];
  let previousKey = -1;

  for (let i = 0; i < 6; i++) {
    const key = readUint(bytes, state);

    if (key <= previousKey) {
      invalid("duplicate or unordered metadata keys");
    }

    if (key > 5) {
      invalid("unknown metadata key");
    }

    previousKey = key;

    // Keys 1 and 2 are text; all other values are unsigned integers.
    values[key] = key === 1 || key === 2
      ? readText(bytes, state)
      : readUint(bytes, state);
  }

  if (state.offset !== bytes.length) {
    invalid("trailing bytes after metadata");
  }

  const metadata: DropMetadata = {
    contentKind: values[0] as 0 | 1,
    filename: values[1] as string,
    mimeType: values[2] as string,
    plaintextSize: values[3] as number,
    dataRecordCount: values[4] as number,
    schemaVersion: values[5] as 1,
  };

  validateMetadata(metadata);

  // Defense in depth: require byte-for-byte deterministic encoding.
  const canonical = encodeMetadata(metadata);
  if (
    canonical.length !== bytes.length ||
    canonical.some((byte, index) => byte !== bytes[index])
  ) {
    invalid("metadata is not deterministically encoded");
  }

  return metadata;
}
