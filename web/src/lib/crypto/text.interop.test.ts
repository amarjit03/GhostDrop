import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decryptText, encryptText } from "./text";
import type { EncryptedTextPayload } from "./text";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const pythonInterop = resolve(repoRoot, "scripts/ghostdrop_text_interop.py");

interface SerializedDrop {
  keyFragment: string;
  payload: {
    dropId: string;
    envelope: number[];
    stream: number[];
  };
}

function asPayload(drop: SerializedDrop): EncryptedTextPayload {
  return {
    dropId: drop.payload.dropId,
    envelope: Uint8Array.from(drop.payload.envelope),
    stream: Uint8Array.from(drop.payload.stream),
  };
}

function runPython(mode: "produce" | "consume", input?: SerializedDrop) {
  return spawnSync("python3", [pythonInterop, mode], {
    cwd: repoRoot,
    encoding: "utf8",
    input: input === undefined ? undefined : JSON.stringify(input),
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe("Python ↔ TypeScript text-drop interoperability", () => {
  it("decrypts a complete text drop produced independently by Python", async () => {
    const produced = runPython("produce");
    expect(produced.status, produced.stderr).toBe(0);
    const drop = JSON.parse(produced.stdout) as SerializedDrop;

    await expect(decryptText(asPayload(drop), drop.keyFragment)).resolves.toBe(
      "Python → TypeScript interop 🌱\nsecond line",
    );
  });

  it("lets the independent Python implementation decrypt a TypeScript-produced drop", async () => {
    const plaintext = "TypeScript → Python interop 🧪\nsecond line";
    const encrypted = await encryptText(plaintext, "typescript_interop_01");
    const serialized: SerializedDrop = {
      keyFragment: encrypted.keyFragment,
      payload: {
        dropId: encrypted.payload.dropId,
        envelope: Array.from(encrypted.payload.envelope),
        stream: Array.from(encrypted.payload.stream),
      },
    };

    const consumed = runPython("consume", serialized);
    expect(consumed.status, consumed.stderr).toBe(0);
    expect(consumed.stdout).toBe(plaintext);
  });

  it("rejects ciphertext tampering in both implementations", async () => {
    const encrypted = await encryptText("authenticated text", "interop_tamper_01");
    const tamperedStream = encrypted.payload.stream.slice();
    tamperedStream[tamperedStream.length - 1] ^= 1;
    const tamperedPayload: EncryptedTextPayload = {
      ...encrypted.payload,
      stream: tamperedStream,
    };

    await expect(decryptText(tamperedPayload, encrypted.keyFragment)).rejects.toThrow();

    const serialized: SerializedDrop = {
      keyFragment: encrypted.keyFragment,
      payload: {
        dropId: encrypted.payload.dropId,
        envelope: Array.from(encrypted.payload.envelope),
        stream: Array.from(tamperedStream),
      },
    };
    const consumed = runPython("consume", serialized);
    expect(consumed.status).not.toBe(0);
    expect(consumed.stdout).toBe("");
  });
});
