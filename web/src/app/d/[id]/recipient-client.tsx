"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { consumeDrop } from "@/lib/api/drops";
import { ApiError } from "@/lib/api/errors";
import { decodeBase64Url } from "@/lib/crypto/encoding";
import {
  captureKey,
  clearCapturedKey,
} from "@/lib/crypto/key-store";
import { decryptText } from "@/lib/crypto/text";

interface RecipientClientProps {
  id: string;
}

type PageState = "loading" | "success" | "error";

interface DownloadRecord {
  index: number;
  frame_bytes: number;
  url: string;
}

interface OpenDropResult {
  plaintext: string;
}

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const HEADER_BYTES = 10;
const GCM_TAG_BYTES = 16;
const MAX_FRAME_BYTES = MAX_TEXT_BYTES + HEADER_BYTES + GCM_TAG_BYTES;
const DOWNLOAD_TIMEOUT_MS = 30_000;

async function downloadFrames(
  records: DownloadRecord[],
): Promise<Uint8Array> {
  if (records.length !== 2) {
    throw new Error("This drop has an invalid record count.");
  }

  const ordered = [...records].sort((a, b) => a.index - b.index);

  if (ordered[0]?.index !== 0 || ordered[1]?.index !== 1) {
    throw new Error("This drop has invalid record indexes.");
  }

  const frames: Uint8Array[] = [];

  try {
    for (const record of ordered) {
      if (
        !Number.isSafeInteger(record.frame_bytes) ||
        record.frame_bytes < HEADER_BYTES + GCM_TAG_BYTES ||
        record.frame_bytes > MAX_FRAME_BYTES
      ) {
        throw new Error("The server returned invalid record metadata.");
      }

      const url = new URL(record.url);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("The server returned an invalid download URL.");
      }

      const controller = new AbortController();
      let timedOut = false;

      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, DOWNLOAD_TIMEOUT_MS);

      let bytes: Uint8Array;

      try {
        const response = await fetch(url, {
          method: "GET",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to download the encrypted content.");
        }

        // The timeout also covers reading the response body.
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        if (timedOut) {
          throw new Error("Encrypted download timed out.");
        }

        throw new Error("Unable to download the encrypted content.");
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (bytes.length !== record.frame_bytes) {
        bytes.fill(0);
        throw new Error("The downloaded record has an invalid size.");
      }

      frames.push(bytes);
    }

    const totalLength = frames.reduce(
      (sum, frame) => sum + frame.length,
      0,
    );

    const stream = new Uint8Array(totalLength);
    let offset = 0;

    for (const frame of frames) {
      stream.set(frame, offset);
      offset += frame.length;
    }

    return stream;
  } finally {
    for (const frame of frames) {
      frame.fill(0);
    }
  }
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "This drop is unavailable, expired, or has reached its view limit.";
    }

    if (error.code === "NETWORK_ERROR") {
      return "Unable to connect. Check your connection and try again.";
    }
  }

  if (error instanceof Error) {
    if (/timed out/i.test(error.message)) {
      return "The encrypted download timed out. Your view may already have been used, so avoid refreshing the link.";
    }

    if (/url key|key fragment|decoded url key/i.test(error.message)) {
      return "The share link is missing a valid decryption key.";
    }

    if (/password-protected/i.test(error.message)) {
      return "This drop requires password protection, which this version does not support yet.";
    }

    if (/decrypt|authenticat|operation-specific/i.test(error.message)) {
      return "Unable to decrypt this drop. The link may be invalid or the content may have been altered.";
    }

    if (/invalid|malformed|record count|record indexes/i.test(error.message)) {
      return "This drop is malformed or the share link is invalid.";
    }
  }

  return "Unable to open this drop. It may have expired, been consumed, or become unavailable.";
}

/**
 * Runs the one-time consume/download/decrypt operation.
 *
 * Keeping the promise in a ref allows React Strict Mode's effect replay
 * to reuse the same operation instead of consuming a second view.
 */
async function openDrop(id: string, password?: string): Promise<OpenDropResult> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error("Invalid drop ID.");
  }

  // The URL fragment is available only in the browser.
  const keyFragment = captureKey(id);

  let envelopeBytes: Uint8Array | undefined;
  let stream: Uint8Array | undefined;

  try {
    // Do not automatically retry this view-consuming request.
    const drop = await consumeDrop(id);

    if (drop.password_required) {
      if (typeof password !== "string" || password.length === 0) {
        throw new Error("Password is required to open this drop.");
      }
    }

    if (drop.record_count !== 2 || drop.records.length !== 2) {
      throw new Error("This drop has an invalid record count.");
    }

    envelopeBytes = decodeBase64Url(drop.envelope);
    stream = await downloadFrames(drop.records);

    const plaintext = await decryptText(
      {
        dropId: id,
        envelope: envelopeBytes,
        stream,
      },
      keyFragment,
      password,
    );

    return { plaintext };
  } finally {
    stream?.fill(0);
    envelopeBytes?.fill(0);
    clearCapturedKey(id);
  }
}

