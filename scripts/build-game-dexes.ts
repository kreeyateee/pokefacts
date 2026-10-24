/**
 * Builds src/lib/game-dexes.json for the Game Companion cards: each game's own Pokédex (its numbers and
 * order, DLC areas after), and how Pokémon evolve in that game when it differs from the usual way.
 *
 * Reads PokéAPI's CSVs from data/poke-csv (download them from PokeAPI/pokeapi data/v2/csv):
 * pokedexes, pokedex_version_groups, pokemon_dex_numbers, version_groups, pokemon_evolution,
 * evolution_triggers, item_names, location_names, move_names, types.
 *   npx tsx scripts/build-game-dexes.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CSV = path.join(process.cwd(), "data", "poke-csv");
const OUT = path.join(process.cwd(), "src", "lib", "game-dexes.json");
const ENGLISH = "9";

/** The games a child is likely to be playing, newest first, each with its version groups and Pokédexes. */
const GAMES = [
  { id: "legends-za", title: "Pokémon Legends: Z-A", short: "Legends Z-A", versionGroups: [30, 31], dexes: [34, 35] },
  { id: "scarlet-violet", title: "Pokémon Scarlet and Violet", short: "Scarlet and Violet", versionGroups: [25, 26, 27], dexes: [31, 32, 33] },
  { id: "legends-arceus", title: "Pokémon Legends: Arceus", short: "Legends Arceus", versionGroups: [24], dexes: [30] },
  { id: "bdsp", title: "Pokémon Brilliant Diamond and Shining Pearl", short: "Brilliant Diamond and Shining Pearl", versionGroups: [23], dexes: [5] },
  { id: "sword-shield", title: "Pokémon Sword and Shield", short: "Sword and Shield", versionGroups: [20, 21, 22], dexes: [27, 28, 29] },
  { id: "lets-go", title: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", short: "Let's Go", versionGroups: [19], dexes: [26] },
] as const;

/** Version groups whose evolution rules belong to that game alone, never carried into later games. */
const ONLY_THEIR_OWN = new Set([19, 24, 30, 31]);

function table(name: string): Array<Record<string, string>> {
  const [head, ...lines] = readFileSync(path.join(CSV, `${name}.csv`), "utf8").trim().split(/\r?\n/);
  const keys = (head ?? "").split(",");
  return lines.map((line) => {
    // PokéAPI quotes fields with commas; names here never contain quotes inside quotes.
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "")) ?? [];
    return Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""]));
  });
}

const names = (rows: Array<Record<string, string>>, idKey: string) =>
  new Map(rows.filter((row) => row.local_language_id === ENGLISH).map((row) => [row[idKey] as string, row.name as string]));

const dexNames = names(table("pokedex_prose"), "pokedex_id");
const itemNames = names(table("item_names"), "item_id");
const locationNames = names(table("location_names"), "location_id");
const moveNames = names(table("move_names"), "move_id");
const typeNames = new Map(table("types").map((row) => [row.id as string, (row.identifier ?? "").replace(/^./, (c) => c.toUpperCase())]));
const triggers = new Map(table("evolution_triggers").map((row) => [row.id as string, row.identifier as string]));
const vgOrder = new Map(table("version_groups").map((row) => [Number(row.id), Number(row.order)]));
const dexNumbers = table("pokemon_dex_numbers");

/** "a Thunder Stone", "an Ice Stone". */
const article = (name: string) => `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name}`;

