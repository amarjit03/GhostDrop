import { describe, expect, it } from "vitest";

import {
  decodeEnvelope,
  encodeEnvelope,
} from "./envelope";

import {
  decodeMetadata,
  encodeMetadata,
} from "./metadata";

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error("Invalid hex string");
  }

  return Uint8Array.from(
    hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const noncePrefix = hexToBytes("01020304050607");

const kdfSalt = hexToBytes(
  "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf" +
  "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
);

const passwordSalt = hexToBytes(
  "303132333435363738393a3b3c3d3e3f",
);

const expectedBase = hexToBytes(
  "47534450010000200000" +
  "01020304050607" +
  "a0a1a2a3a4a5a6a7a8a9aaabacadae" +
  "afb0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
);

const expectedTextMetadata = hexToBytes(
  "a600010160026a746578742f706c61696e030504010501",
);

describe("Ghostdrop v1 wire-format vectors", () => {
  describe("envelope encoding", () => {
    it("encodes the 49-byte unprotected envelope exactly", () => {
      const encoded = encodeEnvelope({
        noncePrefix,
        kdfSalt,
      });

      expect(encoded).toHaveLength(49);
      expect(bytesToHex(encoded)).toBe(bytesToHex(expectedBase));
    });

    it("encodes the 65-byte password-protected envelope exactly", () => {
      const encoded = encodeEnvelope({
        noncePrefix,
        kdfSalt,
        passwordSalt,
      });

      const expectedProtected = new Uint8Array(65);
      expectedProtected.set(expectedBase);
      expectedProtected[5] = 0x01;
      expectedProtected.set(passwordSalt, 49);

      expect(encoded).toHaveLength(65);
      expect(bytesToHex(encoded)).toBe(bytesToHex(expectedProtected));
    });
  });

  describe("envelope decoding", () => {
    it("decodes the unprotected reference vector", () => {
      const decoded = decodeEnvelope(expectedBase);

      expect(decoded.version).toBe(1);
      expect(decoded.passwordProtected).toBe(false);
      expect(decoded.chunkSize).toBe(2_097_152);
      expect(bytesToHex(decoded.noncePrefix)).toBe(
        "01020304050607",
      );
      expect(bytesToHex(decoded.kdfSalt)).toBe(
        bytesToHex(kdfSalt),
      );
      expect(decoded.passwordSalt).toBeUndefined();
    });

    it("decodes the password-protected reference vector", () => {
      const protectedBytes = new Uint8Array(65);
      protectedBytes.set(expectedBase);
      protectedBytes[5] = 0x01;
      protectedBytes.set(passwordSalt, 49);

      const decoded = decodeEnvelope(protectedBytes);

      expect(decoded.passwordProtected).toBe(true);
      expect(decoded.passwordSalt).toBeDefined();
      expect(bytesToHex(decoded.passwordSalt!)).toBe(
        bytesToHex(passwordSalt),
      );
    });

    it.each([
      ["incorrect magic", (b: Uint8Array) => { b[0] ^= 0xff; }],
      ["unsupported version", (b: Uint8Array) => { b[4] = 2; }],
      ["reserved flag bit", (b: Uint8Array) => { b[5] = 2; }],
      ["incorrect chunk size", (b: Uint8Array) => { b[9] = 1; }],
    ])("rejects %s", (_label, mutate) => {
      const malformed = expectedBase.slice();
      mutate(malformed);

      expect(() => decodeEnvelope(malformed)).toThrow();
    });

    it("rejects truncated and extended envelopes", () => {
      expect(() => decodeEnvelope(expectedBase.slice(0, 48))).toThrow();
      expect(() =>
        decodeEnvelope(new Uint8Array([...expectedBase, 0])),
      ).toThrow();
    });

    it("returns independent byte arrays when decoding", () => {
      const input = expectedBase.slice();
      const decoded = decodeEnvelope(input);

      input.fill(0);

      expect(bytesToHex(decoded.noncePrefix)).toBe(
        "01020304050607",
      );
      expect(bytesToHex(decoded.kdfSalt)).toBe(
        bytesToHex(kdfSalt),
      );
    });
  });

  describe("canonical CBOR metadata", () => {
    const textMetadata = {
      contentKind: 1 as const,
      filename: "",
      mimeType: "text/plain",
      plaintextSize: 5,
      dataRecordCount: 1,
      schemaVersion: 1 as const,
    };

    it("encodes text metadata to the exact reference bytes", () => {
      const encoded = encodeMetadata(textMetadata);

      expect(bytesToHex(encoded)).toBe(
        bytesToHex(expectedTextMetadata),
      );
    });

    it("decodes the canonical text metadata vector", () => {
      expect(decodeMetadata(expectedTextMetadata)).toEqual(
        textMetadata,
      );
    });

    it("rejects noncanonical CBOR integer encoding", () => {
      // Map size 6 is deliberately encoded non-minimally.
      const noncanonical = new Uint8Array([
        0xb8, 0x06,
        ...expectedTextMetadata.slice(1),
      ]);

      expect(() => decodeMetadata(noncanonical)).toThrow();
    });

    it("rejects trailing bytes after metadata", () => {
      const extended = new Uint8Array([
        ...expectedTextMetadata,
        0x00,
      ]);

      expect(() => decodeMetadata(extended)).toThrow();
    });
  });
});
