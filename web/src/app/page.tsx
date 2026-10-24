
"use client";

import { useState } from "react";

import { createDrop } from "@/lib/api/create-drop";
import { ApiError } from "@/lib/api/errors";
import type { CreateDropResult, DropTtlSeconds } from "@/lib/api/types";

import Link from "next/link";

const TTL_OPTIONS: { label: string; value: DropTtlSeconds }[] = [
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: 86400 },
  { label: "7 days", value: 604800 },
];

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    return "Expiry determined by server policy";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const [text, setText] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState<DropTtlSeconds>(3600);
  const [maxViews, setMaxViews] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateDropResult | null>(null);
  const [copied, setCopied] = useState(false);

  const textBytes = new TextEncoder().encode(text).length;
  const tooLarge = textBytes > MAX_TEXT_BYTES;
  const canSubmit = text.trim().length > 0 && !tooLarge && !loading;

  async function handleCreate() {
    if (!canSubmit) return;

    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const created = await createDrop({
        text,
        ttlSeconds,
        maxViews,
      });

      setResult(created);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to create your drop. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;

    const shareUrl =
      `${window.location.origin}/d/${encodeURIComponent(result.id)}` +
      result.keyFragment;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setError("");
    } catch {
      setError(
        "Clipboard access failed. Copy the share link from the field below.",
      );
    }
  }

  const shareUrl = result
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/d/${encodeURIComponent(result.id)}${result.keyFragment}`
    : "";

  function handleCreateAnother() {
    setResult(null);
    setText("");
    setError("");
    setCopied(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" aria-label="Ghostdrop home">
          <span className="flex size-10 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-400/10 text-violet-300">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-6"
            >
              <path
                d="M7 10V7a5 5 0 0 1 10 0v3m-11 0h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="15" r="1.2" fill="currentColor" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">ghostdrop</span>
        </Link>

        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300">
          <span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-400" />
          Browser-side encryption
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-12 sm:py-16">
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="size-4 text-violet-300"
            >
              <path
                d="M10 2.5 3.5 5v4.5c0 4.1 2.8 6.8 6.5 8 3.7-1.2 6.5-3.9 6.5-8V5L10 2.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="m7.3 9.8 1.8 1.8 3.7-3.8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Private by design
          </div>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Share a secret.
            <br />
            <span className="text-violet-300">Not your privacy.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-zinc-400 sm:text-base">
            Create an encrypted link for text you want to share privately.
            Your browser encrypts the content before it reaches the server.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/20 sm:p-7">
          {!result ? (
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="secret-text"
                    className="text-sm font-medium text-zinc-200"
                  >
                    Your secret text
                  </label>
                  <span
                    className={`text-xs ${tooLarge ? "text-red-300" : "text-zinc-500"}`}
                  >
                    {textBytes.toLocaleString()} bytes
                  </span>
                </div>

                <textarea
                  id="secret-text"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setError("");
                  }}
                  placeholder="Write a message, password, or private note…"
                  rows={6}
                  maxLength={2 * 1024 * 1024}
                  disabled={loading}
                  aria-describedby="text-help"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/10 disabled:opacity-60"
                />

                <p id="text-help" className="mt-2 text-xs text-zinc-500">
                  Maximum size: 2 MiB of UTF-8 text.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="expiry"
                    className="mb-2 block text-sm font-medium text-zinc-200"
                  >
                    Link expires after
                  </label>
                  <select
                    id="expiry"
                    value={ttlSeconds}
                    onChange={(event) =>
                      setTtlSeconds(Number(event.target.value) as DropTtlSeconds)
                    }
                    disabled={loading}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm text-zinc-100 outline-none transition focus:border-violet-400/60 disabled:opacity-60"
                  >
                    {TTL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="max-views"
                    className="mb-2 block text-sm font-medium text-zinc-200"
                  >
                    Maximum views
                  </label>
                  <select
                    id="max-views"
                    value={maxViews}
                    onChange={(event) => setMaxViews(Number(event.target.value))}
                    disabled={loading}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm text-zinc-100 outline-none transition focus:border-violet-400/60 disabled:opacity-60"
                  >
                    {[1, 2, 3, 5, 10, 25, 50, 100].map((views) => (
                      <option key={views} value={views}>
                        {views} {views === 1 ? "view" : "views"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200"
                >
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-400 px-5 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />
                    Encrypting and uploading…
                  </>
                ) : (
                  <>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="none"
                      className="size-4"
                    >
                      <path
                        d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9m-8 0h9a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    Create encrypted drop
                  </>
                )}
              </button>

              {tooLarge && (
                <p className="text-sm text-red-300" role="alert">
                  Your text exceeds the maximum size.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-6"
                  >
                    <path
                      d="m5 12.5 4.5 4.5L19 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <h2 className="mt-4 text-2xl font-semibold">
                  Your drop is ready
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Copy the complete link and send it to your recipient.
                  Anyone with the link can access the decryption key.
                </p>
              </div>

              <div>
                <label
                  htmlFor="share-link"
                  className="mb-2 block text-sm font-medium text-zinc-200"
                >
                  Private share link
                </label>
                <textarea
                  id="share-link"
                  readOnly
                  value={shareUrl}
                  rows={3}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full break-all rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 font-mono text-xs leading-5 text-violet-200 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-3 w-full rounded-xl bg-violet-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-violet-300"
                >
                  {copied ? "Link copied" : "Copy share link"}
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm">
                <p className="text-zinc-300">
                  <span className="text-zinc-500">Expires:</span>{" "}
                  {formatExpiry(result.expiresAt)}
                </p>
                <p className="mt-2 text-zinc-300">
                  <span className="text-zinc-500">View limit:</span>{" "}
                  {maxViews} {maxViews === 1 ? "view" : "views"}
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-200">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreateAnother}
                className="w-full rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
              >
                Create another drop
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-start justify-center gap-3 px-3 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="mt-0.5 size-4 shrink-0 text-zinc-500"
          >
            <path
              d="M10 2.5 3.5 5v4.5c0 4.1 2.8 6.8 6.5 8 3.7-1.2 6.5-3.9 6.5-8V5L10 2.5Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <p className="max-w-md text-xs leading-5 text-zinc-500">
            Encryption happens in your browser. Keep your share link private:
            the key is part of the link, not a separate login.
          </p>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] pt-5 text-center text-xs text-zinc-600">
        Ghostdrop · Zero-knowledge encrypted sharing
      </footer>
    </main>
  );
}
