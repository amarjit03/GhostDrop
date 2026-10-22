
import { describe, expect, it } from "vitest";
import { deriveContentKeyBytes, importContentKey } from "./kdf";

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const matches = hex.match(/.{2}/g);
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error("Invalid hex");
  }

  return Uint8Array.from(
    matches?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("deriveContentKeyBytes", () => {
  it("matches the fixed HKDF-SHA-256 vector from FORMAT.md", async () => {
    const urlKey = hexToBytes(
      "000102030405060708090a0b0c0d0e0f" +
        "101112131415161718191a1b1c1d1e1f",
    );

    const salt = hexToBytes(
      "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf" +
        "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
    );

    const keyBytes = await deriveContentKeyBytes(urlKey, salt);

    expect(bytesToHex(keyBytes)).toBe(
      "cd12dd1230882b16941d09612c81fe48" +
        "8bbf7c1bb702d44e893da0a182ec0232",
    );
  });

  it("imports derived bytes as a non-exportable AES-GCM key", async () => {
    const rawKey = new Uint8Array(32);
    const key = await importContentKey(rawKey);

    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(["encrypt", "decrypt"]);
  });

  it("rejects invalid URL key length", async () => {
    await expect(
      deriveContentKeyBytes(new Uint8Array(31), new Uint8Array(32)),
    ).rejects.toThrow("Invalid URL key length");
  });

  it("rejects invalid KDF salt length", async () => {
    await expect(
      deriveContentKeyBytes(new Uint8Array(32), new Uint8Array(31)),
    ).rejects.toThrow("Invalid KDF salt length");
  });
});
