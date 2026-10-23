import { getCatalogueEntry } from "@/lib/catalogue-db";
import { partnerParam } from "@/lib/favourites";
import { cleanOwner } from "@/lib/story/safari";
import type { StoryGraph } from "@/lib/story/story-graph";

/** The child's partner Pokémon, by number and the name the narrator says. */
export type Partner = { id: number; name: string };

/** What every adventure is built from: a seed, and optionally the child's name and their partner. */
export type AdventureInput = { seed: number; owner?: string; partner?: Partner };

/** A name the narrator can say: no gender symbols, no full stops in the middle. */
export function sayableName(name: string): string {
  return name.replace(/♀/g, " female").replace(/♂/g, " male").replace(/\./g, "").replace(/\s+/g, " ").trim();
}

export function partnerFor(id: number | undefined): Partner | undefined {
  if (!id) return undefined;
  const entry = getCatalogueEntry(id);
  return entry ? { id, name: sayableName(entry.name) } : undefined;
}

/**
 * GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }.
 * With no seed a new one is drawn, so each send makes a new adventure. The story id carries the seed.
 * An owner that is not 1 to 40 letters, spaces, hyphens or apostrophes is ignored, and so is a partner
 * that is not a national Pokédex number.
 */
export function adventureRoute(build: (input: AdventureInput) => StoryGraph, failure: string) {
  return function GET(request: Request) {
    const url = new URL(request.url);
    const rawSeed = (url.searchParams.get("seed") ?? "").trim();
    let seed: number;
    if (rawSeed === "") {
      seed = Math.floor(Math.random() * 2 ** 31);
    } else {
      seed = Number(rawSeed);
      if (!/^-?\d{1,16}$/.test(rawSeed) || !Number.isSafeInteger(seed)) {
        return Response.json({ error: "The seed must be a whole number." }, { status: 400 });
      }
    }
    const owner = cleanOwner(url.searchParams.get("owner"));
    const partner = partnerFor(partnerParam(url.searchParams.get("partner")));
    try {
      return Response.json({ story: build({ seed, owner, partner }) });
    } catch (error) {
      const message = error instanceof Error ? error.message : failure;
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
