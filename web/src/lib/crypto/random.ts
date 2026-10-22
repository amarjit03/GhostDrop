
export function randomBytes(length: number): Uint8Array {
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 65_536
  ) {
    throw new RangeError("Invalid random byte length");
  }

  const cryptoProvider = globalThis.crypto;

  if (
    !cryptoProvider ||
    typeof cryptoProvider.getRandomValues !== "function"
  ) {
    throw new Error("Cryptographically secure randomness unavailable");
  }

  const result = new Uint8Array(length);

  // Web Crypto limits each getRandomValues call to 65,536 bytes.
  cryptoProvider.getRandomValues(result);

  return result;
}
