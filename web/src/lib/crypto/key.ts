
import {
  URL_KEY_BASE64URL_LENGTH,
  URL_KEY_BYTES,
} from "./constants";
import { decodeBase64Url, encodeBase64Url } from "./encoding";
import { randomBytes } from "./random";

export interface GeneratedUrlKey {
  keyBytes: Uint8Array;
  fragment: string;
}

export function generateUrlKey(): GeneratedUrlKey {
  const keyBytes = randomBytes(URL_KEY_BYTES);
  const encoded = encodeBase64Url(keyBytes);

  if (encoded.length !== URL_KEY_BASE64URL_LENGTH) {
    throw new Error("Unexpected URL key encoding length");
  }

  return {
    keyBytes,
    fragment: `#${encoded}`,
  };
}

/**
 * Accepts a complete browser fragment, e.g. "#AbCd...".
 * Rejects a missing "#", padding, extra characters, and bad lengths.
 */
export function parseUrlKey(fragment: string): Uint8Array {
  if (typeof fragment !== "string" || !fragment.startsWith("#")) {
    throw new Error("Invalid URL key fragment");
  }

  const encoded = fragment.slice(1);

  if (encoded.length !== URL_KEY_BASE64URL_LENGTH) {
    throw new Error("Invalid URL key length");
  }

  const keyBytes = decodeBase64Url(encoded);

  if (keyBytes.length !== URL_KEY_BYTES) {
    throw new Error("Invalid decoded URL key length");
  }

  return keyBytes;
}
