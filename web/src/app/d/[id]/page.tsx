
import { Suspense } from "react";
import RecipientClient from "./recipient-client";

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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8 sm:px-8">
      <header className="border-b border-white/10 pb-5">
        <span className="text-sm font-semibold text-zinc-100">
          Ghostdrop
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-12">
        <p className="text-sm font-medium text-violet-300">
          Private drop
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Opening your secret…
        </h1>
        <p className="mt-3 text-sm text-zinc-400" role="status">
          Preparing the secure recipient page…
        </p>
      </section>

      <footer className="border-t border-white/[0.06] pt-5 text-center text-xs text-zinc-600">
        Ghostdrop · Your key stays in the browser
      </footer>
    </main>
  );
}

export default function RecipientPage(props: RecipientPageProps) {
  return (
    <Suspense fallback={<RecipientLoading />}>
      <RecipientContent params={props.params} />
    </Suspense>
  );
}
