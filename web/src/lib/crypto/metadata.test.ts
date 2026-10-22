
import { describe, expect, it } from "vitest";
import {
  decodeMetadata,
  encodeMetadata,
  type DropMetadata,
} from "./metadata";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const fileMetadata: DropMetadata = {
  contentKind: 0,
  filename: "report.txt",
  mimeType: "text/plain",
  plaintextSize: 5,
  dataRecordCount: 1,
  schemaVersion: 1,
};

const textMetadata: DropMetadata = {
  contentKind: 1,
  filename: "",
  mimeType: "text/plain",
  plaintextSize: 0,
  dataRecordCount: 1,
  schemaVersion: 1,
};

describe("canonical metadata CBOR", () => {
  it("round-trips file metadata", () => {
    const encoded = encodeMetadata(fileMetadata);
    expect(decodeMetadata(encoded)).toEqual(fileMetadata);
  });

  it("round-trips empty text metadata", () => {
    const encoded = encodeMetadata(textMetadata);
    expect(decodeMetadata(encoded)).toEqual(textMetadata);
  });

  it("produces deterministic bytes", () => {
    expect(toHex(encodeMetadata(fileMetadata))).toBe(
      toHex(encodeMetadata(fileMetadata)),
    );
  });

  it("rejects a non-NFC filename", () => {
    expect(() =>
      encodeMetadata({
        ...fileMetadata,
        filename: "cafe\u0301.txt",
      }),
    ).toThrow("filename must be NFC-normalized");
  });

  it("rejects unknown keys", () => {
    // Seven map entries instead of exactly six.
    expect(() => decodeMetadata(Uint8Array.of(0xa7))).toThrow();
  });

  it("rejects duplicate or unordered keys", () => {
    // Map with two entries using the same key.
    expect(() =>
      decodeMetadata(Uint8Array.of(0xa2, 0x00, 0x00, 0x00, 0x00)),
    ).toThrow();
  });

  it("rejects noncanonical integer encodings", () => {
    // A map of six entries, but the first key 0 is encoded
    // using an unnecessarily long representation.
    expect(() =>
      decodeMetadata(
        Uint8Array.of(
          0xa6,
          0x18, 0x00,
        ),
      ),
    ).toThrow();
  });

  it("rejects invalid UTF-8", () => {
    // A six-entry map whose first value is an unsigned integer;
    // subsequent bytes are intentionally incomplete.
    expect(() =>
      decodeMetadata(Uint8Array.of(0xa6, 0x00, 0x00, 0x01, 0x61, 0xff)),
    ).toThrow();
  });

  it("rejects text metadata with more than one data record", () => {
    expect(() =>
      encodeMetadata({
        ...textMetadata,
        dataRecordCount: 2,
      }),
    ).toThrow("text must have exactly one data record");
  });

  it("rejects file size and record-count mismatches", () => {
    expect(() =>
      encodeMetadata({
        ...fileMetadata,
        plaintextSize: 0,
        dataRecordCount: 1,
      }),
    ).toThrow("file size and data record count disagree");
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      encodeMetadata({
        ...fileMetadata,
        schemaVersion: 2 as 1,
      }),
    ).toThrow("unsupported schema version");
  });
});
