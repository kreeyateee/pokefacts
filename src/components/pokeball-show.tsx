"use client";

import { useEffect, useState } from "react";

import {
  POKEBALL_GIFS,
  POKEBALL_STILLS,
  WOBBLE_TO_BROKE_FREE_MS,
  WOBBLE_TO_CAUGHT_MS,
} from "@/lib/story/pokeball";

export type PokeballOutcome = "caught" | "brokeFree";

/** What a scene's ball does, from its sound cues: [catch] is a catch, [escape] a ball it broke out of. */
export function pokeballOutcome(text: string): PokeballOutcome | null {
  if (text.includes("[catch]")) return "caught";
  if (text.includes("[escape]")) return "brokeFree";
  return null;
}

function prefersStill(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * The Poké Ball on the page: three wobbles, then the click and stars, or the ball springing open.
 * The swap happens when the sound clicks or pops. `play` restarts it; a new value plays it again.
 * With motion turned down, it shows how it ended, as a still picture.
 */
export function PokeballShow({ outcome, play }: { outcome: PokeballOutcome; play: number }) {
  // The play that has reached its click or pop. Any newer play starts on the wobble.
  const [endedPlay, setEndedPlay] = useState<number | null>(null);
  const [still] = useState(prefersStill);
  const stage = endedPlay === play ? "end" : "wobble";

  useEffect(() => {
    for (const src of [POKEBALL_GIFS.wobble, POKEBALL_GIFS[outcome]]) new Image().src = src;
  }, [outcome]);

  useEffect(() => {
    if (still) return;
    const timer = window.setTimeout(
      () => setEndedPlay(play),
      outcome === "caught" ? WOBBLE_TO_CAUGHT_MS : WOBBLE_TO_BROKE_FREE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [outcome, play, still]);

  const ended = still || stage === "end";
  // A query that changes with each play makes the browser start the GIF from its first frame again.
  const src = still
    ? POKEBALL_STILLS[outcome]
    : `${stage === "wobble" ? POKEBALL_GIFS.wobble : POKEBALL_GIFS[outcome]}?play=${play}`;
  const words = outcome === "caught" ? "Gotcha!" : "It broke free!";
  return (
    <figure className="flex flex-col items-center" aria-label={ended ? words : "The Poké Ball is wobbling"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={200} height={200} className="h-[200px] w-[200px]" />
      <figcaption
        className={`-mt-2 font-heading text-2xl font-bold ${outcome === "caught" ? "text-poke-red" : "text-ink"} ${ended ? "" : "invisible"}`}
      >
        {words}
      </figcaption>
    </figure>
  );
}