/** One evolution row, said the way a child would hear it: "at level 16", "with a Linking Cord". */
function phrase(row: Record<string, string>): string {
  const trigger = triggers.get(row.evolution_trigger_id ?? "") ?? "";
  const parts: string[] = [];
  const item = row.trigger_item_id ? itemNames.get(row.trigger_item_id) : undefined;
  const held = row.held_item_id ? itemNames.get(row.held_item_id) : undefined;
  const move = row.known_move_id ? moveNames.get(row.known_move_id) : undefined;
  const usedMove = row.used_move_id ? moveNames.get(row.used_move_id) : undefined;
  const moveType = row.known_move_type_id ? typeNames.get(row.known_move_type_id) : undefined;
  const place = row.location_id ? locationNames.get(row.location_id) : undefined;
  if (trigger === "level-up") {
    parts.push(row.minimum_level ? `at level ${row.minimum_level}` : "by levelling up");
  } else if (trigger === "trade") {
    parts.push("when traded");
  } else if (trigger === "use-item" && item) {
    parts.push(`with ${article(item)}`);
  } else if ((trigger === "agile-style-move" || trigger === "strong-style-move") && usedMove) {
    const style = trigger === "agile-style-move" ? "Agile Style" : "Strong Style";
    parts.push(`after using ${usedMove} in ${style} ${row.minimum_move_count || "20"} times`);
  } else if (trigger === "use-move" && usedMove) {
    parts.push(`after using ${usedMove} ${row.minimum_move_count || "20"} times`);
  } else if (trigger === "recoil-damage") {
    parts.push(`after taking ${row.minimum_damage_taken || "a lot of"} recoil damage`);
  } else if (trigger === "three-critical-hits") {
    parts.push("after landing three critical hits in one battle");
  } else {
    return "";
  }
  if (held) parts.push(`while holding ${article(held)}`);
  if (row.minimum_happiness || row.minimum_affection) parts.push("once it is very happy");
  if (move) parts.push(`once it knows ${move}`);
  if (moveType) parts.push(`once it knows a ${moveType} move`);
  if (row.time_of_day === "day") parts.push("during the day");
  if (row.time_of_day === "night") parts.push("at night");
  if (row.time_of_day === "dusk") parts.push("at dusk");
  if (place) parts.push(`at ${place}`);
  if (row.relative_physical_stats === "1") parts.push("if its Attack is higher than its Defence");
  if (row.relative_physical_stats === "-1") parts.push("if its Defence is higher than its Attack");
  if (row.relative_physical_stats === "0") parts.push("if its Attack and Defence are equal");
  if (row.needs_overworld_rain === "1") parts.push("while it's raining");
  if (row.turn_upside_down === "1") parts.push("while holding the console upside down");
  return parts.join(" ");
}

const evolutions = table("pokemon_evolution").filter(
  // Regional forms' own evolutions (an Alolan Raichu) are left for the usual wording.
  (row) => !row.region_id && !row.evolved_pokemon_form_id && !row.required_pokemon_form_id,
);

const games = GAMES.map((game) => {
  const own = new Set<number>(game.versionGroups);
  const order = Math.max(...game.versionGroups.map((vg) => vgOrder.get(vg) ?? 0));
  const seen = new Set<number>();
  const dexes = game.dexes.map((dexId) => {
    const entries = dexNumbers
      .filter((row) => row.pokedex_id === String(dexId))
      .map((row) => [Number(row.pokedex_number), Number(row.species_id)] as [number, number])
      .sort((a, b) => a[0] - b[0])
      // A Pokémon already in an earlier Pokédex of this game is not repeated in a DLC one.
      .filter(([, species]) => !seen.has(species) && seen.add(species));
    const name = (dexNames.get(String(dexId)) ?? `Pokédex ${dexId}`).replace(/^Let.s Go /, "").replace(/^Original /, "");
    return { id: dexId, name, entries };
  });
  // How each Pokémon evolves in this game: its own rule, else the latest one from before it.
  const byInto = new Map<number, Array<Record<string, string>>>();
  for (const row of evolutions) {
    const vg = Number(row.version_group_id);
    if (!own.has(vg) && (ONLY_THEIR_OWN.has(vg) || (vgOrder.get(vg) ?? 0) > order)) continue;
    const into = Number(row.evolved_species_id);
    byInto.set(into, [...(byInto.get(into) ?? []), row]);
  }
  const evolve: Record<number, string> = {};
  for (const [into, rows] of byInto) {
    const ownRows = rows.filter((row) => own.has(Number(row.version_group_id)));
    const latest = Math.max(...rows.map((row) => vgOrder.get(Number(row.version_group_id)) ?? 0));
    const chosen = ownRows.length > 0 ? ownRows : rows.filter((row) => (vgOrder.get(Number(row.version_group_id)) ?? 0) === latest);
    const said = [...new Set(chosen.map(phrase).filter(Boolean))];
    // Only the games that do it their own way are written down; the rest use the usual wording.
    if (said.length > 0 && ownRows.length > 0) evolve[into] = said.join(" or ");
  }
  return { id: game.id, title: game.title, short: game.short, dexes, evolve };
});

writeFileSync(OUT, `${JSON.stringify({ games }, null, 0)}\n`);
for (const game of games) {
  const count = game.dexes.reduce((sum, dex) => sum + dex.entries.length, 0);
  console.log(`${game.short}: ${count} Pokémon in ${game.dexes.map((dex) => dex.name).join(", ")}; ${Object.keys(game.evolve).length} evolutions its own way`);
}
