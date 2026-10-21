export type CatalogueAbility = {
  name: string;
  hidden: boolean;
  /** Short PokéAPI ability line, when the games have one. */
  info: string;
};

export type CatalogueStat = {
  name: string;
  value: number;
};

export type CatalogueLink = {
  id: number;
  name: string;
};

export type CatalogueEvolution = CatalogueLink & {
  method: string;
};

/** One species this Pokémon evolves into. Stage 1 is direct. Later stages are subevolutions. */
export type CatalogueLineMember = {
  id: number;
  name: string;
  method: string;
  stage: number;
  fromId: number;
  fromName: string;
};

export type CatalogueLine = {
  evolutions: CatalogueLineMember[];
  subevolutions: CatalogueLineMember[];
};

export type CatalogueMatch = {
  type: string;
  multiplier: number;
};

export type CatalogueFormRef = {
  formId: number;
  speciesId: number;
  speciesName: string;
  formName: string;
};

export type CatalogueForm = {
  id: number;
  name: string;
  isDefault: boolean;
  isMega: boolean;
  isBattleOnly: boolean;
  heightLabel: string;
  weightLabel: string;
  types: string[];
};

export type CatalogueListItem = {
  id: number;
  name: string;
  genus: string;
  types: string[];
  heightLabel: string;
  weightLabel: string;
};

export type CatalogueEntry = {
  id: number;
  name: string;
  slug: string;
  genus: string;
  generation: number;
  region: string;
  color: string;
  shape: string;
  habitat: string | null;
  gender: string;
  captureRate: number;
  baseHappiness: number;
  isBaby: boolean;
  isLegendary: boolean;
  isMythical: boolean;
  hatchCycles: number;
  growth: string;
  heightLabel: string;
  weightLabel: string;
  baseExperience: number;
  types: string[];
  abilities: CatalogueAbility[];
  stats: CatalogueStat[];
  eggGroups: string[];
  evolvesFrom: CatalogueLink | null;
  evolutions: CatalogueEvolution[];
  /** Direct evolutions, then every further stage, each once. */
  line: CatalogueLine;
  weak: CatalogueMatch[];
  resist: CatalogueMatch[];
  immune: CatalogueMatch[];
  forms: CatalogueForm[];
  /** English Pokédex line from the games. */
  info: string;
  /** Game the Pokédex line comes from, such as Shield. */
  infoVersion: string;
  /** Older Pokédex line from a different game, when the wording differs. */
  info2?: string;
  /** Game the second Pokédex line comes from. */
  info2Version?: string;
  /** Extra Pokefacts note for a handful of species. */
  notes: string | null;
  /** PokéAPI evolution chain, shared by the whole family. */
  evolutionSet: number | null;
  moves: string[];
};

/** Readable Bulbapedia section. The catalogue shows every block. Spoken facts use the first two lead paragraphs. */
export type BiologyBlock =
  | { kind: "heading"; level: 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export type BiologyView = {
  status: "ready" | "missing" | "unavailable";
  url: string;
  blocks: BiologyBlock[];
};

export type CataloguePage = {
  total: number;
  species: number;
  forms: number;
  page: number;
  pageSize: number;
  items: CatalogueListItem[];
};
