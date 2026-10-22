export type FlavorNote = {
  text: string;
  version: string;
};

export type AbilityNote = {
  name: string;
  hidden: boolean;
  effect: string;
};

type StatNote = {
  slug: string;
  name: string;
  value: number;
};

export type Dossier = {
  id: number;
  name: string;
  slug: string;
  genus: string;
  types: string[];
  height: string;
  weight: string;
  /** Height in decimetres, as PokéAPI stores it. */
  heightDm: number;
  /** Weight in hectograms, as PokéAPI stores it. */
  weightHg: number;
  abilities: AbilityNote[];
  habitat: string;
  growth: string;
  catchLine: string;
  captureRate: number;
  isLegendary: boolean;
  isMythical: boolean;
  isBaby: boolean;
  flavor: FlavorNote[];
  /** Every English Pokédex entry, with the PokéAPI version slug. */
  flavorSources: Array<{ text: string; version: string }>;
  evolution: string;
  stats: StatNote[];
  statTotal: number;
  artwork: string;
  cry: string | null;
  region: string;
};

export type DexEntry = {
  id: number;
  slug: string;
  name: string;
};

export const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  grass: "#7AC74C",
  electric: "#F7D02C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
};
