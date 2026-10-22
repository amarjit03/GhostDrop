
import { describe, expect, it } from "vitest";
import {
  decodeEnvelope,
  encodeEnvelope,
} from "./envelope";
import {
  CHUNK_SIZE_BYTES,
  ENVELOPE_BASE_BYTES,
  ENVELOPE_PASSWORD_BYTES,
} from "./constants";

function sampleParameters(passwordProtected = false) {
  return {
    noncePrefix: Uint8Array.from(
      { length: 7 },
      (_, index) => index + 1,
    ),
    kdfSalt: Uint8Array.from(
      { length: 32 },
      (_, index) => 0xa0 + index,
    ),
    ...(passwordProtected
      ? {
          passwordSalt: Uint8Array.from(
            { length: 16 },
            (_, index) => 0x30 + index,
          ),
        }
      : {}),
  };
}

describe("envelope encoding", () => {
  it("encodes an envelope to exactly 49 bytes without a password", () => {
    const encoded = encodeEnvelope(sampleParameters());

    expect(encoded).toHaveLength(ENVELOPE_BASE_BYTES);
    expect([...encoded.slice(0, 4)]).toEqual([0x47, 0x53, 0x44, 0x50]);
    expect(encoded[4]).toBe(1);
    expect(encoded[5]).toBe(0);
  });

  it("encodes an envelope to exactly 65 bytes with a password", () => {
    const encoded = encodeEnvelope(sampleParameters(true));

    expect(encoded).toHaveLength(ENVELOPE_PASSWORD_BYTES);
    expect(encoded[5]).toBe(1);
  });

  it("round-trips an envelope without a password", () => {
    const parameters = sampleParameters();
    const decoded = decodeEnvelope(encodeEnvelope(parameters));

    expect(decoded.version).toBe(1);
    expect(decoded.passwordProtected).toBe(false);
    expect(decoded.chunkSize).toBe(CHUNK_SIZE_BYTES);
    expect(decoded.noncePrefix).toEqual(parameters.noncePrefix);
    expect(decoded.kdfSalt).toEqual(parameters.kdfSalt);
    expect(decoded).not.toHaveProperty("passwordSalt");
  });

  it("round-trips an envelope with a password salt", () => {
    const parameters = sampleParameters(true);
    const decoded = decodeEnvelope(encodeEnvelope(parameters));

    expect(decoded.passwordProtected).toBe(true);
    expect(decoded.passwordSalt).toEqual(parameters.passwordSalt);
  });

  it("rejects invalid magic bytes", () => {
    const encoded = encodeEnvelope(sampleParameters());
    encoded[0] = 0;

    expect(() => decodeEnvelope(encoded)).toThrow(
      "invalid magic bytes",
    );
  });

  it("rejects an unsupported version", () => {
    const encoded = encodeEnvelope(sampleParameters());
    encoded[4] = 2;

    expect(() => decodeEnvelope(encoded)).toThrow(
      "unsupported format version",
    );
  });

  it("rejects reserved flag bits", () => {
    const encoded = encodeEnvelope(sampleParameters());
    encoded[5] = 0x02;

    expect(() => decodeEnvelope(encoded)).toThrow(
      "reserved flag bits must be zero",
    );
  });

  it("rejects a length that disagrees with the password flag", () => {
    const encoded = encodeEnvelope(sampleParameters());
    encoded[5] = 0x01;

    expect(() => decodeEnvelope(encoded)).toThrow(
      "envelope length does not match flags",
    );
  });

  it("rejects an unsupported chunk size", () => {
    const encoded = encodeEnvelope(sampleParameters());
    new DataView(encoded.buffer).setUint32(6, 1024, false);

    expect(() => decodeEnvelope(encoded)).toThrow(
      "unsupported chunk size",
    );
  });

  it("rejects truncated and oversized envelopes", () => {
    const encoded = encodeEnvelope(sampleParameters());

    expect(() => decodeEnvelope(encoded.slice(0, -1))).toThrow(
      "invalid envelope length",
    );

    expect(() =>
      decodeEnvelope(new Uint8Array(ENVELOPE_PASSWORD_BYTES + 1)),
    ).toThrow("invalid envelope length");
  });

  it("rejects incorrect nonce prefix and KDF salt lengths", () => {
    expect(() =>
      encodeEnvelope({
        noncePrefix: new Uint8Array(6),
        kdfSalt: new Uint8Array(32),
      }),
    ).toThrow("nonce prefix must be exactly 7 bytes");

    expect(() =>
      encodeEnvelope({
        noncePrefix: new Uint8Array(7),
        kdfSalt: new Uint8Array(31),
      }),
    ).toThrow("KDF salt must be exactly 32 bytes");
  });

  it("rejects an incorrect password salt length", () => {
    expect(() =>
      encodeEnvelope({
        noncePrefix: new Uint8Array(7),
        kdfSalt: new Uint8Array(32),
        passwordSalt: new Uint8Array(15),
      }),
    ).toThrow("password salt must be exactly 16 bytes");
  });

  it("returns independent byte arrays when decoding", () => {
    const encoded = encodeEnvelope(sampleParameters());
    const decoded = decodeEnvelope(encoded);

    encoded[10] = 0xff;

    expect(decoded.noncePrefix[0]).toBe(1);
  });
});
