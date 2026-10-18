/**
 * Build data/champdex.sqlite from PokéAPI's tables.
 * The Pokédex entry is an English flavor text. Bulbapedia prose is not stored.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { CATALOGUE_NOTES } from "../src/lib/catalogue-notes";
import {
  catalogueVersionRank,
  pickCatalogueInfo,
  type DexCandidate,
} from "../src/lib/catalogue-info";

const CSV_DIR = process.env.CATALOGUE_CSV ?? "/tmp/poke-csv";
const OUT = path.join(process.cwd(), "data", "champdex.sqlite");
const ENGLISH = "9";

const REGIONS: Record<string, string> = {
  "1": "Kanto",
  "2": "Johto",
  "3": "Hoenn",
  "4": "Sinnoh",
  "5": "Unova",
  "6": "Kalos",
  "7": "Alola",
  "8": "Galar",
  "9": "Paldea",
};

const TRIGGER: Record<string, string> = {
  "level-up": "by leveling up",
  trade: "when traded",
  "use-item": "with an item",
  shed: "when there is an empty spot in the party",
  spin: "while the trainer spins",
  "tower-of-darkness": "in the Tower of Darkness",
  "tower-of-waters": "in the Tower of Waters",
  "three-critical-hits": "after landing three critical hits in one battle",
  "take-damage": "after taking a hit in a special place",
  "in-battle-level-up": "by leveling up during a battle",
  "agile-style-move": "after using a move in the agile style",
  "strong-style-move": "after using a move in the strong style",
  "recoil-damage": "after taking recoil damage",
  "use-move": "after using a move",
  "three-defeated-bisharp": "after three leader Pawniard are defeated",
  "gimmighoul-coins": "with enough Gimmighoul coins",
  "meltan-candies": "with Meltan candies",
  unclassified: "under a special condition",
};

const GENDER_EIGHTHS: Record<string, string> = {
  "-1": "It has no gender.",
  "0": "Only males are known.",
  "1": "One in eight is female.",
  "2": "One in four is female.",
  "3": "Three in eight are female.",
  "4": "Males and females are equally common.",
  "5": "Five in eight are female.",
  "6": "Three in four are female.",
  "7": "Seven in eight are female.",
  "8": "Only females are known.",
};

type Row = Record<string, string>;

function parseCsv(file: string): Row[] {
  const text = readFileSync(path.join(CSV_DIR, file), "utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((values) => {
    const record: Row = {};
    header.forEach((key, index) => {
      record[key] = values[index] ?? "";
    });
    return record;
  });
}

function englishName(rows: Row[], idKey: string, nameKey = "name"): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.local_language_id === ENGLISH && row[nameKey]) {
      map.set(row[idKey], row[nameKey]);
    }
  }
  return map;
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

function champdexNotes(id: number): string | null {
  const note = CATALOGUE_NOTES[id];
  if (!note) return null;
  return `${note.looks} ${note.habits}`.replace(/\s+/g, " ").trim();
}

function optionalInt(value: string): number | null {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickGrouped(
  rows: Row[],
  idKey: string,
  versionOf: (versionId: string) => { rank: number; version: string } | null,
): Map<string, { text: string; version: string }> {
  const grouped = new Map<string, DexCandidate[]>();
  for (const row of rows) {
    if (row.language_id !== ENGLISH) continue;
    const label = versionOf(row.version_id || row.version_group_id);
    if (!label) continue;
    const list = grouped.get(row[idKey]) ?? [];
    list.push({ text: row.flavor_text, rank: label.rank, version: label.version });
    grouped.set(row[idKey], list);
  }
  const picked = new Map<string, { text: string; version: string }>();
  for (const [id, entries] of grouped) {
    const choice = pickCatalogueInfo(entries);
    if (choice) picked.set(id, choice);
  }
  return picked;
}

type EvolutionDraft = {
  intoId: number;
  version: number;
  phrase: string;
};

function methodPhrase(
  row: Row,
  names: {
    item: Map<string, string>;
    move: Map<string, string>;
    location: Map<string, string>;
    species: Map<string, string>;
    type: Map<string, string>;
    trigger: Map<string, string>;
    form: Map<string, { name: string; pokemonId: string }>;
    defaultPokemonIds: Set<string>;
  },
): string {
  const trigger = names.trigger.get(row.evolution_trigger_id) ?? "";
  const item = names.item.get(row.trigger_item_id) ?? "";
  const held = names.item.get(row.held_item_id) ?? "";
  const move = names.move.get(row.known_move_id) ?? names.move.get(row.used_move_id) ?? "";
  const moveType = names.type.get(row.known_move_type_id) ?? "";
  const location = names.location.get(row.location_id) ?? "";
  const party = names.species.get(row.party_species_id) ?? "";
  const partyType = names.type.get(row.party_type_id) ?? "";
  const trade = names.species.get(row.trade_species_id) ?? "";
  const bits: string[] = [];

  if (trigger === "level-up" && row.minimum_level) bits.push(`at level ${row.minimum_level}`);
  else if (trigger === "use-item" && item) bits.push(`with ${article(item)} ${item}`);
  else if (trigger === "trade") bits.push("when traded");
  else if (TRIGGER[trigger]) bits.push(TRIGGER[trigger]);
  else bits.push("under a special condition");

  if (trigger !== "level-up" && row.minimum_level) bits.push(`at level ${row.minimum_level}`);
  if (trigger === "trade" && held) bits.push(`while holding ${article(held)} ${held}`);
  if (trigger !== "trade" && held) bits.push(`while holding ${article(held)} ${held}`);
  if (row.time_of_day) bits.push(`during the ${row.time_of_day}`);
  if (row.minimum_happiness) bits.push("once it is very happy");
  if (row.required_pokemon_form_id) {
    const form = names.form.get(row.required_pokemon_form_id);
    if (form && !names.defaultPokemonIds.has(form.pokemonId)) {
      bits.unshift(`from ${form.name}`);
    }
  }
  if (row.minimum_affection) bits.push("once your bond is strong");
  if (row.minimum_beauty) bits.push("once its beauty is high");
  if (row.gender_id === "1") bits.push("if it is female");
  if (row.gender_id === "2") bits.push("if it is male");
  if (move) bits.push(`after it learns ${move}`);
  if (moveType) bits.push(`after it learns ${article(moveType)} ${moveType} move`);
  if (location) bits.push(`around ${location}`);
  if (party) bits.push(`with ${party} in the party`);
  if (partyType) bits.push(`with ${article(partyType)} ${partyType} type in the party`);
  if (trade) bits.push(`in exchange for ${trade}`);
  if (row.relative_physical_stats === "1") bits.push("if its Attack is higher than its Defense");
  if (row.relative_physical_stats === "-1") bits.push("if its Defense is higher than its Attack");
  if (row.relative_physical_stats === "0") bits.push("if its Attack and Defense are equal");
  if (row.needs_overworld_rain === "1") bits.push("while rain is falling");
  if (row.turn_upside_down === "1") bits.push("while the console is held upside down");
  if (row.near_special_rock === "1") bits.push("near a special rock");
  if (row.minimum_steps) bits.push(`after ${row.minimum_steps} steps`);
  if (row.percentage_chance && row.percentage_chance !== "100") {
    bits.push(`about ${row.percentage_chance} percent of the time`);
  }
  return bits.join(" ");
}

function main() {
  const speciesRows = parseCsv("pokemon_species.csv");
  const speciesNames = parseCsv("pokemon_species_names.csv");
  const nameBySpecies = new Map<string, string>();
  const genusBySpecies = new Map<string, string>();
  for (const row of speciesNames) {
    if (row.local_language_id !== ENGLISH) continue;
    nameBySpecies.set(row.pokemon_species_id, row.name);
    genusBySpecies.set(row.pokemon_species_id, row.genus);
  }

  const typeId = new Map(parseCsv("types.csv").map((row) => [row.id, row.identifier]));
  const typeName = englishName(parseCsv("type_names.csv"), "type_id");
  const abilityName = englishName(parseCsv("ability_names.csv"), "ability_id");
  const statName = englishName(parseCsv("stat_names.csv"), "stat_id");
  const eggName = englishName(parseCsv("egg_group_prose.csv"), "egg_group_id");
  const colorName = englishName(parseCsv("pokemon_color_names.csv"), "pokemon_color_id");
  const habitatId = new Map(parseCsv("pokemon_habitats.csv").map((row) => [row.id, row.identifier]));
  const shapeId = new Map(parseCsv("pokemon_shapes.csv").map((row) => [row.id, row.identifier]));
  const growthId = new Map(parseCsv("growth_rates.csv").map((row) => [row.id, row.identifier]));
  const itemName = englishName(parseCsv("item_names.csv"), "item_id");
  const moveName = englishName(parseCsv("move_names.csv"), "move_id");
  const locationName = englishName(parseCsv("location_names.csv"), "location_id");
  const triggerId = new Map(parseCsv("evolution_triggers.csv").map((row) => [row.id, row.identifier]));
  const formNames = new Map<string, { form: string; pokemon: string }>();
  for (const row of parseCsv("pokemon_form_names.csv")) {
    if (row.local_language_id !== ENGLISH) continue;
    formNames.set(row.pokemon_form_id, { form: row.form_name, pokemon: row.pokemon_name });
  }
  const formsByPokemon = new Map<string, Row>();
  const formInfo = new Map<string, { name: string; pokemonId: string }>();
  for (const row of parseCsv("pokemon_forms.csv")) {
    const current = formsByPokemon.get(row.pokemon_id);
    if (!current || (row.is_default === "1" && current.is_default !== "1")) {
      formsByPokemon.set(row.pokemon_id, row);
    }
    const named = formNames.get(row.id);
    const fallback = row.identifier
      .split("-")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join(" ");
    formInfo.set(row.id, {
      name: named?.pokemon || named?.form || fallback,
      pokemonId: row.pokemon_id,
    });
  }

  const pokemon = parseCsv("pokemon.csv");
  const defaultPokemon = new Map<string, Row>();
  for (const row of pokemon) {
    if (row.is_default === "1") defaultPokemon.set(row.species_id, row);
  }

  const typesByPokemon = new Map<string, Array<{ slot: number; type: string }>>();
  for (const row of parseCsv("pokemon_types.csv")) {
    const identifier = typeId.get(row.type_id) ?? "";
    const label = typeName.get(row.type_id) ?? identifier;
    if (!label || identifier === "unknown" || identifier === "shadow" || identifier === "stellar") {
      continue;
    }
    const list = typesByPokemon.get(row.pokemon_id) ?? [];
    list.push({ slot: Number(row.slot), type: label });
    typesByPokemon.set(row.pokemon_id, list);
  }
  for (const list of typesByPokemon.values()) list.sort((a, b) => a.slot - b.slot);

  const abilitiesByPokemon = new Map<
    string,
    Array<{ slot: number; id: number; name: string; hidden: boolean }>
  >();
  for (const row of parseCsv("pokemon_abilities.csv")) {
    const name = abilityName.get(row.ability_id);
    if (!name) continue;
    const list = abilitiesByPokemon.get(row.pokemon_id) ?? [];
    list.push({
      slot: Number(row.slot),
      id: Number(row.ability_id),
      name,
      hidden: row.is_hidden === "1",
    });
    abilitiesByPokemon.set(row.pokemon_id, list);
  }
  for (const list of abilitiesByPokemon.values()) list.sort((a, b) => a.slot - b.slot);

  const statsByPokemon = new Map<string, Array<{ slot: number; name: string; value: number }>>();
  for (const row of parseCsv("pokemon_stats.csv")) {
    if (Number(row.stat_id) > 6) continue;
    const name = statName.get(row.stat_id);
    if (!name) continue;
    const list = statsByPokemon.get(row.pokemon_id) ?? [];
    list.push({ slot: Number(row.stat_id), name, value: Number(row.base_stat) });
    statsByPokemon.set(row.pokemon_id, list);
  }

  const eggsBySpecies = new Map<string, string[]>();
  for (const row of parseCsv("pokemon_egg_groups.csv")) {
    const name = eggName.get(row.egg_group_id);
    if (!name) continue;
    const list = eggsBySpecies.get(row.species_id) ?? [];
    list.push(name);
    eggsBySpecies.set(row.species_id, list);
  }

  const efficacy = new Map<string, number>();
  for (const row of parseCsv("type_efficacy.csv")) {
    efficacy.set(`${row.damage_type_id}:${row.target_type_id}`, Number(row.damage_factor));
  }
  const attackTypes = [...typeName.entries()]
    .filter(([id]) => Number(id) >= 1 && Number(id) <= 18)
    .map(([id, name]) => ({ id, name }));
  const defendId = new Map(
    [...typeName.entries()].map(([id, name]) => [name, id]),
  );

  const drafts = new Map<number, EvolutionDraft[]>();
  for (const row of parseCsv("pokemon_evolution.csv")) {
    const intoId = Number(row.evolved_species_id);
    const phrase = methodPhrase(row, {
      item: itemName,
      move: moveName,
      location: locationName,
      species: nameBySpecies,
      type: typeName,
      trigger: triggerId,
      form: formInfo,
      defaultPokemonIds: new Set(
        pokemon.filter((mon) => mon.is_default === "1").map((mon) => mon.id),
      ),
    });
    const list = drafts.get(intoId) ?? [];
    list.push({ intoId, version: Number(row.version_group_id) || 0, phrase });
    drafts.set(intoId, list);
  }

  const speciesById = new Map(speciesRows.map((row) => [row.id, row]));
  const outgoing = new Map<number, Array<{ intoId: number; method: string }>>();
  for (const [intoId, options] of drafts) {
    const into = speciesById.get(String(intoId));
    const fromId = Number(into?.evolves_from_species_id);
    if (!fromId) continue;
    const newest = Math.max(...options.map((option) => option.version));
    const phrases = new Set(
      options.filter((option) => option.version === newest).map((option) => option.phrase),
    );
    const list = outgoing.get(fromId) ?? [];
    for (const method of phrases) list.push({ intoId, method });
    outgoing.set(fromId, list);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => a.intoId - b.intoId || a.method.localeCompare(b.method));
  }

  const versionRows = parseCsv("versions.csv");
  const versionIdentifier = new Map(versionRows.map((row) => [row.id, row.identifier]));
  const versionLabel = new Map<string, string>();
  for (const row of parseCsv("version_names.csv")) {
    if (row.local_language_id === ENGLISH && row.name) versionLabel.set(row.version_id, row.name);
  }
  const groupRank = new Map<string, number>();
  for (const row of versionRows) {
    const rank = catalogueVersionRank(row.identifier);
    if (rank < 0) continue;
    const current = groupRank.get(row.version_group_id) ?? -1;
    if (rank > current) groupRank.set(row.version_group_id, rank);
  }
  const dexInfo = pickGrouped(parseCsv("pokemon_species_flavor_text.csv"), "species_id", (versionId) => {
    const identifier = versionIdentifier.get(versionId);
    if (!identifier) return null;
    const rank = catalogueVersionRank(identifier);
    if (rank < 0) return null;
    return { rank, version: versionLabel.get(versionId) ?? identifier };
  });
  const abilityInfo = pickGrouped(parseCsv("ability_flavor_text.csv"), "ability_id", (groupId) => {
    const rank = groupRank.get(groupId);
    if (rank === undefined || rank < 0) return null;
    return { rank, version: groupId };
  });
  const moveInfo = pickGrouped(parseCsv("move_flavor_text.csv"), "move_id", (groupId) => {
    const rank = groupRank.get(groupId);
    if (rank === undefined || rank < 0) return null;
    return { rank, version: groupId };
  });

  const movesBySpecies = new Map<number, Set<number>>();
  const speciesByPokemon = new Map<string, number>();
  for (const [speciesId, form] of defaultPokemon) {
    speciesByPokemon.set(form.id, Number(speciesId));
  }
  for (const row of parseCsv("pokemon_moves.csv")) {
    const speciesId = speciesByPokemon.get(row.pokemon_id);
    const moveId = Number(row.move_id);
    if (!speciesId || !moveId) continue;
    const set = movesBySpecies.get(speciesId) ?? new Set<number>();
    set.add(moveId);
    movesBySpecies.set(speciesId, set);
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  const db = new DatabaseSync(OUT);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    DROP TABLE IF EXISTS meta;
    DROP TABLE IF EXISTS species_types;
    DROP TABLE IF EXISTS species_abilities;
    DROP TABLE IF EXISTS species_stats;
    DROP TABLE IF EXISTS species_eggs;
    DROP TABLE IF EXISTS species_matchups;
    DROP TABLE IF EXISTS species_moves;
    DROP TABLE IF EXISTS evolutions;
    DROP TABLE IF EXISTS forms;
    DROP TABLE IF EXISTS form_types;
    DROP TABLE IF EXISTS abilities;
    DROP TABLE IF EXISTS moves;
    DROP VIEW IF EXISTS pokedex;
    DROP TABLE IF EXISTS species;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE species (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      genus TEXT NOT NULL,
      generation INTEGER NOT NULL,
      region TEXT NOT NULL,
      color TEXT NOT NULL,
      shape TEXT NOT NULL,
      habitat TEXT,
      gender TEXT NOT NULL,
      capture_rate INTEGER NOT NULL,
      base_happiness INTEGER NOT NULL,
      is_baby INTEGER NOT NULL,
      is_legendary INTEGER NOT NULL,
      is_mythical INTEGER NOT NULL,
      hatch_cycles INTEGER NOT NULL,
      growth TEXT NOT NULL,
      height_dm INTEGER NOT NULL,
      weight_hg INTEGER NOT NULL,
      base_experience INTEGER NOT NULL,
      evolves_from_id INTEGER,
      evo_set INTEGER,
      info TEXT NOT NULL,
      info_version TEXT NOT NULL,
      notes TEXT
    );
    CREATE TABLE abilities (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      info TEXT NOT NULL
    );
    CREATE TABLE moves (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      pp INTEGER,
      power INTEGER,
      accuracy INTEGER,
      type_name TEXT NOT NULL,
      info TEXT NOT NULL
    );
    CREATE TABLE species_types (
      species_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      type_name TEXT NOT NULL
    );
    CREATE TABLE species_abilities (
      species_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      ability_id INTEGER NOT NULL,
      ability_name TEXT NOT NULL,
      is_hidden INTEGER NOT NULL
    );
    CREATE TABLE species_moves (
      species_id INTEGER NOT NULL,
      move_id INTEGER NOT NULL,
      PRIMARY KEY (species_id, move_id)
    );
    CREATE TABLE species_stats (
      species_id INTEGER NOT NULL,
      stat_name TEXT NOT NULL,
      base INTEGER NOT NULL
    );
    CREATE TABLE species_eggs (
      species_id INTEGER NOT NULL,
      egg_group TEXT NOT NULL
    );
    CREATE TABLE species_matchups (
      species_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      type_name TEXT NOT NULL,
      multiplier REAL NOT NULL
    );
    CREATE TABLE evolutions (
      from_id INTEGER NOT NULL,
      into_id INTEGER NOT NULL,
      method TEXT NOT NULL
    );
    CREATE TABLE forms (
      id INTEGER PRIMARY KEY,
      species_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL,
      is_mega INTEGER NOT NULL,
      is_battle_only INTEGER NOT NULL,
      height_dm INTEGER NOT NULL,
      weight_hg INTEGER NOT NULL
    );
    CREATE TABLE form_types (
      form_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      type_name TEXT NOT NULL
    );
  `);

  const insertSpecies = db.prepare(`
    INSERT INTO species (
      id, slug, name, genus, generation, region, color, shape, habitat, gender,
      capture_rate, base_happiness, is_baby, is_legendary, is_mythical, hatch_cycles,
      growth, height_dm, weight_hg, base_experience, evolves_from_id, evo_set, info, info_version, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertType = db.prepare(
    "INSERT INTO species_types (species_id, slot, type_name) VALUES (?, ?, ?)",
  );
  const insertAbility = db.prepare(
    "INSERT INTO species_abilities (species_id, slot, ability_id, ability_name, is_hidden) VALUES (?, ?, ?, ?, ?)",
  );
  const insertAbilityRow = db.prepare(
    "INSERT INTO abilities (id, name, info) VALUES (?, ?, ?)",
  );
  const insertMove = db.prepare(
    "INSERT INTO moves (id, name, pp, power, accuracy, type_name, info) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertSpeciesMove = db.prepare(
    "INSERT INTO species_moves (species_id, move_id) VALUES (?, ?)",
  );
  const insertStat = db.prepare(
    "INSERT INTO species_stats (species_id, stat_name, base) VALUES (?, ?, ?)",
  );
  const insertEgg = db.prepare(
    "INSERT INTO species_eggs (species_id, egg_group) VALUES (?, ?)",
  );
  const insertMatch = db.prepare(
    "INSERT INTO species_matchups (species_id, relation, type_name, multiplier) VALUES (?, ?, ?, ?)",
  );
  const insertEvo = db.prepare(
    "INSERT INTO evolutions (from_id, into_id, method) VALUES (?, ?, ?)",
  );
  const insertForm = db.prepare(`
    INSERT INTO forms (id, species_id, name, is_default, is_mega, is_battle_only, height_dm, weight_hg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFormType = db.prepare(
    "INSERT INTO form_types (form_id, slot, type_name) VALUES (?, ?, ?)",
  );

  const knownMoves = new Set<number>();
  db.exec("BEGIN");
  for (const row of parseCsv("abilities.csv")) {
    const name = abilityName.get(row.id);
    if (!name) continue;
    insertAbilityRow.run(Number(row.id), name, abilityInfo.get(row.id)?.text ?? "");
  }
  for (const row of parseCsv("moves.csv")) {
    const name = moveName.get(row.id);
    if (!name) continue;
    const id = Number(row.id);
    knownMoves.add(id);
    insertMove.run(
      id,
      name,
      optionalInt(row.pp),
      optionalInt(row.power),
      optionalInt(row.accuracy),
      typeName.get(row.type_id) ?? "",
      moveInfo.get(row.id)?.text ?? "",
    );
  }
  let speciesCount = 0;
  for (const row of speciesRows) {
    const form = defaultPokemon.get(row.id);
    if (!form) continue;
    const id = Number(row.id);
    const name = nameBySpecies.get(row.id) ?? row.identifier;
    const genus = genusBySpecies.get(row.id) ?? "Pokémon";
    const types = (typesByPokemon.get(form.id) ?? []).map((type) => type.type);
    const abilities = abilitiesByPokemon.get(form.id) ?? [];
    const habitat = habitatId.get(row.habitat_id) ?? "";
    const shape = shapeId.get(row.shape_id) ?? "";
    const color = colorName.get(row.color_id) ?? "";
    const region = REGIONS[row.generation_id] ?? `Generation ${row.generation_id}`;
    const fromId = row.evolves_from_species_id ? Number(row.evolves_from_species_id) : null;
    const picked = dexInfo.get(row.id);
    insertSpecies.run(
      id,
      row.identifier,
      name,
      genus,
      Number(row.generation_id),
      region,
      color,
      shape,
      habitat || null,
      GENDER_EIGHTHS[row.gender_rate] ?? "Its gender mix is not on file.",
      Number(row.capture_rate),
      Number(row.base_happiness),
      row.is_baby === "1" ? 1 : 0,
      row.is_legendary === "1" ? 1 : 0,
      row.is_mythical === "1" ? 1 : 0,
      Number(row.hatch_counter),
      (growthId.get(row.growth_rate_id) ?? "medium").replace(/-/g, " "),
      Number(form.height),
      Number(form.weight),
      Number(form.base_experience || 0),
      fromId,
      row.evolution_chain_id ? Number(row.evolution_chain_id) : null,
      picked?.text ?? "A Pokédex entry for this Pokémon is not on file yet.",
      picked?.version ?? "",
      champdexNotes(id),
    );
    types.forEach((type, index) => insertType.run(id, index + 1, type));
    abilities.forEach((ability, index) =>
      insertAbility.run(id, index + 1, ability.id, ability.name, ability.hidden ? 1 : 0),
    );
    for (const moveId of movesBySpecies.get(id) ?? []) {
      if (knownMoves.has(moveId)) insertSpeciesMove.run(id, moveId);
    }
    for (const stat of statsByPokemon.get(form.id) ?? []) {
      insertStat.run(id, stat.name, stat.value);
    }
    for (const egg of eggsBySpecies.get(row.id) ?? []) insertEgg.run(id, egg);
    for (const evolution of outgoing.get(id) ?? []) {
      insertEvo.run(id, evolution.intoId, evolution.method);
    }

    const defend = types
      .map((type) => defendId.get(type))
      .filter((typeIdValue): typeIdValue is string => Boolean(typeIdValue));
    if (defend.length === types.length && defend.length > 0) {
      for (const attack of attackTypes) {
        let multiplier = 1;
        for (const defender of defend) {
          multiplier *= (efficacy.get(`${attack.id}:${defender}`) ?? 100) / 100;
        }
        const relation =
          multiplier === 0 ? "immune" : multiplier > 1 ? "weak" : multiplier < 1 ? "resist" : "";
        if (!relation) continue;
        insertMatch.run(id, relation, attack.name, multiplier);
      }
    }
    speciesCount += 1;
  }

  for (const form of pokemon) {
    const speciesId = Number(form.species_id);
    const formRow = formsByPokemon.get(form.id);
    const named = formRow ? formNames.get(formRow.id) : undefined;
    const fallback = form.identifier
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    const name =
      named?.pokemon ||
      named?.form ||
      (form.is_default === "1" ? (nameBySpecies.get(form.species_id) ?? fallback) : fallback);
    insertForm.run(
      Number(form.id),
      speciesId,
      name,
      form.is_default === "1" ? 1 : 0,
      formRow?.is_mega === "1" ? 1 : 0,
      formRow?.is_battle_only === "1" ? 1 : 0,
      Number(form.height),
      Number(form.weight),
    );
    for (const type of typesByPokemon.get(form.id) ?? []) {
      insertFormType.run(Number(form.id), type.slot, type.type);
    }
  }

  const formCount = pokemon.length;
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("species", String(speciesCount));
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("forms", String(formCount));
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(
    "note",
    "Champdex catalogue. The Pokédex entry is an English PokéAPI flavor text. Champdex notes are separate. Bulbapedia text is not stored.",
  );
  db.exec(`
    COMMIT;
    CREATE INDEX species_name_idx ON species(name);
    CREATE INDEX species_types_idx ON species_types(type_name, species_id);
    CREATE INDEX evolutions_from_idx ON evolutions(from_id);
    CREATE INDEX forms_species_idx ON forms(species_id);
    CREATE INDEX species_moves_idx ON species_moves(species_id);
    CREATE VIEW pokedex AS
    SELECT
      s.id,
      s.name,
      s.height_dm AS height,
      s.weight_hg AS weight,
      (SELECT base FROM species_stats WHERE species_id = s.id AND stat_name = 'HP') AS hp,
      (SELECT base FROM species_stats WHERE species_id = s.id AND stat_name = 'Attack') AS attack,
      (SELECT base FROM species_stats WHERE species_id = s.id AND stat_name = 'Defense') AS defense,
      (SELECT base FROM species_stats WHERE species_id = s.id AND stat_name = 'Special Attack') AS special_attack,
      (SELECT base FROM species_stats WHERE species_id = s.id AND stat_name = 'Special Defense') AS special_defense,
      (SELECT base FROM species_stats WHERE species_id = s.id AND stat_name = 'Speed') AS speed,
      (
        SELECT group_concat(type_name, ',')
        FROM (
          SELECT type_name FROM species_types WHERE species_id = s.id ORDER BY slot
        )
      ) AS types,
      s.evo_set,
      s.info
    FROM species s;
  `);
  db.close();
  console.log(`Wrote ${speciesCount} species and ${formCount} forms to ${OUT}`);
}

main();
