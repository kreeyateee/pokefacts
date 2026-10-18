export type FlavorNote = {
  text: string;
  version: string;
};

export type AbilityNote = {
  name: string;
  hidden: boolean;
  effect: string;
};

export type StatNote = {
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
  abilities: AbilityNote[];
  habitat: string;
  growth: string;
  catchLine: string;
  captureRate: number;
  isLegendary: boolean;
  isMythical: boolean;
  isBaby: boolean;
  flavor: FlavorNote[];
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

export type ChampTrack = {
  key: string;
  title: string;
  text: string;
};

export type ChampBrief = {
  tracks: ChampTrack[];
};

export const GENERATIONS = [
  { id: 1, name: "Kanto", start: 1, end: 151 },
  { id: 2, name: "Johto", start: 152, end: 251 },
  { id: 3, name: "Hoenn", start: 252, end: 386 },
  { id: 4, name: "Sinnoh", start: 387, end: 493 },
  { id: 5, name: "Unova", start: 494, end: 649 },
  { id: 6, name: "Kalos", start: 650, end: 721 },
  { id: 7, name: "Alola", start: 722, end: 809 },
  { id: 8, name: "Galar", start: 810, end: 905 },
  { id: 9, name: "Paldea", start: 906, end: 1025 },
] as const;

export const PARTY_LIMIT = 8;

export const TYPE_NAMES = [
  "normal",
  "fire",
  "water",
  "grass",
  "electric",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

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
