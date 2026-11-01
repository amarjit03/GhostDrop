import {
  CHUNK_SIZE_BYTES,
  GCM_TAG_BYTES,
  KDF_SALT_BYTES,
  MAX_METADATA_BYTES,
  MAX_TEXT_BYTES,
  NONCE_PREFIX_BYTES,
  PASSWORD_SALT_BYTES,
  RECORD_HEADER_BYTES,
  RECORD_TYPE_DATA,
  RECORD_TYPE_METADATA,
} from "./constants";
import { encodeEnvelope, decodeEnvelope } from "./envelope";
import { deriveContentKeyBytes, importContentKey } from "./kdf";
import { generateUrlKey, parseUrlKey } from "./key";
import { encodeMetadata, decodeMetadata } from "./metadata";
import { encryptRecord, decryptRecord } from "./records";
import { encodeFrame, parseFrame } from "./frame";
import { validateRecordSequence } from "./stream";
import { derivePasswordKeyBytes } from "./password";
import type { RecordFrame } from "./frame";

export interface EncryptedTextPayload {
  /** Server-visible drop identifier, authenticated by every record. */
  dropId: string;
  /** Serialized Ghostdrop envelope containing public crypto parameters. */
  envelope: Uint8Array;
  /** Concatenated encrypted metadata and text records. */
  stream: Uint8Array;
}

export interface EncryptedTextDrop {
  /** Keep this fragment separate from the server payload. */
  keyFragment: string;
  payload: EncryptedTextPayload;
}

const MAX_TEXT_STREAM_BYTES =
  MAX_TEXT_BYTES +
  MAX_METADATA_BYTES +
  2 * (RECORD_HEADER_BYTES + GCM_TAG_BYTES);

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function validateDropId(dropId: unknown): asserts dropId is string {
  if (
    typeof dropId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(dropId)
  ) {
    throw new Error("Invalid drop ID");
  }
}

/**
 * Split a concatenated stream into exactly two complete text-drop frames.
 * Enforce size limits before parsing or copying frame bodies.
 */
function parseFrameStream(stream: Uint8Array): RecordFrame[] {
  if (stream.length === 0) {
    throw new Error("Invalid stream: stream is empty");
  }

  if (stream.length > MAX_TEXT_STREAM_BYTES) {
    throw new Error("Invalid stream: text stream exceeds size limit");
  }

  const frames: RecordFrame[] = [];
  let offset = 0;

  while (offset < stream.length) {
    if (frames.length >= 2) {
      throw new Error("Invalid stream: too many text records");
    }

    const remaining = stream.length - offset;

    if (remaining < RECORD_HEADER_BYTES) {
      throw new Error("Truncated record header");
    }

    const view = new DataView(
      stream.buffer,
      stream.byteOffset + offset,
      remaining,
    );

    const type = stream[offset + 4]!;
    const flags = stream[offset + 5]!;
    const plaintextLength = view.getUint32(6, false);

    if ((flags & 0xfe) !== 0) {
      throw new Error("Reserved record flag bits must be zero");
    }

    const maxLength =
      type === RECORD_TYPE_METADATA
        ? MAX_METADATA_BYTES
        : type === RECORD_TYPE_DATA
          ? CHUNK_SIZE_BYTES
          : -1;

    if (maxLength < 0) {
      throw new Error("Invalid record type");
    }

    if (plaintextLength > maxLength) {
      throw new Error("Plaintext exceeds record size limit");
    }

    const frameLength =
      RECORD_HEADER_BYTES + plaintextLength + GCM_TAG_BYTES;

    if (frameLength > remaining) {
      throw new Error("Truncated record body");
    }

    frames.push(
      parseFrame(stream.subarray(offset, offset + frameLength)),
    );

    offset += frameLength;
  }

  if (frames.length !== 2) {
    throw new Error("Invalid stream: text must contain two records");
  }

  return frames;
}

async function deriveCryptoKey(
  urlKey: Uint8Array,
  kdfSalt: Uint8Array,
  password?: string,
  passwordSalt?: Uint8Array,
): Promise<CryptoKey> {
  const hasPassword = typeof password === "string" && password.length > 0;

  if (hasPassword) {
    if (!(passwordSalt instanceof Uint8Array) || passwordSalt.length !== PASSWORD_SALT_BYTES) {
      throw new Error("Invalid password salt length");
    }

    const passwordKey = await derivePasswordKeyBytes(password, passwordSalt);
    const combined = new Uint8Array(urlKey.length + passwordKey.length);
    combined.set(urlKey, 0);
    combined.set(passwordKey, urlKey.length);
    passwordKey.fill(0);

    try {
      const rawKey = await deriveContentKeyBytes(combined, kdfSalt);
      try {
        return await importContentKey(rawKey);
      } finally {
        rawKey.fill(0);
      }
    } finally {
      combined.fill(0);
    }
  }

  const rawKey = await deriveContentKeyBytes(urlKey, kdfSalt);

  try {
    return await importContentKey(rawKey);
  } finally {
    rawKey.fill(0);
  }
}

/**
 * Encrypt a text drop.
 *
 * The key fragment is returned separately and must never be sent
 * to the backend. The payload contains only the drop ID, envelope,
 * and encrypted record stream.
 */
