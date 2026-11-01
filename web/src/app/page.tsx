"use client";

import { useState } from "react";

import { createDrop } from "@/lib/api/create-drop";
import { ApiError } from "@/lib/api/errors";
import type { CreateDropResult, DropTtlSeconds } from "@/lib/api/types";

import Link from "next/link";

import { SiteShell } from "./site-shell";

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
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const textBytes = new TextEncoder().encode(text).length;
  const tooLarge = textBytes > MAX_TEXT_BYTES;
  const passwordMode = password.length > 0 || confirmPassword.length > 0;
  const passwordMismatch = passwordMode && password !== confirmPassword;
  const canSubmit =
    text.trim().length > 0 && !tooLarge && !loading && !passwordMismatch;

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
        password: passwordMode ? password : undefined,
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

  function handleCreateAnother() {
    setResult(null);
    setText("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setCopied(false);
  }

  async function handleDelete() {
    if (!result || deleted) return;

    setDeleting(true);
    setError("");

    try {
      await fetch(`/api/drops/${result.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      setDeleted(true);
      setResult(null);
      setText("");
      setError("");
      setCopied(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete your drop. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const shareUrl = result
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/d/${encodeURIComponent(result.id)}${result.keyFragment}`
    : "";

  return (
    <SiteShell className="mx-auto flex w-full max-w-6xl flex-col px-5 py-8 sm:px-8 sm:py-10">
      <section className="grid items-center gap-8 pb-14 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-20">
        <div className="max-w-xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <span className="inline-flex size-2 rounded-full bg-[var(--success)]" aria-hidden="true" />
            Encrypted in the browser
          </div>

          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-[var(--text)] sm:text-5xl lg:text-6xl">
            Send a secret.
            <span className="mt-2 block text-[var(--accent)]">Keep the key to yourself.</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-7 text-[var(--muted)]">
            Ghostdrop turns a private note or API key into a one-time link that disappears after it is opened, with the decryption key staying in the browser.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="#create"
              className="inline-flex rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(91,78,246,0.24)] transition-transform hover:-translate-y-0.5"
            >
              Create link
            </Link>
            <Link
              href="/security"
              className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-strong)]"
            >
              How it works
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Browser-first", "Encryption and key handling stay in the sender and recipient browser."],
              ["One-time by design", "A link can be limited to one open or a short expiration window."],
              ["No server secrets", "The backend never sees plaintext or the link key."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_12px_32px_rgba(17,24,39,0.05)]">
                <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="create" className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_30px_70px_rgba(17,24,39,0.12)] sm:p-6">
          {!result ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <p className="text-sm font-medium text-[var(--muted)]">New drop</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                    Write a private message
                  </h2>
                </div>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                  secure
                </span>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="secret-text" className="text-sm font-medium text-[var(--text)]">
                    Secret text
                  </label>
                  <span className={`text-xs ${tooLarge ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
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
                  placeholder="Paste a token, password, or private note…"
                  rows={6}
                  maxLength={2 * 1024 * 1024}
                  disabled={loading}
                  aria-describedby="text-help"
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm leading-6 text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[rgba(91,78,246,0.12)] disabled:opacity-60"
                />

                <p id="text-help" className="mt-2 text-xs text-[var(--muted)]">
                  Maximum size: 2 MiB of UTF-8 text.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="expiry" className="mb-2 block text-sm font-medium text-[var(--text)]">
                    Expires after
                  </label>
                  <select
                    id="expiry"
                    value={ttlSeconds}
                    onChange={(event) =>
                      setTtlSeconds(Number(event.target.value) as DropTtlSeconds)
                    }
                    disabled={loading}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--focus-ring)] disabled:opacity-60"
                  >
                    {TTL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="max-views" className="mb-2 block text-sm font-medium text-[var(--text)]">
                    Maximum views
                  </label>
                  <select
                    id="max-views"
                    value={maxViews}
                    onChange={(event) => setMaxViews(Number(event.target.value))}
                    disabled={loading}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--focus-ring)] disabled:opacity-60"
                  >
                    {[1, 2, 3, 5, 10, 25, 50, 100].map((views) => (
                      <option key={views} value={views}>
                        {views} {views === 1 ? "view" : "views"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label htmlFor="password" className="text-sm font-medium text-[var(--text)]">
                    Optional password
                  </label>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    optional
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    disabled={loading}
                    placeholder="Password for this drop"
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--focus-ring)] disabled:opacity-60"
                  />

                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setError("");
                    }}
                    disabled={loading}
                    placeholder="Confirm password"
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--focus-ring)] disabled:opacity-60"
                  />
                </div>

                <p className="mt-2 text-xs text-[var(--muted)]">
                  Passwords are never sent to the server. Share the password separately from the link.
                </p>

                {passwordMode && passwordMismatch && (
                  <p className="mt-2 text-sm text-[var(--danger)]">
                    Passwords do not match.
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-2xl border border-[rgba(180,35,24,0.18)] bg-[rgba(180,35,24,0.04)] px-4 py-3 text-sm text-[var(--danger)]">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
                    Create encrypted link
                  </>
                )}
              </button>

              {tooLarge && (
                <p className="text-sm text-[var(--danger)]" role="alert">
                  Your text exceeds the maximum size.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-[rgba(16,108,69,0.2)] bg-[rgba(16,108,69,0.08)] text-[var(--success)]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
                    <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                  Link created
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Copy the complete link and send it to your recipient. The key stays in the browser and is not stored separately.
                </p>
              </div>

              <div>
                <label htmlFor="share-link" className="mb-2 block text-sm font-medium text-[var(--text)]">
                  Share link
                </label>
                <textarea
                  id="share-link"
                  readOnly
                  value={shareUrl}
                  rows={3}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 font-mono text-[11px] leading-5 text-[var(--accent)] outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-3 w-full rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--focus-ring)]"
                >
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm text-[var(--text)]">
                <p>
                  <span className="text-[var(--muted)]">Expires:</span> {formatExpiry(result.expiresAt)}
                </p>
                <p className="mt-2">
                  <span className="text-[var(--muted)]">View limit:</span> {maxViews} {maxViews === 1 ? "view" : "views"}
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-[var(--danger)]">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreateAnother}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)]"
              >
                Create another drop
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleted}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(180,35,24,0.25)] bg-[rgba(180,35,24,0.05)] px-5 py-3 text-sm font-semibold text-[var(--danger)] transition hover:bg-[rgba(180,35,24,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.2)] border-t-[var(--danger)]" />
                    Revoking access…
                  </>
                ) : deleted ? (
                  "Access revoked"
                ) : (
                  "Delete now"
                )}
              </button>

              {deleted && (
                <p className="rounded-2xl border border-[rgba(180,35,24,0.2)] bg-[rgba(180,35,24,0.04)] px-4 py-3 text-sm text-[var(--danger)]">
                  This drop has been deleted. The link is no longer valid.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 border-t border-[var(--border)] py-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--text)]">
            One secret, one link, one clear path.
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {[
            ["01", "Write", "Add a note, token, or password. Nothing is sent before it is encrypted in the browser."],
            ["02", "Share", "Copy the generated link and send it to the person who should open it."],
            ["03", "Open once", "When the recipient opens it, the browser verifies the key and decrypts locally, then the link is spent or expires."],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">{step}</p>
              <p className="mt-4 text-lg font-semibold text-[var(--text)]">{title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 border-t border-[var(--border)] py-14 lg:grid-cols-2">
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">What the server can see</p>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
            <li>• encrypted payload metadata and record lengths</li>
            <li>• expiry, view limits, and usage state</li>
            <li>• whether a password is enabled on the drop</li>
          </ul>
        </div>

        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">What the server cannot see</p>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
            <li>• plaintext content</li>
            <li>• the URL decryption key stored after the #</li>
            <li>• any password used to derive the content key</li>
          </ul>
        </div>
      </section>

      <section className="border-t border-[var(--border)] py-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Honest limits</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--text)]">
            Secure by design. Not magic.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">
            Ghostdrop is best for short-lived secrets such as access tokens, credentials, or a final password. It cannot protect against screenshots, copied links, or a compromised browser. Expiry is policy, not guaranteed erasure.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
