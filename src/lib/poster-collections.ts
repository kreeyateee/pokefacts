import { ALL_STARTER_IDS, STARTER_REGIONS, starterLines } from "@/lib/starters";

/**
 * Ready-made posters: every Pokémon from one region, and the starter Pokémon. Each is a list of national
 * Pokédex numbers and a title for the ribbon.
 */
export type PosterCollection = {
  id: string;
  /** On the button. */
  label: string;
  /** On the poster's ribbon. */
  title: string;
  dexIds: readonly number[];
};

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** Each region's new Pokémon, by national Pokédex number. Hisui's few new ones get a poster of their own. */
const REGIONS = [
  { id: "kanto", name: "Kanto", first: 1, last: 151 },
  { id: "johto", name: "Johto", first: 152, last: 251 },
  { id: "hoenn", name: "Hoenn", first: 252, last: 386 },
  { id: "sinnoh", name: "Sinnoh", first: 387, last: 493 },
  { id: "unova", name: "Unova", first: 494, last: 649 },
  { id: "kalos", name: "Kalos", first: 650, last: 721 },
  { id: "alola", name: "Alola", first: 722, last: 809 },
  { id: "galar", name: "Galar", first: 810, last: 898 },
  { id: "hisui", name: "Hisui", first: 899, last: 905 },
  { id: "paldea", name: "Paldea", first: 906, last: 1025 },
] as const;

export const REGION_POSTERS: readonly PosterCollection[] = REGIONS.map((region) => ({
  id: `region-${region.id}`,
  label: region.name,
  title: `Pokémon of ${region.name}`,
  dexIds: range(region.first, region.last),
}));

export const STARTER_POSTERS: readonly PosterCollection[] = [
  {
    id: "starters-all",
    label: "Every starter",
    title: "Starter Pokémon",
    dexIds: ALL_STARTER_IDS,
  },
  ...STARTER_REGIONS.map((starter) => ({
    id: `starters-${starter.region.toLowerCase()}`,
    label: starter.region,
    title: `${starter.region} starters`,
    dexIds: starterLines(starter.firsts),
  })),
];

export function posterCollection(id: string): PosterCollection | undefined {
  return [...REGION_POSTERS, ...STARTER_POSTERS].find((collection) => collection.id === id);
}
