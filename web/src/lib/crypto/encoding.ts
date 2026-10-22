
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encodeBase64Url(bytes: Uint8Array): string {
  let result = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;

    const b = hasB ? bytes[i + 1]! : 0;
    const c = hasC ? bytes[i + 2]! : 0;

    result += BASE64URL_ALPHABET[a >> 2];
    result += BASE64URL_ALPHABET[((a & 0x03) << 4) | (b >> 4)];

    if (hasB) {
      result += BASE64URL_ALPHABET[((b & 0x0f) << 2) | (c >> 6)];
    }

    if (hasC) {
      result += BASE64URL_ALPHABET[c & 0x3f];
    }
  }

  return result;
}

export function decodeBase64Url(value: string): Uint8Array {
  if (typeof value !== "string") {
    throw new TypeError("Invalid Base64URL input");
  }

  // Padding is forbidden; only the URL-safe alphabet is allowed.
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error("Invalid Base64URL characters");
  }

  // A Base64 string cannot have a length congruent to 1 modulo 4.
  if (value.length % 4 === 1) {
    throw new Error("Invalid Base64URL length");
  }

  const output: number[] = [];
  let accumulator = 0;
  let bits = 0;

  for (const char of value) {
    const digit = BASE64URL_ALPHABET.indexOf(char);

    if (digit < 0) {
      throw new Error("Invalid Base64URL characters");
    }

    accumulator = (accumulator << 6) | digit;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output.push((accumulator >> bits) & 0xff);
    }
  }

  // Reject noncanonical encodings with non-zero unused bits.
  const decoded = new Uint8Array(output);

  if (encodeBase64Url(decoded) !== value) {
    throw new Error("Noncanonical Base64URL encoding");
  }

  return decoded;
}
