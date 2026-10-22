
import { describe, expect, it } from "vitest";
import { CHUNK_SIZE_BYTES } from "./constants";
import type { RecordFrame } from "./frame";
import type { DropMetadata } from "./metadata";
import { validateRecordSequence } from "./stream";

function frame(
  index: number,
  type: number,
  finalFlag: 0 | 1,
  plaintextLength: number,
): RecordFrame {
  return {
    index,
    type,
    finalFlag,
    plaintextLength,
    body: new Uint8Array(plaintextLength + 16),
  };
}

const textMetadata: DropMetadata = {
  contentKind: 1,
  filename: "",
  mimeType: "text/plain",
  plaintextSize: 5,
  dataRecordCount: 1,
  schemaVersion: 1,
};

const emptyTextMetadata: DropMetadata = {
  ...textMetadata,
  plaintextSize: 0,
};

const emptyFileMetadata: DropMetadata = {
  contentKind: 0,
  filename: "empty.bin",
  mimeType: "application/octet-stream",
  plaintextSize: 0,
  dataRecordCount: 0,
  schemaVersion: 1,
};

describe("validateRecordSequence", () => {
  it("accepts a text stream", () => {
    expect(() =>
      validateRecordSequence(
        [frame(0, 0, 0, 10), frame(1, 1, 1, 5)],
        textMetadata,
      ),
    ).not.toThrow();
  });

  it("accepts an empty text secret", () => {
    expect(() =>
      validateRecordSequence(
        [frame(0, 0, 0, 10), frame(1, 1, 1, 0)],
        emptyTextMetadata,
      ),
    ).not.toThrow();
  });

  it("accepts an empty file", () => {
    expect(() =>
      validateRecordSequence(
        [frame(0, 0, 1, 10)],
        emptyFileMetadata,
      ),
    ).not.toThrow();
  });

  it("accepts a two-chunk file", () => {
    const metadata: DropMetadata = {
      ...emptyFileMetadata,
      filename: "large.bin",
      plaintextSize: CHUNK_SIZE_BYTES + 1,
      dataRecordCount: 2,
    };

    expect(() =>
      validateRecordSequence(
        [
          frame(0, 0, 0, 10),
          frame(1, 1, 0, CHUNK_SIZE_BYTES),
          frame(2, 1, 1, 1),
        ],
        metadata,
      ),
    ).not.toThrow();
  });

  it("rejects a missing data record", () => {
    expect(() =>
      validateRecordSequence(
        [frame(0, 0, 0, 10)],
        textMetadata,
      ),
    ).toThrow("data record count mismatch");
  });

  it("rejects out-of-order indexes", () => {
    const metadata: DropMetadata = {
      ...emptyFileMetadata,
      filename: "large.bin",
      plaintextSize: CHUNK_SIZE_BYTES + 1,
      dataRecordCount: 2,
    };

    expect(() =>
      validateRecordSequence(
        [
          frame(0, 0, 0, 10),
          frame(2, 1, 0, CHUNK_SIZE_BYTES),
          frame(1, 1, 1, 1),
        ],
        metadata,
      ),
    ).toThrow("record indexes must be contiguous and ordered");
  });

  it("rejects incorrect final flags", () => {
    expect(() =>
      validateRecordSequence(
        [frame(0, 0, 0, 10), frame(1, 1, 0, 5)],
        textMetadata,
      ),
    ).toThrow("text data record must be final");
  });

  it("rejects a total plaintext-size mismatch", () => {
    expect(() =>
      validateRecordSequence(
        [frame(0, 0, 0, 10), frame(1, 1, 1, 4)],
        textMetadata,
      ),
    ).toThrow("text plaintext size mismatch");
  });

  it("rejects a data record where metadata should be", () => {
    expect(() =>
      validateRecordSequence(
        [frame(0, 1, 1, 5)],
        textMetadata,
      ),
    ).toThrow("first record must be metadata at index zero");
  });
});
