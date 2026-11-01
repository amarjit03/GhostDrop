import { argon2id } from "hash-wasm";

import { PASSWORD_SALT_BYTES } from "./constants";

export const ARGON2_MEMORY_KIB = 65_536;
export const ARGON2_ITERATIONS = 3;
export const ARGON2_PARALLELISM = 4;
export const ARGON2_OUTPUT_BYTES = 32;

export function normalizePassword(password: string): string {
  if (typeof password !== "string") {
    throw new Error("Password must be a string");
  }

  return password.normalize("NFC");
}

export async function derivePasswordKeyBytes(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  if (!(salt instanceof Uint8Array)) {
    throw new Error("Password salt must be a Uint8Array");
  }

  if (salt.length !== PASSWORD_SALT_BYTES) {
    throw new Error("Password salt must be exactly 16 bytes");
  }

  const normalized = normalizePassword(password);

  const key = await argon2id({
    password: normalized,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: ARGON2_OUTPUT_BYTES,
    outputType: "binary",
  });

  return new Uint8Array(key);
}
