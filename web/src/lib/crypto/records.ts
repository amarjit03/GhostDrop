
import { GCM_TAG_BYTES } from "./constants";
import { buildNonce } from "./nonce";
import { buildAad } from "./aad";

export interface EncryptRecordInput {
  key: CryptoKey;
  noncePrefix: Uint8Array;
  dropId: string;
  recordIndex: number;
  recordType: number;
  finalFlag: 0 | 1;
  plaintext: Uint8Array;
}

export interface EncryptedRecord {
  index: number;
  type: number;
  finalFlag: 0 | 1;
  plaintextLength: number;
  body: Uint8Array;
}

export async function encryptRecord(
  input: EncryptRecordInput,
): Promise<EncryptedRecord> {
  if (input.key.algorithm.name !== "AES-GCM") {
    throw new Error("Invalid encryption key algorithm");
  }

  if (input.plaintext.length > 0xffffffff) {
    throw new Error("Plaintext is too large");
  }

  const nonce = buildNonce(
    input.noncePrefix,
    input.recordIndex,
    input.finalFlag,
  );

  const aad = buildAad({
    dropId: input.dropId,
    recordType: input.recordType,
    recordIndex: input.recordIndex,
    finalFlag: input.finalFlag,
    plaintextLength: input.plaintext.length,
  });

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toOwnedArrayBuffer(nonce),
      additionalData: toOwnedArrayBuffer(aad),
      tagLength: GCM_TAG_BYTES * 8,
    },
    input.key,
    toOwnedArrayBuffer(input.plaintext),
  );

  return {
    index: input.recordIndex,
    type: input.recordType,
    finalFlag: input.finalFlag,
    plaintextLength: input.plaintext.length,
    body: new Uint8Array(ciphertext),
  };
}

export async function decryptRecord(
  input: EncryptRecordInput,
  body: Uint8Array,
): Promise<Uint8Array> {
  if (input.key.algorithm.name !== "AES-GCM") {
    throw new Error("Invalid decryption key algorithm");
  }

  if (body.length < GCM_TAG_BYTES) {
    throw new Error("Invalid encrypted record length");
  }

  const nonce = buildNonce(
    input.noncePrefix,
    input.recordIndex,
    input.finalFlag,
  );

  const aad = buildAad({
    dropId: input.dropId,
    recordType: input.recordType,
    recordIndex: input.recordIndex,
    finalFlag: input.finalFlag,
    plaintextLength: body.length - GCM_TAG_BYTES,
  });

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toOwnedArrayBuffer(nonce),
        additionalData: toOwnedArrayBuffer(aad),
        tagLength: GCM_TAG_BYTES * 8,
      },
      input.key,
      toOwnedArrayBuffer(body),
    );

    return new Uint8Array(plaintext);
  } catch {
    // Do not expose cryptographic failure details.
    throw new Error("Unable to decrypt record");
  }
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