export default function RecipientClient({ id }: RecipientClientProps) {
  const [status, setStatus] = useState<PageState>("loading");
  const [message, setMessage] = useState(
    "Downloading and decrypting your secret…",
  );
  const [plaintext, setPlaintext] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  // One promise per ID prevents a duplicate consume request during effect replay.
  const operations = useRef(
    new Map<string, Promise<OpenDropResult>>(),
  );

  useEffect(() => {
    let active = true;

    let operation = operations.current.get(id);

    if (!operation) {
      operation = openDrop(id, password || undefined);
      operations.current.set(id, operation);
    }

    void operation.then(
      (result) => {
        if (!active) return;

        setPlaintext(result.plaintext);
        setMessage("Decryption successful.");
        setStatus("success");
      },
      (error: unknown) => {
        if (!active) return;

        if (error instanceof Error && /password/i.test(error.message)) {
          setPasswordError(error.message);
          setStatus("error");
          setMessage("This drop is password protected.");
          return;
        }

        setMessage(getSafeErrorMessage(error));
        setStatus("error");
      },
    );

    return () => {
      // Ignore this effect's result if it is no longer active.
      active = false;
    };
  }, [id, password]);

  const runPasswordOpen = async () => {
    if (!password.trim()) {
      setPasswordError("Enter the password to unlock this drop.");
      return;
    }

    setPasswordPending(true);
    setPasswordError("");
    setStatus("loading");
    setMessage("Checking the password and decrypting your secret…");

    try {
      const result = await openDrop(id, password);
      setPlaintext(result.plaintext);
      setMessage("Decryption successful.");
      setStatus("success");
    } catch (error) {
      setMessage(
        error instanceof Error && /password|incorrect/i.test(error.message)
          ? "That password did not work. Please try again."
          : getSafeErrorMessage(error),
      );
      setPasswordError(
        error instanceof Error && /password|incorrect/i.test(error.message)
          ? "That password did not work. Please try again."
          : "",
      );
      setStatus("error");
    } finally {
      setPasswordPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8 sm:px-8">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <Link
          href="/"
          className="text-sm font-semibold text-zinc-100 transition hover:text-violet-300"
        >
          Ghostdrop
        </Link>

        <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400">
          Private drop
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-12">
        <div className="mb-7">
          <p className="mb-3 text-sm font-medium text-violet-300">
            Encrypted message
          </p>

          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {status === "success"
              ? "Your secret is ready"
              : status === "error"
                ? "Unable to open this drop"
                : "Opening your secret…"}
          </h1>

          <p
            className="mt-3 text-sm leading-6 text-zinc-400"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        </div>

        {status === "loading" && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <span
              aria-hidden="true"
              className="size-5 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300"
            />
            <p className="text-sm text-zinc-300">
              Verifying and decrypting in your browser…
            </p>
          </div>
        )}

        {status === "error" && !plaintext && (
          <div className="space-y-4 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-5">
            <div>
              <label
                htmlFor="drop-password"
                className="mb-2 block text-sm font-medium text-zinc-200"
              >
                Password
              </label>
              <input
                id="drop-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordError("");
                }}
                placeholder="Enter the drop password"
                disabled={passwordPending}
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 disabled:opacity-60"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-red-200">{passwordError}</p>
            )}

            <button
              type="button"
              onClick={runPasswordOpen}
              disabled={passwordPending || !password.trim()}
              className="w-full rounded-xl bg-violet-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {passwordPending ? "Checking password…" : "Open drop"}
            </button>

            <Link
              href="/"
              className="inline-flex rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5"
            >
              Go to Ghostdrop
            </Link>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-emerald-300">
                Decrypted plaintext
              </p>

              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7 text-zinc-100">
                {plaintext}
              </pre>
            </div>

            <p className="text-xs leading-5 text-zinc-500">
              Keep this message private. Your browser authenticated and
              decrypted the content locally.
            </p>
          </div>
        )}

        {status === "error" && plaintext && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-5">
            <p className="text-sm leading-6 text-red-200">{message}</p>

            <Link
              href="/"
              className="mt-5 inline-flex rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5"
            >
              Go to Ghostdrop
            </Link>
          </div>
        )}
      </section>

      <footer className="border-t border-white/[0.06] pt-5 text-center text-xs text-zinc-600">
        Ghostdrop · Your key stays in the browser
      </footer>
    </main>
  );
}
