import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Ghostdrop v1 fixtures", () => {
  it("loads the known-answer vector", () => {
    const path = new URL(
      "../../fixtures/vectors.v1.json",
      import.meta.url,
    );

    const fixture = JSON.parse(readFileSync(path, "utf8"));

    expect(fixture.version).toBe(1);
    expect(fixture.vectors).toHaveLength(1);

    const vector = fixture.vectors[0];

    expect(vector.name).toBe("data-record-hello-no-password");
    expect(vector.plaintext_utf8).toBe("hello");
    expect(vector.content_key_hex).toBe(
      "cd12dd1230882b16941d09612c81fe488bbf7c1bb702d44e893da0a182ec0232",
    );
    expect(vector.ciphertext_and_tag_hex).toBe(
      "f2012492d7227b9baf5700f382809f4667858db6f9",
    );
  });
});
