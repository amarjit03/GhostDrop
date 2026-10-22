
import {
  CHUNK_SIZE_BYTES,
  GCM_TAG_BYTES,
  MAX_METADATA_BYTES,
  RECORD_HEADER_BYTES,
  RECORD_TYPE_DATA,
  RECORD_TYPE_METADATA,
} from "./constants";

export interface RecordFrame {
  index: number;
  type: number;
  finalFlag: 0 | 1;
  plaintextLength: number;
  body: Uint8Array;
}

const MAX_UINT32 = 0xffff_ffff;

function validateHeaderFields(frame: RecordFrame): void {
  if (
    !Number.isInteger(frame.index) ||
    frame.index < 0 ||
    frame.index > MAX_UINT32
  ) {
    throw new Error("Invalid record index");
  }

  if (
    frame.type !== RECORD_TYPE_METADATA &&
    frame.type !== RECORD_TYPE_DATA
  ) {
    throw new Error("Invalid record type");
  }

  if (frame.finalFlag !== 0 && frame.finalFlag !== 1) {
    throw new Error("Invalid final flag");
  }

  if (
    !Number.isInteger(frame.plaintextLength) ||
    frame.plaintextLength < 0 ||
    frame.plaintextLength > MAX_UINT32
  ) {
    throw new Error("Invalid plaintext length");
  }

  const maxLength =
    frame.type === RECORD_TYPE_METADATA
      ? MAX_METADATA_BYTES
      : CHUNK_SIZE_BYTES;

  if (frame.plaintextLength > maxLength) {
    throw new Error("Plaintext exceeds record size limit");
  }
}

function validateBodyLength(
  plaintextLength: number,
  bodyLength: number,
): void {
  const expectedLength = plaintextLength + GCM_TAG_BYTES;

  if (bodyLength !== expectedLength) {
    throw new Error("Record body length mismatch");
  }
}

/**
 * Encode one complete record:
 * 10-byte header || ciphertext || 16-byte GCM tag.
 *
 * This function does not encrypt or authenticate the body.
 */
export function encodeFrame(frame: RecordFrame): Uint8Array<ArrayBuffer> {
  validateHeaderFields(frame);
  validateBodyLength(frame.plaintextLength, frame.body.length);

  const output = new Uint8Array(
    RECORD_HEADER_BYTES + frame.body.length,
  );

  const view = new DataView(output.buffer);

  // Bytes 0–3: record index, unsigned big-endian.
  view.setUint32(0, frame.index, false);

  // Byte 4: record type.
  output[4] = frame.type;

  // Byte 5: final flag; all reserved bits remain zero.
  output[5] = frame.finalFlag;

  // Bytes 6–9: plaintext length, unsigned big-endian.
  view.setUint32(6, frame.plaintextLength, false);

  // Byte 10 onward: ciphertext followed by GCM tag.
  output.set(frame.body, RECORD_HEADER_BYTES);

  return output;
}

/**
 * Parse exactly one complete frame.
 * Rejects truncated frames, trailing bytes, and invalid headers.
 */
export function parseFrame(
  input: Uint8Array,
): RecordFrame {
  if (input.length < RECORD_HEADER_BYTES) {
    throw new Error("Truncated record header");
  }

  // Make an owned copy for reliable DataView typing and isolation.
  const bytes = new Uint8Array(input.length);
  bytes.set(input);

  const view = new DataView(bytes.buffer);

  const index = view.getUint32(0, false);
  const type = bytes[4]!;
  const flags = bytes[5]!;
  const plaintextLength = view.getUint32(6, false);

  // Only bit 0 is defined by the format.
  if ((flags & 0xfe) !== 0) {
    throw new Error("Reserved record flag bits must be zero");
  }

  const finalFlag = (flags & 0x01) as 0 | 1;

  const frame: RecordFrame = {
    index,
    type,
    finalFlag,
    plaintextLength,
    body: bytes.slice(RECORD_HEADER_BYTES),
  };

  validateHeaderFields(frame);

  if (frame.body.length < GCM_TAG_BYTES) {
    throw new Error("Truncated record body");
  }

  validateBodyLength(plaintextLength, frame.body.length);

  return frame;
}
