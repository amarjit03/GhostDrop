
import {
  FORMAT_VERSION,
  CHUNK_SIZE_BYTES,
  AAD_DOMAIN,
  RECORD_TYPE_METADATA,
  RECORD_TYPE_DATA,
} from "./constants";

export interface BuildAadInput {
  dropId: string;
  recordType: number;
  recordIndex: number;
  finalFlag: 0 | 1;
  plaintextLength: number;
}

export function buildAad(input: BuildAadInput): Uint8Array<ArrayBuffer> {
  const {
    dropId,
    recordType,
    recordIndex,
    finalFlag,
    plaintextLength,
  } = input;

  if (
    typeof dropId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(dropId)
  ) {
    throw new Error("Invalid drop ID");
  }

  if (
    recordType !== RECORD_TYPE_METADATA &&
    recordType !== RECORD_TYPE_DATA
  ) {
    throw new Error("Invalid record type");
  }

  if (
    !Number.isInteger(recordIndex) ||
    recordIndex < 0 ||
    recordIndex > 0xffffffff
  ) {
    throw new Error("Invalid record index");
  }

  if (finalFlag !== 0 && finalFlag !== 1) {
    throw new Error("Invalid final flag");
  }

  if (
    !Number.isInteger(plaintextLength) ||
    plaintextLength < 0 ||
    plaintextLength > 0xffffffff
  ) {
    throw new Error("Invalid plaintext length");
  }

  const domain = new TextEncoder().encode(AAD_DOMAIN);
  const dropIdBytes = new TextEncoder().encode(dropId);

  // domain + NUL + version + BE16(id length) + id +
  // type + BE32(index) + final + BE32(length) + BE32(chunk size)
  const output = new Uint8Array(
    domain.length + 1 + 1 + 2 + dropIdBytes.length + 1 + 4 + 1 + 4 + 4,
  );

  let offset = 0;
  output.set(domain, offset);
  offset += domain.length;

  output[offset++] = 0;
  output[offset++] = FORMAT_VERSION;

  const view = new DataView(output.buffer);
  view.setUint16(offset, dropIdBytes.length, false);
  offset += 2;

  output.set(dropIdBytes, offset);
  offset += dropIdBytes.length;

  output[offset++] = recordType;
  view.setUint32(offset, recordIndex, false);
  offset += 4;

  output[offset++] = finalFlag;
  view.setUint32(offset, plaintextLength, false);
  offset += 4;

  view.setUint32(offset, CHUNK_SIZE_BYTES, false);

  return output;
}
