
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveContentKeyBytes, importContentKey } from "./kdf";
import { decryptRecord, encryptRecord } from "./records";

type RecordVector = {
  format: string;
  id: string;
  source: string;
  url_key_hex: string;
  kdf_salt_hex: string;
  hkdf_info_utf8: string;
  derived_key_hex: string;
  nonce_prefix_hex: string;
  drop_id: string;
  record_type: number;
  record_index: number;
  final_flag: number;
  chunk_size: number;
  plaintext_utf8: string;
  plaintext_hex: string;
  nonce_hex: string;
  aad_hex: string;
  ciphertext_and_tag_hex: string;
};

const vectorPath = resolve(
  process.cwd(),
  "../tests/vectors/v1-record.json",
);

const vector = JSON.parse(
  readFileSync(vectorPath, "utf8"),
) as RecordVector;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error("Invalid hex");
  }

  return Uint8Array.from(
    hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("AES-GCM record", () => {
  it("matches the shared Ghostdrop v1 record vector", async () => {
    expect(vector.format).toBe("ghostdrop-v1");

    const urlKey = hexToBytes(vector.url_key_hex);
    const salt = hexToBytes(vector.kdf_salt_hex);
    const plaintext = hexToBytes(vector.plaintext_hex);

    expect(new TextDecoder().decode(plaintext)).toBe(
      vector.plaintext_utf8,
    );

    const keyBytes = await deriveContentKeyBytes(urlKey, salt);

    expect(bytesToHex(keyBytes)).toBe(vector.derived_key_hex);

    const key = await importContentKey(keyBytes);

    const input = {
      key,
      noncePrefix: hexToBytes(vector.nonce_prefix_hex),
      dropId: vector.drop_id,
      recordIndex: vector.record_index,
      recordType: vector.record_type,
      finalFlag: vector.final_flag as 0 | 1,
      plaintext,
    };

    const encrypted = await encryptRecord(input);

    expect(bytesToHex(encrypted.body)).toBe(
      vector.ciphertext_and_tag_hex,
    );

    const decrypted = await decryptRecord(input, encrypted.body);

    expect(bytesToHex(decrypted)).toBe(vector.plaintext_hex);
    expect(new TextDecoder().decode(decrypted)).toBe(
      vector.plaintext_utf8,
    );
  });

  it("rejects modified ciphertext or authentication tag", async () => {
    const key = await importContentKey(new Uint8Array(32));
    const noncePrefix = hexToBytes(vector.nonce_prefix_hex);
    const plaintext = new TextEncoder().encode("hello");

    const input = {
      key,
      noncePrefix,
      dropId: vector.drop_id,
      recordIndex: vector.record_index,
      recordType: vector.record_type,
      finalFlag: 1 as const,
      plaintext,
    };

    const encrypted = await encryptRecord(input);

    const modifiedCiphertext = encrypted.body.slice();
    modifiedCiphertext[0] ^= 1;

    await expect(
      decryptRecord(input, modifiedCiphertext),
    ).rejects.toThrow("Unable to decrypt record");

    const modifiedTag = encrypted.body.slice();
    modifiedTag[modifiedTag.length - 1] ^= 1;

    await expect(
      decryptRecord(input, modifiedTag),
    ).rejects.toThrow("Unable to decrypt record");
  });

  it.each([
    ["different drop ID", { dropId: "10112233445566778899aabbccddeeff" }],
    ["different record index", { recordIndex: 2 }],
    ["different record type", { recordType: 0 }],
    ["different final flag", { finalFlag: 0 as const }],
  ])("rejects decryption with %s", async (_label, changes) => {
    const key = await importContentKey(new Uint8Array(32));

    const input = {
      key,
      noncePrefix: hexToBytes(vector.nonce_prefix_hex),
      dropId: vector.drop_id,
      recordIndex: vector.record_index,
      recordType: vector.record_type,
      finalFlag: 1 as const,
      plaintext: new TextEncoder().encode("hello"),
    };

    const encrypted = await encryptRecord(input);

    await expect(
      decryptRecord({ ...input, ...changes }, encrypted.body),
    ).rejects.toThrow("Unable to decrypt record");
  });
});
