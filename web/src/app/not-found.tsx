import Link from "next/link";

import { SiteShell } from "./site-shell";

export default function NotFound() {
  return (
    <SiteShell className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center px-5 py-16 text-center" compact>
      <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_30px_70px_rgba(17,24,39,0.08)]">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Not found
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.06em] text-[var(--text)]">
          This page is missing
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">
          The share link or page you tried to open does not exist.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(91,78,246,0.24)] transition-transform hover:-translate-y-0.5"
        >
          Go to Ghostdrop
        </Link>
      </div>
    </SiteShell>
  );
}
