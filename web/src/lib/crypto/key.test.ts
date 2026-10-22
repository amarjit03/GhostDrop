
import { describe, expect, it } from "vitest";
import {
  generateUrlKey,
  parseUrlKey,
} from "./key";

describe("URL keys", () => {
  it("generates a 32-byte key with a 43-character encoding", () => {
    const generated = generateUrlKey();

    expect(generated.keyBytes).toHaveLength(32);
    expect(generated.fragment).toMatch(/^#[A-Za-z0-9_-]{43}$/);
    expect(Array.from(parseUrlKey(generated.fragment))).toEqual(
      Array.from(generated.keyBytes),
    );
  });

  it("generates independent keys", () => {
    const first = generateUrlKey();
    const second = generateUrlKey();

    // This checks the ordinary case; randomness is not proven by this test.
    expect(Array.from(first.keyBytes)).not.toEqual(
      Array.from(second.keyBytes),
    );
  });

  it.each([
    "",
    "abc",
    "#",
    "#AA==",
    `#${"A".repeat(42)}`,
    `#${"A".repeat(44)}`,
    `#${"A".repeat(42)}!`,
    `#${"A".repeat(42)}B`, // 43 chars but noncanonical for this value.
  ])("rejects malformed fragment %j", (fragment) => {
    expect(() => parseUrlKey(fragment)).toThrow();
  });
});
