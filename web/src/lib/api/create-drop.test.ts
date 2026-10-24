
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encryptText } from "../crypto/text";
import { parseFrame } from "../crypto/frame";
import {
  createDropReservation,
  uploadEnvelope,
  uploadRecord,
  finalizeDrop,
  deleteDrop,
} from "./drops";
import { createDrop } from "./create-drop";

vi.mock("../crypto/text", () => ({
  encryptText: vi.fn(),
}));

vi.mock("../crypto/frame", () => ({
  parseFrame: vi.fn(),
}));

vi.mock("./drops", () => ({
  createDropReservation: vi.fn(),
  uploadEnvelope: vi.fn(),
  uploadRecord: vi.fn(),
  finalizeDrop: vi.fn(),
  deleteDrop: vi.fn(),
}));

const mockEncryptText = vi.mocked(encryptText);
const mockParseFrame = vi.mocked(parseFrame);
const mockCreateDropReservation = vi.mocked(createDropReservation);
const mockUploadEnvelope = vi.mocked(uploadEnvelope);
const mockUploadRecord = vi.mocked(uploadRecord);
const mockFinalizeDrop = vi.mocked(finalizeDrop);
const mockDeleteDrop = vi.mocked(deleteDrop);

function makeFrame(
  index: number,
  type: number,
  finalFlag: number,
  plaintextLength = 1,
): Uint8Array {
  const frame = new Uint8Array(10 + plaintextLength + 16);
  const view = new DataView(frame.buffer);

  view.setUint32(0, index, false);
  view.setUint8(4, type);
  view.setUint8(5, finalFlag);
  view.setUint32(6, plaintextLength, false);

  return frame;
}

const metadataFrame = makeFrame(0, 0, 0);
const textFrame = makeFrame(1, 1, 1);

const envelope = new Uint8Array([10, 20, 30]);
const stream = new Uint8Array([
  ...metadataFrame,
  ...textFrame,
]);

describe("createDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateDropReservation.mockResolvedValue({
      id: "drop_test_123",
      owner_token: "owner-secret",
      limits: {
        chunk_size: 2_097_152,
        max_metadata_plaintext: 65_536,
        max_text_bytes: 2_097_152,
      },
    });

    mockEncryptText.mockResolvedValue({
      keyFragment: "#test-key-fragment",
      payload: {
        dropId: "drop_test_123",
        envelope,
        stream,
      },
    } as Awaited<ReturnType<typeof encryptText>>);

    mockParseFrame.mockImplementation((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );

      return {
        index: view.getUint32(0, false),
        type: view.getUint8(4),
        finalFlag: view.getUint8(5),
        plaintextLength: view.getUint32(6, false),
        body: frame.slice(10),
      } as ReturnType<typeof parseFrame>;
    });

    mockUploadEnvelope.mockResolvedValue({ status: "ok" });
    mockUploadRecord.mockResolvedValue({ status: "ok" });
    mockFinalizeDrop.mockResolvedValue({
      id: "drop_test_123",
      expires_at: "2026-10-25T12:00:00Z",
    });
    mockDeleteDrop.mockResolvedValue(undefined);
  });

  it("uploads the envelope and two records before finalizing", async () => {
    const result = await createDrop({
      text: "Hello Ghostdrop",
      ttlSeconds: 3600,
      maxViews: 1,
    });

    expect(mockCreateDropReservation).toHaveBeenCalledWith({
      kind: "text",
      ttl_seconds: 3600,
      max_views: 1,
      size_hint: new TextEncoder().encode("Hello Ghostdrop").length,
    });

    expect(mockEncryptText).toHaveBeenCalledWith(
      "Hello Ghostdrop",
      "drop_test_123",
    );

    expect(mockUploadEnvelope).toHaveBeenCalledWith(
      "drop_test_123",
      "owner-secret",
      envelope,
    );

    expect(mockUploadRecord).toHaveBeenCalledTimes(2);
    expect(mockUploadRecord).toHaveBeenNthCalledWith(
      1,
      "drop_test_123",
      "owner-secret",
      0,
      expect.any(Uint8Array),
    );
    expect(mockUploadRecord).toHaveBeenNthCalledWith(
      2,
      "drop_test_123",
      "owner-secret",
      1,
      expect.any(Uint8Array),
    );

    expect(mockFinalizeDrop).toHaveBeenCalledWith(
      "drop_test_123",
      "owner-secret",
      { record_count: 2 },
    );

    expect(mockDeleteDrop).not.toHaveBeenCalled();

    expect(result).toEqual({
      id: "drop_test_123",
      keyFragment: "#test-key-fragment",
      expiresAt: "2026-10-25T12:00:00Z",
      ownerToken: "owner-secret",
    });
  });

  it("rejects invalid view limits before reserving a drop", async () => {
    await expect(
      createDrop({
        text: "Hello",
        ttlSeconds: 3600,
        maxViews: 0,
      }),
    ).rejects.toThrow("View limit must be between 1 and 100.");

    expect(mockCreateDropReservation).not.toHaveBeenCalled();
  });


  it("rejects unsupported expiry durations before reserving a drop", async () => {
    await expect(
      createDrop({
        text: "Hello",
        ttlSeconds: 7200 as 3600,
        maxViews: 1,
      }),
    ).rejects.toThrow("Select a supported expiry duration.");

    expect(mockCreateDropReservation).not.toHaveBeenCalled();
  });


  it("attempts cleanup when encryption fails", async () => {
    mockEncryptText.mockRejectedValueOnce(
      new Error("Encryption failed"),
    );

    await expect(
      createDrop({
        text: "Hello",
        ttlSeconds: 3600,
        maxViews: 1,
      }),
    ).rejects.toThrow("Encryption failed");

    expect(mockDeleteDrop).toHaveBeenCalledWith(
      "drop_test_123",
      "owner-secret",
    );
  });

  it("preserves the original error when cleanup also fails", async () => {
    mockUploadEnvelope.mockRejectedValueOnce(
      new Error("Envelope upload failed"),
    );
    mockDeleteDrop.mockRejectedValueOnce(
      new Error("Cleanup failed"),
    );

    await expect(
      createDrop({
        text: "Hello",
        ttlSeconds: 3600,
        maxViews: 1,
      }),
    ).rejects.toThrow("Envelope upload failed");
  });

  it("rejects malformed encrypted streams and attempts cleanup", async () => {
    mockEncryptText.mockResolvedValueOnce({
      keyFragment: "#test-key-fragment",
      payload: {
        dropId: "drop_test_123",
        envelope,
        stream: new Uint8Array([1, 2, 3]),
      },
    } as Awaited<ReturnType<typeof encryptText>>);

    await expect(
      createDrop({
        text: "Hello",
        ttlSeconds: 3600,
        maxViews: 1,
      }),
    ).rejects.toThrow("truncated frame header");

    expect(mockDeleteDrop).toHaveBeenCalledWith(
      "drop_test_123",
      "owner-secret",
    );
  });
});
