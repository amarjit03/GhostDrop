
import { describe, expect, it } from "vitest";
import {
  decodeBase64Url,
  encodeBase64Url,
} from "./encoding";

describe("Base64URL encoding", () => {
  it.each([
    [[], ""],
    [[0], "AA"],
    [[0xff], "_w"],
    [[0, 1], "AAE"],
    [[0, 1, 2], "AAEC"],
    [[0xfb, 0xff], "-_8"],
  ])("round-trips %j", (input, expected) => {
    const bytes = new Uint8Array(input);

    expect(encodeBase64Url(bytes)).toBe(expected);
    expect(Array.from(decodeBase64Url(expected))).toEqual(input);
  });

  it.each([
    "A",
    "AA=",
    "AA==",
    "AA+/",
    "AA A",
    "é",
    "AB", // Noncanonical: unused bits are non-zero.
  ])("rejects invalid input %j", (input) => {
    expect(() => decodeBase64Url(input)).toThrow();
  });

  it("supports arbitrary bytes without padding", () => {
    const bytes = Uint8Array.from(
      { length: 256 },
      (_, index) => index,
    );

    const encoded = encodeBase64Url(bytes);

    expect(encoded).not.toContain("=");
    expect(Array.from(decodeBase64Url(encoded))).toEqual(
      Array.from(bytes),
    );
  });
});
