"use client";

import Link from "next/link";

import { PokemonSignboard } from "@/components/pokemon-sign";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="pk-page mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 pt-8">
      <PokemonSignboard />
      <div className="pk-banner">
        <Link className="pk-wordmark" href="/">
          <span className="pk-ball" aria-hidden="true" />
          <span>
            <span className="pk-wordmark-name">Pokefacts</span>
            <span className="pk-wordmark-tag">Pokémon cards for Yoto</span>
          </span>
        </Link>
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
