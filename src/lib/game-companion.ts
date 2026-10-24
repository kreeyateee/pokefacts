/**
 * Game Companion cards: for the game a child is playing, each Pokémon in that game's own Pokédex order,
 * with what a player asks about. Its number in that Pokédex, its type, what its moves beat, what to watch
 * out for, how it evolves in that game, and what it is best at.
 *
 * The Pokédexes and the game-only evolution methods come from game-dexes.json, which
 * scripts/build-game-dexes.ts makes from PokéAPI's data.
 */
import type { MonSheet } from "@/lib/dex-facts";
import GAME_DEXES from "@/lib/game-dexes.json";
import { effectiveness, isPokemonType, TYPES, type PokemonType } from "@/lib/type-chart";

export type CompanionGame = {
  id: string;
  title: string;
  /** How the game is named in a sentence and on a playlist: "Scarlet and Violet". */
  short: string;
  dexes: Array<{ id: number; name: string; entries: Array<[number, number]> }>;
  /** Evolutions done this game's own way, by the species they become: "with a Black Augurite". */
  evolve: Record<string, string>;
};

export const COMPANION_GAMES = GAME_DEXES.games as unknown as readonly CompanionGame[];

export const DEFAULT_COMPANION_GAME = "scarlet-violet";

export function companionGame(id: string | null | undefined): CompanionGame {
  return COMPANION_GAMES.find((game) => game.id === id) ?? (COMPANION_GAMES.find((game) => game.id === DEFAULT_COMPANION_GAME) as CompanionGame);
}

/** A Pokémon's base stats by name, as the catalogue keeps them: "Special Attack", "Speed". */
export type BaseStats = ReadonlyArray<{ name: string; value: number }>;

/** Stat names as a child hears them. */
const STAT_WORDS: Record<string, string> = {
  HP: "HP",
  Attack: "Attack",
  Defense: "Defence",
  "Special Attack": "Special Attack",
  "Special Defense": "Special Defence",
  Speed: "Speed",
};

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function typesOf(sheet: MonSheet): PokemonType[] {
  return sheet.types.map((type) => type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()).filter(isPokemonType);
}

/** "Its Fire moves are strong against Grass, Ice, Bug and Steel." */
function strongAgainst(types: readonly PokemonType[]): string {
  const beaten = TYPES.filter((target) => types.some((own) => effectiveness(own, [target]) >= 2));
  if (beaten.length === 0) return "";
  return `Its ${list(types)} moves are strong against ${list(beaten)}.`;
}

/** What to watch out for: weaknesses, the double ones said first, and anything that can't touch it. */
function watchOut(types: readonly PokemonType[]): string {
  const hits = TYPES.map((attack) => ({ attack, hit: effectiveness(attack, types) }));
  const double = hits.filter((row) => row.hit >= 4).map((row) => row.attack);
  const weak = hits.filter((row) => row.hit === 2).map((row) => row.attack);
  const immune = hits.filter((row) => row.hit === 0).map((row) => row.attack);
  return [
    double.length > 0 ? `${list(double)} moves are extra strong against it.` : "",
    weak.length > 0 ? `Watch out for ${list(weak)} moves.` : "",
    immune.length > 0 ? `${list(immune)} moves can't touch it.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** "It's best at Speed, and weakest at Defence." */
function bestAt(stats: BaseStats): string {
  if (stats.length === 0) return "";
  const sorted = [...stats].sort((a, b) => b.value - a.value);
  const best = STAT_WORDS[sorted[0]?.name ?? ""] ?? sorted[0]?.name;
  const worst = STAT_WORDS[sorted.at(-1)?.name ?? ""] ?? sorted.at(-1)?.name;
  if (!best || !worst || best === worst) return "";
  return `It's best at ${best}, and weakest at ${worst}.`;
}

/** How the method is said in this game. Legends: Arceus has no trading to evolve: a Linking Cord does it. */
function inThisGame(method: string, game: CompanionGame): string {
  // Male and female, or two forms, often evolve the same way; the difference is left out.
  const plain = method.replace(/\s*if it is (?:fe)?male\b/g, "").replace(/^from [A-Z][\w-]*(?: [A-Z][\w-]*)* /, "").trim();
  if (game.id === "legends-arceus" && /^when traded/.test(plain)) return "with a Linking Cord";
  return plain;
}

/**
 * How it evolves in this game, naming only Pokémon that are in the game:
 * "Evolves from Charmander at level 16. Evolves into Charizard at level 36."
 */
function evolution(sheet: MonSheet, game: CompanionGame, inGame: ReadonlySet<number>, idByName: ReadonlyMap<string, number>): string {
  const fromId = sheet.evolvesFrom ? idByName.get(sheet.evolvesFrom) : undefined;
  const fromMethod = inThisGame(game.evolve[String(sheet.id)] ?? sheet.evolvesFromHow ?? "", game);
  const from = fromId && inGame.has(fromId) ? `Evolves from ${sheet.evolvesFrom}${fromMethod ? ` ${fromMethod}` : ""}.` : "";
  const ways = new Map<string, string[]>();
  for (const step of sheet.evolvesIntoHow ?? []) {
    const intoId = idByName.get(step.name);
    if (!intoId || !inGame.has(intoId)) continue;
    const method = inThisGame(game.evolve[String(intoId)] ?? step.method, game);
    ways.set(step.name, [...new Set([...(ways.get(step.name) ?? []), method])].filter(Boolean));
  }
  const into = [...ways].map(([name, methods]) =>
    methods.length === 0 ? name : `${name} ${methods.length > 2 ? `${methods[0]} or another way` : methods.join(" or ")}`,
  );
  const intoText =
    into.length === 0 ? "" : into.length <= 3 ? `Evolves into ${list(into).replace(/ and ([^,]+)$/, " or $1")}.` : `Evolves into ${into.slice(0, 3).join(", ")}, and ${into.length - 3} more.`;
  const said = [from, intoText].filter(Boolean).join(" ");
  return said || `It doesn't evolve in ${game.short}.`;
}

/**
 * One Pokémon's companion track: "Number 4 in the Paldea Pokédex. Fuecoco. Fire type. Its Fire moves are
 * strong against Grass, Ice, Bug and Steel. Watch out for Water, Ground and Rock moves. Evolves into
 * Crocalor at level 16. It's best at Special Attack, and weakest at Speed."
 */
export function companionText(input: {
  sheet: MonSheet;
  stats: BaseStats;
  game: CompanionGame;
  dexName: string;
  number: number;
  inGame: ReadonlySet<number>;
  idByName: ReadonlyMap<string, number>;
}): string {
  const { sheet, game } = input;
  const types = typesOf(sheet);
  return [
    `Number ${input.number} in the ${input.dexName} Pokédex.`,
    `${sheet.name.replace(/\.$/, "")}.`,
    types.length > 0 ? `${list(types)} type.` : "",
    strongAgainst(types),
    watchOut(types),
    evolution(sheet, game, input.inGame, input.idByName),
    bestAt(input.stats),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every Pokémon in the game, in its Pokédex order, with the Pokédex it is listed in and its number there. */
export function companionEntries(game: CompanionGame): Array<{ speciesId: number; number: number; dexName: string }> {
  return game.dexes.flatMap((dex) => dex.entries.map(([number, speciesId]) => ({ speciesId, number, dexName: dex.name })));
}
