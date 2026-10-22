
import { describe, expect, it } from "vitest";
import { encryptText, decryptText } from "./text";
import { generateUrlKey } from "./key";

describe("text encryption pipeline", () => {
  it("round-trips ordinary text", async () => {
    const encrypted = await encryptText(
      "Hello from Ghostdrop",
      "test_drop_01",
    );

    expect(
      await decryptText(encrypted.payload, encrypted.keyFragment),
    ).toBe("Hello from Ghostdrop");
  });

  it("round-trips an empty string", async () => {
    const encrypted = await encryptText("", "empty_text");

    expect(
      await decryptText(encrypted.payload, encrypted.keyFragment),
    ).toBe("");
  });

  it("preserves Unicode without normalization", async () => {
    const text = "नमस्ते 👋 café e\u0301";
    const encrypted = await encryptText(text, "unicode_text");

    expect(
      await decryptText(encrypted.payload, encrypted.keyFragment),
    ).toBe(text);
  });

  it("rejects a wrong key", async () => {
    const encrypted = await encryptText("secret", "wrong_key_test");
    const wrongKey = generateUrlKey().fragment;

    await expect(
      decryptText(encrypted.payload, wrongKey),
    ).rejects.toThrow();
  });

  it("rejects a different drop ID", async () => {
    const encrypted = await encryptText("secret", "original_drop");

    await expect(
      decryptText(
        { ...encrypted.payload, dropId: "different_drop" },
        encrypted.keyFragment,
      ),
    ).rejects.toThrow();
  });

  it("rejects tampered ciphertext", async () => {
    const encrypted = await encryptText("secret", "tamper_test");
    const stream = encrypted.payload.stream.slice();
    stream[stream.length - 1] ^= 1;

    await expect(
      decryptText(
        { ...encrypted.payload, stream },
        encrypted.keyFragment,
      ),
    ).rejects.toThrow();
  });

  it("rejects a truncated stream", async () => {
    const encrypted = await encryptText("secret", "truncated_test");
    const stream = encrypted.payload.stream.slice(0, -1);

    await expect(
      decryptText(
        { ...encrypted.payload, stream },
        encrypted.keyFragment,
      ),
    ).rejects.toThrow();
  });

  it("rejects a stream with a missing record", async () => {
    const encrypted = await encryptText("secret", "missing_record");

    // Keep only the first record's frame header and body.
    const firstPlaintextLength = new DataView(
      encrypted.payload.stream.buffer,
      encrypted.payload.stream.byteOffset,
      encrypted.payload.stream.byteLength,
    ).getUint32(6, false);

    const firstFrameLength = 10 + firstPlaintextLength + 16;
    const stream = encrypted.payload.stream.slice(0, firstFrameLength);

    await expect(
      decryptText(
        { ...encrypted.payload, stream },
        encrypted.keyFragment,
      ),
    ).rejects.toThrow();
  });
});


it("rejects reordered records", async () => {
  const encrypted = await encryptText("secret", "reorder_test");
  const stream = encrypted.payload.stream;

  const firstLength =
    10 +
    new DataView(
      stream.buffer,
      stream.byteOffset,
      stream.byteLength,
    ).getUint32(6, false) +
    16;

  const first = stream.slice(0, firstLength);
  const second = stream.slice(firstLength);
  const reordered = new Uint8Array(stream.length);

  reordered.set(second, 0);
  reordered.set(first, second.length);

  await expect(
    decryptText(
      { ...encrypted.payload, stream: reordered },
      encrypted.keyFragment,
    ),
  ).rejects.toThrow();
});

it("rejects reserved bits in a record header", async () => {
  const encrypted = await encryptText("secret", "reserved_bits_test");
  const stream = encrypted.payload.stream.slice();

  stream[5] = stream[5]! | 0x02;

  await expect(
    decryptText(
      { ...encrypted.payload, stream },
      encrypted.keyFragment,
    ),
  ).rejects.toThrow("Reserved record flag bits must be zero");
});

it("rejects an invalid drop ID before decryption", async () => {
  const encrypted = await encryptText("secret", "valid_drop");

  await expect(
    decryptText(
      { ...encrypted.payload, dropId: "invalid/drop/id" },
      encrypted.keyFragment,
    ),
  ).rejects.toThrow("Invalid drop ID");
});

it("rejects an oversized stream", async () => {
  const encrypted = await encryptText("secret", "oversize_test");
  const stream = new Uint8Array(2_200_000);

  await expect(
    decryptText(
      { ...encrypted.payload, stream },
      encrypted.keyFragment,
    ),
  ).rejects.toThrow("text stream exceeds size limit");
});
