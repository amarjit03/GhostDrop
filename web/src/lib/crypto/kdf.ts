
import {
  AES_KEY_BYTES,
  HKDF_INFO,
  KDF_SALT_BYTES,
  URL_KEY_BYTES,
} from "./constants";

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export async function deriveContentKeyBytes(
  urlKey: Uint8Array,
  kdfSalt: Uint8Array,
): Promise<Uint8Array> {
  if (urlKey.length !== URL_KEY_BYTES) {
    throw new Error("Invalid URL key length");
  }

  if (kdfSalt.length !== KDF_SALT_BYTES) {
    throw new Error("Invalid KDF salt length");
  }

  const material = await crypto.subtle.importKey(
    "raw",
    toOwnedArrayBuffer(urlKey),
    "HKDF",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toOwnedArrayBuffer(kdfSalt),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    material,
    AES_KEY_BYTES * 8,
  );

  return new Uint8Array(bits);
}

export async function importContentKey(
  keyBytes: Uint8Array,
): Promise<CryptoKey> {
  if (keyBytes.length !== AES_KEY_BYTES) {
    throw new Error("Invalid content key length");
  }

  return crypto.subtle.importKey(
    "raw",
    toOwnedArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
