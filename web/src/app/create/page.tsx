"use client";

import Link from "next/link";

import { SiteShell } from "../site-shell";

export default function CreateLandingPage() {
  return (
    <SiteShell className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <section className="grid gap-10 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-16">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
            <span className="inline-flex size-2 rounded-full bg-[var(--success)]" aria-hidden="true" />
            Private by design
          </div>

          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-[var(--text)] sm:text-5xl lg:text-6xl">
            Share a secret.
            <span className="mt-2 block text-[var(--accent)]">Without sharing the key.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">
            Ghostdrop lets you send a secret through a link that expires and disappears after it is opened. Your browser encrypts the message before it reaches the server, and the key stays in the browser instead of being stored in a database.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(91,78,246,0.24)] transition-transform hover:-translate-y-0.5"
            >
              Create a drop
            </Link>
            <Link
              href="/security"
              className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-strong)]"
            >
              See how it works
            </Link>
          </div>
        </div>

        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_30px_70px_rgba(17,24,39,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            In plain language
          </p>

          <div className="mt-6 space-y-5 text-sm leading-6 text-[var(--muted)]">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <p className="font-semibold text-[var(--text)]">1. Write the secret</p>
              <p className="mt-1">It stays in your browser until you decide to send it.</p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <p className="font-semibold text-[var(--text)]">2. Lock it with a link</p>
              <p className="mt-1">The server stores encrypted blobs only; the key stays in the browser fragment.</p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <p className="font-semibold text-[var(--text)]">3. Open once</p>
              <p className="mt-1">The receiving browser decrypts locally and the link expires or disappears after use.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 border-t border-[var(--border)] py-14 lg:grid-cols-3">
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Browser encryption</p>
          <h2 className="mt-4 text-xl font-semibold text-[var(--text)]">No server-side secret</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            The cryptography happens in the browser, so the backend never sees the plaintext or decryption key.
          </p>
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Time-limited</p>
          <h2 className="mt-4 text-xl font-semibold text-[var(--text)]">Short-lived links</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Set a lifetime and a view cap so the secret is not left around longer than necessary.
          </p>
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">Honest limits</p>
          <h2 className="mt-4 text-xl font-semibold text-[var(--text)]">Not magic</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Screenshots, copied links, and compromised browsers can still expose the content. Ghostdrop is designed to reduce risk, not eliminate every human mistake.
          </p>
        </div>
      </section>

      <section className="border-t border-[var(--border)] py-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">What it is for</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--text)]">
            Best for short-lived, sensitive information
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">
            API keys, access tokens, handoff passwords, and temporary notes are good fits. This is not meant for long-term document storage or anything that requires guaranteed retention.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
