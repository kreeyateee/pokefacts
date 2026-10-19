"use client";

import { DONATE_URL } from "@/lib/site";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="pk-page mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <div className="pk-banner">
        <a className="pk-wordmark" href={DONATE_URL} target="_blank" rel="noreferrer">
          <span className="pk-ball" aria-hidden="true" />
          <span>
            <span className="pk-wordmark-name">Pokefacts</span>
            <span className="pk-wordmark-coffee">Buy me a coffee</span>
          </span>
        </a>
      </div>
      <h1 className="text-3xl font-bold">The field guide hit a snag.</h1>
      <p className="text-sm leading-6 text-muted-foreground">{error.message}</p>
      <button
        type="button"
        className="h-11 w-fit rounded-full border-[3px] border-ink bg-poke-red px-4 text-sm font-bold text-white shadow-[3px_3px_0_var(--ink)]"
        onClick={reset}
      >
        Try again
      </button>
    </main>
  );
}
