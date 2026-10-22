
import { describe, expect, it } from "vitest";
import { deriveContentKeyBytes, importContentKey } from "./kdf";
import { encryptRecord, decryptRecord } from "./records";

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error("Invalid hex");
  }

  return Uint8Array.from(
    hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("AES-GCM record", () => {
  it("matches the FORMAT.md fixed encryption vector", async () => {
    const urlKey = hexToBytes(
      "000102030405060708090a0b0c0d0e0f" +
      "101112131415161718191a1b1c1d1e1f",
    );

    const salt = hexToBytes(
      "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf" +
      "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
    );

    const keyBytes = await deriveContentKeyBytes(urlKey, salt);
    const key = await importContentKey(keyBytes);

    const result = await encryptRecord({
      key,
      noncePrefix: hexToBytes("01020304050607"),
      dropId: "00112233445566778899aabbccddeeff",
      recordIndex: 1,
      recordType: 1,
      finalFlag: 1,
      plaintext: new TextEncoder().encode("hello"),
    });

    expect(bytesToHex(result.body)).toBe(
      "f2012492d7227b9baf5700f382809f4667858db6f9",
    );

    const decrypted = await decryptRecord(
      {
        key,
        noncePrefix: hexToBytes("01020304050607"),
        dropId: "00112233445566778899aabbccddeeff",
        recordIndex: 1,
        recordType: 1,
        finalFlag: 1,
        plaintext: new TextEncoder().encode("hello"),
      },
      result.body,
    );

    expect(new TextDecoder().decode(decrypted)).toBe("hello");
  });

  it("rejects modified ciphertext or authentication tag", async () => {
    const key = await importContentKey(new Uint8Array(32));
    const noncePrefix = hexToBytes("01020304050607");
    const plaintext = new TextEncoder().encode("hello");

    const input = {
      key,
      noncePrefix,
      dropId: "00112233445566778899aabbccddeeff",
      recordIndex: 1,
      recordType: 1,
      finalFlag: 1 as const,
      plaintext,
    };

    const encrypted = await encryptRecord(input);
    const tampered = encrypted.body.slice();
    tampered[0] ^= 1;

    await expect(decryptRecord(input, tampered)).rejects.toThrow(
      "Unable to decrypt record",
    );
  });
});
