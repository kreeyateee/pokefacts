/**
 * The starter Pokémon: each region's three starter lines (grass, fire, water), three Pokémon each.
 * Each line runs on in national Pokédex order from its first Pokémon.
 */
export const STARTER_REGIONS: ReadonlyArray<{ region: string; firsts: readonly [number, number, number] }> = [
  { region: "Kanto", firsts: [1, 4, 7] },
  { region: "Johto", firsts: [152, 155, 158] },
  { region: "Hoenn", firsts: [252, 255, 258] },
  { region: "Sinnoh", firsts: [387, 390, 393] },
  { region: "Unova", firsts: [495, 498, 501] },
  { region: "Kalos", firsts: [650, 653, 656] },
  { region: "Alola", firsts: [722, 725, 728] },
  { region: "Galar", firsts: [810, 813, 816] },
  { region: "Paldea", firsts: [906, 909, 912] },
];

/** Every Pokémon in these starter lines, in order. */
export function starterLines(firsts: readonly number[]): number[] {
  return firsts.flatMap((first) => [first, first + 1, first + 2]);
}

/** All 81 starters, Kanto first. */
export const ALL_STARTER_IDS: readonly number[] = STARTER_REGIONS.flatMap((region) => starterLines(region.firsts));
