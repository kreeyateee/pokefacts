import { cacheLife } from "next/cache";

import type { FlavorSource } from "@/lib/dex-facts";
import { cleanFlavor } from "@/lib/format";
import { kidCardsFromDex, type KidCard } from "@/lib/kid-cards";

const POKE = "https://pokeapi.co/api/v2";

const ROSTER_IDS = [1, 4, 7, 25, 133, 39, 143, 94, 321];

type SpeciesPayload = {
  flavor_text_entries: Array<{
    flavor_text: string;
    language: { name: string };
    version: { name: string };
  }>;
};

async function speciesEntries(id: number): Promise<FlavorSource[]> {
  const response = await fetch(`${POKE}/pokemon-species/${id}/`, {
    headers: { Accept: "application/json", "User-Agent": "champdex/0.1" },
  });
  if (!response.ok) {
    throw new Error(`PokéAPI returned ${response.status} for species ${id}.`);
  }
  const species = (await response.json()) as SpeciesPayload;
  return species.flavor_text_entries
    .filter((entry) => entry.language.name === "en")
    .map((entry) => ({
      text: cleanFlavor(entry.flavor_text),
      version: entry.version.name,
    }));
}

export async function fetchRosterDex(): Promise<Map<number, FlavorSource[]>> {
  const rows = await Promise.all(
    ROSTER_IDS.map(async (id) => [id, await speciesEntries(id)] as const),
  );
  return new Map(rows);
}

export async function loadKidCards(): Promise<KidCard[]> {
  "use cache";
  cacheLife("hours");
  return kidCardsFromDex(await fetchRosterDex());
}
