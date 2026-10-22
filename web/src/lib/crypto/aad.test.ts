
import { describe, expect, it } from "vitest";
import { buildAad } from "./aad";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("buildAad", () => {
  it("matches the FORMAT.md AAD vector", () => {
    const aad = buildAad({
      dropId: "00112233445566778899aabbccddeeff",
      recordType: 1,
      recordIndex: 1,
      finalFlag: 1,
      plaintextLength: 5,
    });

    expect(toHex(aad)).toBe(
      "47686f737464726f702f414541442f763100010020" +
      "3030313132323333343435353636373738383939616162626363646465656666" +
      "0100000001010000000500200000",
    );
  });

  it("rejects invalid drop IDs", () => {
    expect(() =>
      buildAad({
        dropId: "bad id",
        recordType: 1,
        recordIndex: 1,
        finalFlag: 1,
        plaintextLength: 5,
      }),
    ).toThrow("Invalid drop ID");
  });
});
