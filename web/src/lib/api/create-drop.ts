
import { encryptText } from "../crypto/text";
import { parseFrame } from "../crypto/frame";
import {
  createDropReservation,
  uploadEnvelope,
  uploadRecord,
  finalizeDrop,
  deleteDrop,
} from "./drops";
import { ApiError } from "./errors";
import type {
  CreateDropResult,
  DropTtlSeconds,
} from "./types";

export interface CreateDropOptions {
  text: string;
  ttlSeconds: DropTtlSeconds;
  maxViews: number;
}

function splitTextFrames(stream: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let offset = 0;

  while (offset < stream.length) {
    const remaining = stream.length - offset;

    if (remaining < 10) {
      throw new Error("Encrypted stream contains a truncated frame header.");
    }

    const view = new DataView(
      stream.buffer,
      stream.byteOffset + offset,
      remaining,
    );

    const plaintextLength = view.getUint32(6, false);
    const frameLength = 10 + plaintextLength + 16;

    if (frameLength > remaining) {
      throw new Error("Encrypted stream contains a truncated frame.");
    }

    frames.push(stream.slice(offset, offset + frameLength));
    offset += frameLength;
  }

  if (frames.length !== 2) {
    throw new Error("A text drop must contain exactly two encrypted records.");
  }

  // Validate each complete frame using the crypto module's parser.
  const metadataFrame = parseFrame(frames[0]!);
  const textFrame = parseFrame(frames[1]!);

  if (
    metadataFrame.index !== 0 ||
    metadataFrame.type !== 0 ||
    metadataFrame.finalFlag !== 0 ||
    textFrame.index !== 1 ||
    textFrame.type !== 1 ||
    textFrame.finalFlag !== 1
  ) {
    throw new Error("Encrypted stream has an invalid text-record sequence.");
  }

  return frames;
}

function validateOptions(options: CreateDropOptions): void {
  if (typeof options.text !== "string") {
    throw new Error("Enter text before creating a drop.");
  }

  if (![3600, 86400, 604800].includes(options.ttlSeconds)) {
    throw new Error("Select a supported expiry duration.");
  }

  if (
    !Number.isInteger(options.maxViews) ||
    options.maxViews < 1 ||
    options.maxViews > 100
  ) {
    throw new Error("View limit must be between 1 and 100.");
  }
}

export async function createDrop(
  options: CreateDropOptions,
): Promise<CreateDropResult> {
  validateOptions(options);

  const reservation = await createDropReservation({
    kind: "text",
    ttl_seconds: options.ttlSeconds,
    max_views: options.maxViews,
    size_hint: new TextEncoder().encode(options.text).length,
  });

  let finalized = false;

  try {
    const encrypted = await encryptText(options.text, reservation.id);
    const frames = splitTextFrames(encrypted.payload.stream);

    await uploadEnvelope(
      reservation.id,
      reservation.owner_token,
      encrypted.payload.envelope,
    );

    await uploadRecord(
      reservation.id,
      reservation.owner_token,
      0,
      frames[0]!,
    );

    await uploadRecord(
      reservation.id,
      reservation.owner_token,
      1,
      frames[1]!,
    );

    const result = await finalizeDrop(
      reservation.id,
      reservation.owner_token,
      { record_count: 2 },
    );

    finalized = true;

    return {
      id: reservation.id,
      keyFragment: encrypted.keyFragment,
      expiresAt: result.expires_at,
      ownerToken: reservation.owner_token,
    };
  } catch (error) {
    // Best-effort cleanup of a drop that was not successfully finalized.
    if (!finalized) {
      try {
        await deleteDrop(reservation.id, reservation.owner_token);
      } catch {
        // Preserve the original failure.
      }
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw error;
  }
}
