
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { consumeDrop } from "@/lib/api/drops";
import { ApiError } from "@/lib/api/errors";
import { decodeBase64Url } from "@/lib/crypto/encoding";
import { parseUrlKey } from "@/lib/crypto/key";
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

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const HEADER_BYTES = 10;
const GCM_TAG_BYTES = 16;
const MAX_FRAME_BYTES = MAX_TEXT_BYTES + HEADER_BYTES + GCM_TAG_BYTES;

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

      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });

      if (!response.ok) {
        throw new Error("Unable to download the encrypted content.");
      }

      const bytes = new Uint8Array(await response.arrayBuffer());

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

export default function RecipientClient({ id }: RecipientClientProps) {
  const [status, setStatus] = useState<PageState>("loading");
  const [message, setMessage] = useState(
    "Downloading and decrypting your secret…",
  );
  const [plaintext, setPlaintext] = useState("");

  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;

    let cancelled = false;
    let decryptedText: string | undefined;
    let stream: Uint8Array | undefined;
    let envelopeBytes: Uint8Array | undefined;

    async function openDrop() {
      try {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
          throw new Error("Invalid drop ID.");
        }

        // URL fragments are available only in the browser.
        // Validate the key before reserving a view.
        const keyFragment = window.location.hash;
        const checkedKey = parseUrlKey(keyFragment);
        checkedKey.fill(0);

        const drop = await consumeDrop(id);

        if (drop.password_required) {
          throw new Error(
            "Password-protected drops are not yet supported.",
          );
        }

        if (
          drop.record_count !== 2 ||
          drop.records.length !== 2
        ) {
          throw new Error("This drop has an invalid record count.");
        }

        envelopeBytes = decodeBase64Url(drop.envelope);
        stream = await downloadFrames(drop.records);

        if (cancelled) {
          return;
        }

        decryptedText = await decryptText(
          {
            dropId: id,
            envelope: envelopeBytes,
            stream,
          },
          keyFragment,
        );

        if (cancelled) {
          return;
        }

        setPlaintext(decryptedText);
        setStatus("success");
        setMessage("Decryption successful.");
      } catch (error) {
        if (!cancelled) {
          setMessage(getSafeErrorMessage(error));
          setStatus("error");
        }
      } finally {
        stream?.fill(0);
        envelopeBytes?.fill(0);
        decryptedText = undefined;
      }
    }

    void openDrop();

    return () => {
      cancelled = true;
    };
  }, [id]);

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

        {status === "error" && (
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
