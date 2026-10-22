
import { NONCE_PREFIX_BYTES, GCM_NONCE_BYTES } from "./constants";

export function buildNonce(
  noncePrefix: Uint8Array,
  recordIndex: number,
  finalFlag: 0 | 1,
): Uint8Array<ArrayBuffer> {
  if (noncePrefix.length !== NONCE_PREFIX_BYTES) {
    throw new Error("Invalid nonce prefix length");
  }

  if (
    !Number.isInteger(recordIndex) ||
    recordIndex < 0 ||
    recordIndex > 0xffffffff
  ) {
    throw new Error("Invalid record index");
  }

  if (finalFlag !== 0 && finalFlag !== 1) {
    throw new Error("Invalid final flag");
  }

  const nonce = new Uint8Array(GCM_NONCE_BYTES);
  nonce.set(noncePrefix, 0);

  const view = new DataView(nonce.buffer);
  view.setUint32(NONCE_PREFIX_BYTES, recordIndex, false);
  nonce[11] = finalFlag;

  return nonce;
}
