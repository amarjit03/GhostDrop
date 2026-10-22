
import { describe, expect, it } from "vitest";
import { encodeFrame, parseFrame } from "./frame";
import { GCM_TAG_BYTES, RECORD_HEADER_BYTES } from "./constants";

function makeFrame(
  overrides: Partial<Parameters<typeof encodeFrame>[0]> = {},
) {
  const plaintextLength = overrides.plaintextLength ?? 5;

  return {
    index: 1,
    type: 1,
    finalFlag: 1 as const,
    plaintextLength,
    body: new Uint8Array(plaintextLength + GCM_TAG_BYTES),
    ...overrides,
  };
}

describe("record frame", () => {
  it("encodes the 10-byte header in big-endian order", () => {
    const frame = encodeFrame(makeFrame());

    expect(frame.length).toBe(RECORD_HEADER_BYTES + 5 + 16);

    // index = 1
    expect(Array.from(frame.slice(0, 4))).toEqual([0, 0, 0, 1]);

    // type = data
    expect(frame[4]).toBe(1);

    // final flag = 1; reserved bits are zero
    expect(frame[5]).toBe(1);

    // plaintext length = 5
    expect(Array.from(frame.slice(6, 10))).toEqual([0, 0, 0, 5]);
  });

  it("round-trips a frame", () => {
    const original = makeFrame({
      body: Uint8Array.from({ length: 21 }, (_, i) => i),
    });

    const encoded = encodeFrame(original);
    const parsed = parseFrame(encoded);

    expect(parsed.index).toBe(original.index);
    expect(parsed.type).toBe(original.type);
    expect(parsed.finalFlag).toBe(original.finalFlag);
    expect(parsed.plaintextLength).toBe(original.plaintextLength);
    expect(parsed.body).toEqual(original.body);
  });

  it("rejects a truncated header", () => {
    expect(() => parseFrame(new Uint8Array(9))).toThrow(
      "Truncated record header",
    );
  });

  it("rejects a truncated body", () => {
    const encoded = encodeFrame(makeFrame());
    expect(() => parseFrame(encoded.slice(0, encoded.length - 1))).toThrow();
  });

  it("rejects trailing bytes", () => {
    const encoded = encodeFrame(makeFrame());
    const withExtraByte = new Uint8Array(encoded.length + 1);
    withExtraByte.set(encoded);

    expect(() => parseFrame(withExtraByte)).toThrow(
      "Record body length mismatch",
    );
  });

  it("rejects reserved flag bits", () => {
    const encoded = encodeFrame(makeFrame());
    encoded[5] = 0x02;

    expect(() => parseFrame(encoded)).toThrow(
      "Reserved record flag bits must be zero",
    );
  });

  it("rejects unsupported record types", () => {
    const encoded = encodeFrame(makeFrame());
    encoded[4] = 0x02;

    expect(() => parseFrame(encoded)).toThrow("Invalid record type");
  });

  it("rejects body length mismatches when encoding", () => {
    expect(() =>
      encodeFrame(makeFrame({ body: new Uint8Array(10) })),
    ).toThrow("Record body length mismatch");
  });

  it("rejects invalid record indexes", () => {
    expect(() => encodeFrame(makeFrame({ index: -1 }))).toThrow(
      "Invalid record index",
    );
  });

  it("rejects plaintext lengths exceeding the data-record limit", () => {
    expect(() =>
      encodeFrame(
        makeFrame({
          plaintextLength: 2_097_153,
          body: new Uint8Array(2_097_153 + GCM_TAG_BYTES),
        }),
      ),
    ).toThrow("Plaintext exceeds record size limit");
  });
});
