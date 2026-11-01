import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteShell } from "../../site-shell";
import RecipientClient from "./recipient-client";

export const metadata: Metadata = {
  title: "Private Drop",
  description: "Open a private encrypted drop securely.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

interface RecipientPageProps {
  params: Promise<{ id: string }>;
}

async function RecipientContent({
  params,
}: RecipientPageProps) {
  const { id } = await params;
  return <RecipientClient id={id} />;
}

function RecipientLoading() {
  return (
    <SiteShell className="mx-auto flex w-full max-w-3xl flex-col px-5 py-8 sm:px-8" compact>
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-12">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Private drop
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-[var(--text)] sm:text-4xl">
          Opening your secret…
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]" role="status">
          Preparing the secure recipient page…
        </p>
      </section>
    </SiteShell>
  );
}

export default function RecipientPage(props: RecipientPageProps) {
  return (
    <Suspense fallback={<RecipientLoading />}>
      <RecipientContent params={props.params} />
    </Suspense>
  );
}
