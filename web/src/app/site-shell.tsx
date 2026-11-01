import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}

export function SiteShell({
  children,
  className = "",
  compact = false,
}: SiteShellProps) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--text)]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 text-[var(--text)] transition-opacity hover:opacity-90"
            aria-label="Ghostdrop home"
          >
            <span className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(91,78,246,0.18)]">
              <Image
                src="/logo.png"
                alt="Ghostdrop logo"
                width={40}
                height={40}
                className="h-full w-full object-cover"
                priority
              />
            </span>
            <span className="text-lg font-semibold tracking-[-0.05em]">
              ghostdrop
            </span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-6 text-sm text-[var(--muted)] sm:flex"
          >
            <Link href="/security" className="transition-colors hover:text-[var(--text)]">
              Security
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[var(--text)]">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--text)]">
              Terms
            </Link>
          </nav>

          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] shadow-[0_8px_20px_rgba(17,24,39,0.08)] transition-colors hover:border-[var(--border-strong)]"
          >
            {compact ? "Home" : "Create link"}
          </Link>
        </div>
      </header>

      <main id="main-content" className={className}>
        {children}
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--background)]/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-6 text-sm text-[var(--muted)] sm:flex-row sm:px-8">
          <p>Ghostdrop · zero-knowledge secret sharing</p>
          <nav aria-label="Footer navigation" className="flex items-center gap-4">
            <Link href="/security" className="transition-colors hover:text-[var(--text)]">
              Security
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[var(--text)]">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--text)]">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
