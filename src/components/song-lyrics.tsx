"use client";

import { useEffect, useState } from "react";

type LyricsResult = { page: string; lyrics: string; problem: string };

/** Full lyrics for one Bulbapedia song page. */
export function SongLyrics({ page }: { page: string }) {
  const [result, setResult] = useState<LyricsResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/music/lyrics?page=${encodeURIComponent(page)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { lyrics?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || "The lyrics could not be loaded.");
        setResult({ page, lyrics: payload.lyrics ?? "", problem: "" });
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const problem = caught instanceof Error ? caught.message : "The lyrics could not be loaded.";
        setResult({ page, lyrics: "", problem });
      });
    return () => controller.abort();
  }, [page]);

  // A result for the previous song is not shown while this one loads.
  const current = result?.page === page ? result : null;
  if (current?.problem) return <p className="mt-3 text-sm leading-6 text-poke-red">{current.problem}</p>;
  if (!current) return <p className="mt-3 text-sm leading-6">Loading the lyrics…</p>;
  if (!current.lyrics) return <p className="mt-3 text-sm leading-6">Bulbapedia does not list lyrics for this song.</p>;
  return (
    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-ink">
      {current.lyrics}
    </pre>
  );
}
