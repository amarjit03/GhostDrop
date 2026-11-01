import Link from "next/link";

import { SiteShell } from "../site-shell";

export const metadata = {
  title: "Security",
  description: "How Ghostdrop protects your secrets in the browser.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function SecurityPage() {
  return (
    <SiteShell className="mx-auto flex w-full max-w-4xl flex-col px-5 py-10 sm:px-8" compact>
      <section className="mx-auto w-full max-w-2xl py-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Security model
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[var(--text)] sm:text-5xl">
          How Ghostdrop keeps secrets private
        </h1>

        <div className="mt-8 space-y-6 text-base leading-7 text-[var(--muted)]">
          <p>
            Ghostdrop encrypts before upload. The browser derives the content key locally, wraps the secret with AES-GCM, and only then sends the ciphertext to the server.
          </p>
          <p>
            The decryption key travels in the URL fragment after the <code>#</code>. Browsers do not send the fragment as part of the HTTP request, so the server never receives it as a separate secret.
          </p>
          <p>
            The backend stores encrypted payloads, expiry rules, and record metadata. It does not have a server-side decryption key and cannot inspect the content itself.
          </p>
          <p>
            This is a deliberately simple system: there are no accounts, no server-side secret-sharing, and no hidden preview path. If the link is lost or copied to an unsafe place, the secret is gone with it.
          </p>
          <p>
            Honest limits still apply. If a browser is compromised, a link is previewed by a bot, or a recipient screenshots the content, nothing in the protocol can stop that. Expiry is a policy gate, not guaranteed erasure from every copy.
          </p>
        </div>

        <div className="mt-10 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-medium text-[var(--text)]">Server can see</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
            <li>• encrypted records and their sizes</li>
            <li>• expiry settings, view counts, and state</li>
            <li>• whether a password was enabled on the link</li>
          </ul>
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
