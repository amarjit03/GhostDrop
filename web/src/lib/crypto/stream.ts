
import {
  CHUNK_SIZE_BYTES,
  MAX_DATA_CHUNKS,
  RECORD_TYPE_DATA,
  RECORD_TYPE_METADATA,
} from "./constants";
import type { RecordFrame } from "./frame";
import type { DropMetadata } from "./metadata";

const MAX_FILE_BYTES = CHUNK_SIZE_BYTES * MAX_DATA_CHUNKS;

function fail(message: string): never {
  throw new Error(`Invalid stream: ${message}`);
}

/**
 * Validate the structure of an already parsed and authenticated record
 * sequence against its decrypted metadata.
 *
 * This function does not decrypt records or authenticate AES-GCM tags.
 * The caller must authenticate every record before trusting its plaintext.
 */
export function validateRecordSequence(
  frames: readonly RecordFrame[],
  metadata: DropMetadata,
): void {
  if (frames.length === 0) {
    fail("stream is empty");
  }

  if (frames.length > MAX_DATA_CHUNKS + 1) {
    fail("too many records");
  }

  if (
    metadata.contentKind !== 0 &&
    metadata.contentKind !== 1
  ) {
    fail("unsupported content kind");
  }

  if (
    !Number.isSafeInteger(metadata.plaintextSize) ||
    metadata.plaintextSize < 0
  ) {
    fail("invalid plaintext size");
  }

  if (
    !Number.isSafeInteger(metadata.dataRecordCount) ||
    metadata.dataRecordCount < 0 ||
    metadata.dataRecordCount > MAX_DATA_CHUNKS
  ) {
    fail("invalid data record count");
  }

  if (metadata.schemaVersion !== 1) {
    fail("unsupported metadata schema version");
  }

  const metadataFrame = frames[0]!;

  if (
    metadataFrame.index !== 0 ||
    metadataFrame.type !== RECORD_TYPE_METADATA
  ) {
    fail("first record must be metadata at index zero");
  }

  if (metadataFrame.plaintextLength <= 0) {
    fail("metadata record cannot be empty");
  }

  const dataFrames = frames.slice(1);

  if (dataFrames.length !== metadata.dataRecordCount) {
    fail("data record count mismatch");
  }

  if (metadata.contentKind === 1) {
    validateTextStream(metadata, metadataFrame, dataFrames);
    return;
  }

  validateFileStream(metadata, metadataFrame, dataFrames);
}

function validateTextStream(
  metadata: DropMetadata,
  metadataFrame: RecordFrame,
  dataFrames: readonly RecordFrame[],
): void {
  if (metadata.filename !== "") {
    fail("text filename must be empty");
  }

  if (metadata.mimeType !== "text/plain") {
    fail("text MIME type must be text/plain");
  }

  if (metadata.plaintextSize > CHUNK_SIZE_BYTES) {
    fail("text exceeds maximum size");
  }

  // Text secrets always contain exactly one data record,
  // even when the plaintext is empty.
  if (dataFrames.length !== 1) {
    fail("text must contain exactly one data record");
  }

  if (metadataFrame.finalFlag !== 0) {
    fail("metadata record must not be final when data follows");
  }

  const dataFrame = dataFrames[0]!;

  if (dataFrame.index !== 1) {
    fail("text data record index must be one");
  }

  if (dataFrame.type !== RECORD_TYPE_DATA) {
    fail("expected text data record");
  }

  if (dataFrame.finalFlag !== 1) {
    fail("text data record must be final");
  }

  if (dataFrame.plaintextLength !== metadata.plaintextSize) {
    fail("text plaintext size mismatch");
  }
}

function validateFileStream(
  metadata: DropMetadata,
  metadataFrame: RecordFrame,
  dataFrames: readonly RecordFrame[],
): void {
  if (metadata.plaintextSize > MAX_FILE_BYTES) {
    fail("file exceeds maximum size");
  }

  const expectedCount =
    metadata.plaintextSize === 0
      ? 0
      : Math.ceil(metadata.plaintextSize / CHUNK_SIZE_BYTES);

  if (metadata.dataRecordCount !== expectedCount) {
    fail("file size and data record count disagree");
  }

  if (dataFrames.length === 0) {
    if (metadata.plaintextSize !== 0) {
      fail("non-empty file has no data records");
    }

    if (metadataFrame.finalFlag !== 1) {
      fail("empty file metadata record must be final");
    }

    return;
  }

  if (metadataFrame.finalFlag !== 0) {
    fail("metadata record must not be final when data follows");
  }

  let totalPlaintextBytes = 0;

  for (let i = 0; i < dataFrames.length; i++) {
    const frame = dataFrames[i]!;
    const expectedIndex = i + 1;
    const isLast = i === dataFrames.length - 1;

    if (frame.index !== expectedIndex) {
      fail("record indexes must be contiguous and ordered");
    }

    if (frame.type !== RECORD_TYPE_DATA) {
      fail("expected data record");
    }

    if (frame.plaintextLength <= 0) {
      fail("file data records cannot be empty");
    }

    if (frame.plaintextLength > CHUNK_SIZE_BYTES) {
      fail("file data record exceeds chunk size");
    }

    if (isLast) {
      if (frame.finalFlag !== 1) {
        fail("last data record must be final");
      }
    } else {
      if (frame.finalFlag !== 0) {
        fail("non-final data record has final flag set");
      }

      if (frame.plaintextLength !== CHUNK_SIZE_BYTES) {
        fail("non-final file chunks must be full-sized");
      }
    }

    totalPlaintextBytes += frame.plaintextLength;

    if (totalPlaintextBytes > MAX_FILE_BYTES) {
      fail("file exceeds maximum size");
    }
  }

  if (totalPlaintextBytes !== metadata.plaintextSize) {
    fail("file plaintext size mismatch");
  }
}