export async function encryptText(
  text: string,
  dropId: string,
  password?: string,
): Promise<EncryptedTextDrop> {
  validateDropId(dropId);

  if (typeof text !== "string") {
    throw new Error("Text must be a string");
  }

  const passwordEnabled = typeof password === "string" && password.length > 0;
  const passwordSalt = passwordEnabled ? randomBytes(PASSWORD_SALT_BYTES) : undefined;

  const textBytes = new TextEncoder().encode(text);

  if (textBytes.length > MAX_TEXT_BYTES) {
    textBytes.fill(0);
    throw new Error("Text exceeds maximum size");
  }

  // Reject unpaired UTF-16 surrogates that TextEncoder would replace.
  if (new TextDecoder("utf-8", { fatal: true }).decode(textBytes) !== text) {
    textBytes.fill(0);
    throw new Error("Text contains invalid Unicode");
  }

  const { keyBytes, fragment } = generateUrlKey();
  const kdfSalt = randomBytes(KDF_SALT_BYTES);
  const noncePrefix = randomBytes(NONCE_PREFIX_BYTES);

  let metadataBytes: Uint8Array | undefined;

  try {
    const envelope = encodeEnvelope({
      noncePrefix,
      kdfSalt,
      ...(passwordSalt ? { passwordSalt } : {}),
    });

    const key = await deriveCryptoKey(
      keyBytes,
      kdfSalt,
      passwordEnabled ? password : undefined,
      passwordEnabled ? passwordSalt : undefined,
    );

    metadataBytes = encodeMetadata({
      contentKind: 1,
      filename: "",
      mimeType: "text/plain",
      plaintextSize: textBytes.length,
      dataRecordCount: 1,
      schemaVersion: 1,
    });

    const metadataRecord = await encryptRecord({
      key,
      noncePrefix,
      dropId,
      recordIndex: 0,
      recordType: RECORD_TYPE_METADATA,
      finalFlag: 0,
      plaintext: metadataBytes,
    });

    const textRecord = await encryptRecord({
      key,
      noncePrefix,
      dropId,
      recordIndex: 1,
      recordType: RECORD_TYPE_DATA,
      finalFlag: 1,
      plaintext: textBytes,
    });

    const stream = concatenate([
      encodeFrame(metadataRecord),
      encodeFrame(textRecord),
    ]);

    return {
      keyFragment: fragment,
      payload: {
        dropId,
        envelope,
        stream,
      },
    };
  } finally {
    keyBytes.fill(0);
    kdfSalt.fill(0);
    noncePrefix.fill(0);
    textBytes.fill(0);
    metadataBytes?.fill(0);
    passwordSalt?.fill(0);
  }
}

/**
 * Decrypt a text drop.
 *
 * No plaintext is returned until both records authenticate, metadata
 * and stream structure validate, and the text is valid UTF-8.
 */
export async function decryptText(
  payload: EncryptedTextPayload,
  keyFragment: string,
  password?: string,
): Promise<string> {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Invalid text payload");
  }

  validateDropId(payload.dropId);

  if (!(payload.envelope instanceof Uint8Array)) {
    throw new Error("Invalid envelope");
  }

  if (!(payload.stream instanceof Uint8Array)) {
    throw new Error("Invalid text stream");
  }

  const envelopeBytes = payload.envelope.slice();
  const stream = payload.stream.slice();

  let kdfSalt: Uint8Array | undefined;
  let noncePrefix: Uint8Array | undefined;
  let urlKey: Uint8Array | undefined;
  let metadataBytes: Uint8Array | undefined;
  let textBytes: Uint8Array | undefined;

  try {
    const envelope = decodeEnvelope(envelopeBytes);

    if (envelope.passwordProtected && (!password || password.length === 0)) {
      throw new Error("Password required to decrypt this drop.");
    }

    kdfSalt = envelope.kdfSalt;
    noncePrefix = envelope.noncePrefix;

    const frames = parseFrameStream(stream);
    const metadataFrame = frames[0]!;

    urlKey = parseUrlKey(keyFragment);
    const key = await deriveCryptoKey(
      urlKey,
      kdfSalt,
      envelope.passwordProtected ? password : undefined,
      envelope.passwordProtected ? envelope.passwordSalt : undefined,
    );

    urlKey.fill(0);
    urlKey = undefined;

    metadataBytes = await decryptRecord(
      {
        key,
        noncePrefix,
        dropId: payload.dropId,
        recordIndex: metadataFrame.index,
        recordType: metadataFrame.type,
        finalFlag: metadataFrame.finalFlag,
        plaintext: new Uint8Array(0),
      },
      metadataFrame.body,
    );

    if (metadataBytes.length !== metadataFrame.plaintextLength) {
      throw new Error("Invalid metadata record length");
    }

    const metadata = decodeMetadata(metadataBytes);
    const textFrame = frames[1]!;

    try {
      textBytes = await decryptRecord(
        {
          key,
          noncePrefix,
          dropId: payload.dropId,
          recordIndex: textFrame.index,
          recordType: textFrame.type,
          finalFlag: textFrame.finalFlag,
          plaintext: new Uint8Array(0),
        },
        textFrame.body,
      );
    } catch {
      if (envelope.passwordProtected) {
        throw new Error("Incorrect password or invalid key.");
      }
      throw new Error("Unable to decrypt this drop. The link may be invalid or the content may have been altered.");
    }

    if (textBytes.length !== textFrame.plaintextLength) {
      throw new Error("Invalid text record length");
    }

    validateRecordSequence(frames, metadata);

    if (metadata.contentKind !== 1) {
      throw new Error("Invalid stream: payload is not a text drop");
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(textBytes);
    } catch {
      throw new Error("Invalid text: plaintext is not valid UTF-8");
    }
  } finally {
    urlKey?.fill(0);
    metadataBytes?.fill(0);
    textBytes?.fill(0);
    kdfSalt?.fill(0);
    noncePrefix?.fill(0);
    envelopeBytes.fill(0);
    stream.fill(0);
  }
}
