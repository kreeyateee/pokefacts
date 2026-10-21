"use client";

import { useEffect, useState } from "react";

/** Full lyrics for one Bulbapedia song page. */
export function SongLyrics({ page }: { page: string }) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLyrics(null);
    setProblem("");
    void fetch(`/api/music/lyrics?page=${encodeURIComponent(page)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { lyrics?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || "The lyrics could not be loaded.");
        setLyrics(payload.lyrics ?? "");
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setProblem(caught instanceof Error ? caught.message : "The lyrics could not be loaded.");
      });
    return () => controller.abort();
  }, [page]);

  if (problem) return <p className="mt-3 text-sm leading-6 text-poke-red">{problem}</p>;
  if (lyrics === null) return <p className="mt-3 text-sm leading-6">Loading the lyrics…</p>;
  if (!lyrics) return <p className="mt-3 text-sm leading-6">Bulbapedia does not list lyrics for this song.</p>;
  return (
    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-ink">
      {lyrics}
    </pre>
  );
}
