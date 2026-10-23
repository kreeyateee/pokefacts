"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { JOKES } from "@/lib/jokes";

/** A Pokémon joke on the page: the question first, the punchline on a press, a new one each visit. */
export function JokeBox() {
  const [index, setIndex] = useState<number | null>(null);
  const [told, setTold] = useState(false);

  // Chosen in the browser after the page appears, so the server page and the browser agree.
  const chooseOnArrival = useEffectEvent(() => setIndex(Math.floor(Math.random() * JOKES.length)));
  useEffect(() => {
    const frame = requestAnimationFrame(() => chooseOnArrival());
    return () => cancelAnimationFrame(frame);
  }, []);

  const joke = index === null ? undefined : JOKES[index];
  if (!joke || index === null) return null;

  function next() {
    setIndex((current) => ((current ?? 0) + 1 + Math.floor(Math.random() * (JOKES.length - 1))) % JOKES.length);
    setTold(false);
  }

  return (
    <section className="pk-panel mt-5 flex flex-wrap items-center gap-3" aria-label="Pokémon joke" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/pixels/${joke.dexId}.png`}
        alt=""
        width={44}
        height={44}
        className="shrink-0 rounded bg-black p-0.5 [image-rendering:pixelated]"
      />
      <div className="min-w-0 grow">
        <p className="pk-kicker">Pokémon joke</p>
        <p className="text-sm leading-6">{joke.setup}</p>
        {told ? <p className="text-sm leading-6 font-bold">{joke.punchline}</p> : null}
      </div>
      <Button type="button" variant="outline" className="h-10 px-4" onClick={told ? next : () => setTold(true)}>
        {told ? "Another one" : "Tell me!"}
      </Button>
    </section>
  );
}
