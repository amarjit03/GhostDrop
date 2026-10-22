
import { describe, expect, it } from "vitest";

import { CHUNK_SIZE_BYTES } from "./constants";
import type { DropMetadata } from "./metadata";
import { validateRecordSequence } from "./stream";
import type { RecordFrame } from "./frame";

const emptyFileMetadata: DropMetadata = {
  contentKind: 0,
  filename: "",
  mimeType: "application/octet-stream",
  plaintextSize: 0,
  dataRecordCount: 0,
  schemaVersion: 1,
};

const textMetadata: DropMetadata = {
  contentKind: 1,
  filename: "",
  mimeType: "text/plain",
  plaintextSize: 5,
  dataRecordCount: 1,
  schemaVersion: 1,
};

function frame(
  index: number,
  type: 0 | 1,
  finalFlag: 0 | 1,
  plaintextLength: number,
): RecordFrame {
  return {
    index,
    type,
    finalFlag,
    plaintextLength,
    body: new Uint8Array(plaintextLength + 16),
  };
}

function metadataFrame(finalFlag: 0 | 1 = 0): RecordFrame {
  return frame(0, 0, finalFlag, 10);
}

describe("validateRecordSequence", () => {
  describe("valid sequences", () => {
    it("accepts an empty file", () => {
      expect(() =>
        validateRecordSequence([metadataFrame(1)], emptyFileMetadata),
      ).not.toThrow();
    });

    it("accepts text with one data record", () => {
      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, 5)],
          textMetadata,
        ),
      ).not.toThrow();
    });

    it("accepts empty text", () => {
      const metadata: DropMetadata = {
        ...textMetadata,
        plaintextSize: 0,
      };

      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, 0)],
          metadata,
        ),
      ).not.toThrow();
    });

    it("accepts a file smaller than one chunk", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "small.bin",
        plaintextSize: 5,
        dataRecordCount: 1,
      };

      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, 5)],
          metadata,
        ),
      ).not.toThrow();
    });

    it("accepts a file of exactly one chunk", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "chunk.bin",
        plaintextSize: CHUNK_SIZE_BYTES,
        dataRecordCount: 1,
      };

      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, CHUNK_SIZE_BYTES)],
          metadata,
        ),
      ).not.toThrow();
    });

    it("accepts a file spanning two chunks", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "large.bin",
        plaintextSize: CHUNK_SIZE_BYTES + 1,
        dataRecordCount: 2,
      };

      expect(() =>
        validateRecordSequence(
          [
            metadataFrame(),
            frame(1, 1, 0, CHUNK_SIZE_BYTES),
            frame(2, 1, 1, 1),
          ],
          metadata,
        ),
      ).not.toThrow();
    });
  });

  describe("invalid sequence structure", () => {
    it("rejects an empty sequence", () => {
      expect(() =>
        validateRecordSequence([], emptyFileMetadata),
      ).toThrow();
    });

    it("rejects a sequence that does not start with metadata", () => {
      expect(() =>
        validateRecordSequence(
          [frame(1, 1, 1, 5)],
          textMetadata,
        ),
      ).toThrow();
    });

    it("rejects metadata with an invalid final flag", () => {
      expect(() =>
        validateRecordSequence(
          [metadataFrame(1), frame(1, 1, 1, 5)],
          textMetadata,
        ),
      ).toThrow();
    });

    it("rejects missing data records", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "missing.bin",
        plaintextSize: 5,
        dataRecordCount: 1,
      };

      expect(() =>
        validateRecordSequence([metadataFrame(1)], metadata),
      ).toThrow();
    });

    it("rejects duplicate record indexes", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "duplicate.bin",
        plaintextSize: CHUNK_SIZE_BYTES + 1,
        dataRecordCount: 2,
      };

      expect(() =>
        validateRecordSequence(
          [
            metadataFrame(),
            frame(1, 1, 0, CHUNK_SIZE_BYTES),
            frame(1, 1, 1, 1),
          ],
          metadata,
        ),
      ).toThrow("record indexes must be contiguous and ordered");
    });

    it("rejects out-of-order record indexes", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "order.bin",
        plaintextSize: CHUNK_SIZE_BYTES + 1,
        dataRecordCount: 2,
      };

      expect(() =>
        validateRecordSequence(
          [
            metadataFrame(),
            frame(2, 1, 0, CHUNK_SIZE_BYTES),
            frame(1, 1, 1, 1),
          ],
          metadata,
        ),
      ).toThrow("record indexes must be contiguous and ordered");
    });

    it("rejects an extra data record", () => {
      expect(() =>
        validateRecordSequence(
          [
            metadataFrame(),
            frame(1, 1, 1, 5),
            frame(2, 1, 1, 1),
          ],
          textMetadata,
        ),
      ).toThrow();
    });
  });

  describe("metadata consistency", () => {
    it("rejects a file size and record count mismatch", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "mismatch.bin",
        plaintextSize: 5,
        dataRecordCount: 2,
      };

      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, 5)],
          metadata,
        ),
      ).toThrow("Invalid stream: data record count mismatch");
    });

    it("rejects text with multiple data records", () => {
      const metadata: DropMetadata = {
        ...textMetadata,
        dataRecordCount: 2,
      };

      expect(() =>
        validateRecordSequence(
          [
            metadataFrame(),
            frame(1, 1, 0, 3),
            frame(2, 1, 1, 2),
          ],
          metadata,
        ),
      ).toThrow();
    });

    it("rejects text whose data length differs from metadata", () => {
      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, 4)],
          textMetadata,
        ),
      ).toThrow();
    });

    it("rejects a data record for an empty file", () => {
      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, 1)],
          emptyFileMetadata,
        ),
      ).toThrow();
    });

    it("rejects an empty file data record when data is required", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "empty-record.bin",
        plaintextSize: 1,
        dataRecordCount: 1,
      };

      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 1, 0)],
          metadata,
        ),
      ).toThrow("file data records cannot be empty");
    });
  });

  describe("chunk and final-flag rules", () => {
    it("rejects a non-final file chunk smaller than the chunk size", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "short-chunk.bin",
        plaintextSize: CHUNK_SIZE_BYTES + 1,
        dataRecordCount: 2,
      };

      expect(() =>
        validateRecordSequence(
          [
            metadataFrame(),
            frame(1, 1, 0, CHUNK_SIZE_BYTES - 1),
            frame(2, 1, 1, 2),
          ],
          metadata,
        ),
      ).toThrow();
    });

    it("rejects a non-final chunk marked final", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "flags.bin",
        plaintextSize: CHUNK_SIZE_BYTES + 1,
        dataRecordCount: 2,
      };

      expect(() =>
        validateRecordSequence(
          [
            metadataFrame(),
            frame(1, 1, 1, CHUNK_SIZE_BYTES),
            frame(2, 1, 1, 1),
          ],
          metadata,
        ),
      ).toThrow();
    });

    it("rejects a final chunk without the final flag", () => {
      const metadata: DropMetadata = {
        ...emptyFileMetadata,
        filename: "missing-final.bin",
        plaintextSize: 5,
        dataRecordCount: 1,
      };

      expect(() =>
        validateRecordSequence(
          [metadataFrame(), frame(1, 1, 0, 5)],
          metadata,
        ),
      ).toThrow();
    });
  });
});
