
import { describe, expect, it } from "vitest";
import { randomBytes } from "./random";

describe("secure random bytes", () => {
  it("returns the requested number of bytes", () => {
    expect(randomBytes(32)).toHaveLength(32);
    expect(randomBytes(0)).toHaveLength(0);
  });

  it.each([-1, 1.5, NaN, Infinity, 65_537])(
    "rejects invalid length %s",
    (length) => {
      expect(() => randomBytes(length)).toThrow();
    },
  );
});
