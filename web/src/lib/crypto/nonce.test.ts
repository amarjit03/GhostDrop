
import { describe, expect, it } from "vitest";
import { buildNonce } from "./nonce";

describe("buildNonce", () => {
  it("matches the FORMAT.md nonce vector", () => {
    const nonce = buildNonce(
      Uint8Array.from([1, 2, 3, 4, 5, 6, 7]),
      1,
      1,
    );

    expect(
      Array.from(nonce, (b) => b.toString(16).padStart(2, "0")).join(""),
    ).toBe("010203040506070000000101");
  });

  it("rejects invalid prefix lengths", () => {
    expect(() => buildNonce(new Uint8Array(6), 1, 1)).toThrow();
  });

  it("rejects invalid indexes", () => {
    expect(() => buildNonce(new Uint8Array(7), -1, 1)).toThrow();
    expect(() => buildNonce(new Uint8Array(7), 1.5, 1)).toThrow();
  });
});
