import Link from "next/link";

import { SiteShell } from "../site-shell";

export const metadata = {
  title: "Privacy",
  description: "How Ghostdrop handles operational data and encrypted content.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <SiteShell className="mx-auto flex w-full max-w-4xl flex-col px-5 py-10 sm:px-8" compact>
      <section className="mx-auto w-full max-w-2xl py-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Privacy
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[var(--text)] sm:text-5xl">
          What Ghostdrop stores and what it does not
        </h1>

        <div className="mt-8 space-y-6 text-base leading-7 text-[var(--muted)]">
          <p>
            Ghostdrop does not store plaintext content in a readable form. The browser encrypts
            the message before upload, and the server keeps only the encrypted payload, drop
            metadata, and operational records needed to enforce expiry and view limits.
          </p>
          <p>
            We do not scan message contents, and we do not build a searchable archive of secrets.
            Operational data such as timestamps, error events, and access counters may be kept to
            maintain security and reliability of the service.
          </p>
          <p>
            Links expire automatically and are invalid once used, deleted, or expired. This is not
            the same as guaranteed erasure from every possible backup, screenshot, or copied
            message already sent to another party.
          </p>
          <p>
            If a secret is too important to risk being seen in logs, screenshots, or copied chat
            history, it should not be sent through any ephemeral-sharing tool.
          </p>
        </div>

        <div className="mt-6 flex justify-start">
          <Link
            href="/"
            className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-strong)]"
          >
            Back to Ghostdrop
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
