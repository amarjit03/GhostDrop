import Link from "next/link";

import { SiteShell } from "../site-shell";

export const metadata = {
  title: "Terms",
  description: "Ghostdrop terms of use and responsibility.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return (
    <SiteShell className="mx-auto flex w-full max-w-4xl flex-col px-5 py-10 sm:px-8" compact>
      <section className="mx-auto w-full max-w-2xl py-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Terms
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[var(--text)] sm:text-5xl">
          Use Ghostdrop responsibly
        </h1>

        <div className="mt-8 space-y-6 text-base leading-7 text-[var(--muted)]">
          <p>
            Ghostdrop is a short-lived secret-sharing utility for messages that should disappear after a limited window. You are responsible for the content you send and for complying with local laws, platform policies, and contractual obligations.
          </p>
          <p>
            The service is offered on an as-is basis. We aim to keep it reliable, but we cannot guarantee uninterrupted availability or complete erasure from every possible copy once a message has left your browser.
          </p>
          <p>
            Do not use Ghostdrop to send personal data, credentials, or content that should remain recoverable for legal, compliance, or operational reasons. If you believe a link contains harmful content, use the appropriate reporting channel available through the product.
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
