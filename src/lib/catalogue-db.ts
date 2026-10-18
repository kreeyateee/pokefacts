import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  CatalogueEntry,
  CatalogueForm,
  CatalogueListItem,
  CataloguePage,
} from "@/lib/catalogue-types";

const PAGE_SIZE = 40;

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (!database) {
    database = new DatabaseSync(path.join(process.cwd(), "data", "champdex.sqlite"), {
      readOnly: true,
    });
  }
  return database;
}

export function kilogramsLabel(hectograms: number): string {
  const kilograms = hectograms / 10;
  const text = Number.isInteger(kilograms) ? String(kilograms) : kilograms.toFixed(1);
  return `${text} kilograms`;
}

export function centimetresLabel(decimetres: number): string {
  return `${decimetres * 10} centimetres`;
}

function meta(key: string): number {
  const row = db().prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return Number(row?.value ?? 0);
}

function typesFor(speciesId: number): string[] {
  const rows = db()
    .prepare(
      "SELECT type_name FROM species_types WHERE species_id = ? ORDER BY slot",
    )
    .all(speciesId) as Array<{ type_name: string }>;
  return rows.map((row) => row.type_name);
}

type SearchInput = {
  q?: string;
  type?: string;
  generation?: number;
  page?: number;
};

export function searchCatalogue(input: SearchInput = {}): CataloguePage {
  const q = (input.q ?? "").trim().slice(0, 40);
  const type = (input.type ?? "").trim();
  const generation = input.generation && input.generation >= 1 && input.generation <= 9
    ? input.generation
    : 0;
  const page = Math.max(1, input.page ?? 1);
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const numeric = /^\d+$/.test(q) ? Number(q) : 0;
  const where = `
    WHERE (
      ? = ''
      OR s.name LIKE ? ESCAPE '\\'
      OR (? != 0 AND s.id = ?)
    )
    AND (? = '' OR EXISTS (
      SELECT 1 FROM species_types t
      WHERE t.species_id = s.id AND t.type_name = ?
    ))
    AND (? = 0 OR s.generation = ?)
  `;
  const params = [q, like, numeric, numeric, type, type, generation, generation];
  const totalRow = db()
    .prepare(`SELECT COUNT(*) AS total FROM species s ${where}`)
    .get(...params) as { total: number };
  const rows = db()
    .prepare(
      `SELECT s.id, s.name, s.genus, s.height_dm, s.weight_hg
       FROM species s
       ${where}
       ORDER BY s.id
       LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Array<{
    id: number;
    name: string;
    genus: string;
    height_dm: number;
    weight_hg: number;
  }>;
  const items: CatalogueListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    genus: row.genus,
    types: typesFor(row.id),
    heightLabel: centimetresLabel(row.height_dm),
    weightLabel: kilogramsLabel(row.weight_hg),
  }));
  return {
    total: totalRow.total,
    species: meta("species"),
    forms: meta("forms"),
    page,
    pageSize: PAGE_SIZE,
    items,
  };
}

export function getCatalogueEntry(id: number): CatalogueEntry | null {
  const row = db()
    .prepare("SELECT * FROM species WHERE id = ?")
    .get(id) as
    | {
        id: number;
        slug: string;
        name: string;
        genus: string;
        generation: number;
        region: string;
        color: string;
        shape: string;
        habitat: string | null;
        gender: string;
        capture_rate: number;
        base_happiness: number;
        is_baby: number;
        is_legendary: number;
        is_mythical: number;
        hatch_cycles: number;
        growth: string;
        height_dm: number;
        weight_hg: number;
        base_experience: number;
        evolves_from_id: number | null;
        evo_set: number | null;
        info: string;
        info_version: string;
        notes: string | null;
      }
    | undefined;
  if (!row) return null;

  const abilities = db()
    .prepare(
      `SELECT sa.ability_name, sa.is_hidden, IFNULL(a.info, '') AS info
       FROM species_abilities sa
       LEFT JOIN abilities a ON a.id = sa.ability_id
       WHERE sa.species_id = ?
       ORDER BY sa.slot`,
    )
    .all(id) as Array<{ ability_name: string; is_hidden: number; info: string }>;
  const stats = db()
    .prepare("SELECT stat_name, base FROM species_stats WHERE species_id = ?").all(id) as Array<{
    stat_name: string;
    base: number;
  }>;
  const statOrder = ["HP", "Attack", "Defense", "Special Attack", "Special Defense", "Speed"];
  const eggs = db()
    .prepare("SELECT egg_group FROM species_eggs WHERE species_id = ? ORDER BY egg_group")
    .all(id) as Array<{ egg_group: string }>;
  const evolutions = db()
    .prepare(
      `SELECT e.into_id AS id, s.name, e.method
       FROM evolutions e JOIN species s ON s.id = e.into_id
       WHERE e.from_id = ?
       ORDER BY e.into_id, e.method`,
    )
    .all(id) as Array<{ id: number; name: string; method: string }>;
  const from = row.evolves_from_id
    ? (db().prepare("SELECT id, name FROM species WHERE id = ?").get(row.evolves_from_id) as
        | { id: number; name: string }
        | undefined)
    : undefined;
  const matchups = db()
    .prepare(
      "SELECT relation, type_name, multiplier FROM species_matchups WHERE species_id = ?",
    )
    .all(id) as Array<{ relation: string; type_name: string; multiplier: number }>;
  const forms = db()
    .prepare(
      `SELECT id, name, is_default, is_mega, is_battle_only, height_dm, weight_hg
       FROM forms WHERE species_id = ? AND is_default = 0
       ORDER BY id`,
    )
    .all(id) as Array<{
    id: number;
    name: string;
    is_default: number;
    is_mega: number;
    is_battle_only: number;
    height_dm: number;
    weight_hg: number;
  }>;

  const packed = (relation: string) =>
    matchups
      .filter((match) => match.relation === relation)
      .map((match) => ({ type: match.type_name, multiplier: match.multiplier }))
      .sort((a, b) => b.multiplier - a.multiplier || a.type.localeCompare(b.type));

  const formTypes = (formId: number) =>
    (
      db()
        .prepare("SELECT type_name FROM form_types WHERE form_id = ? ORDER BY slot")
        .all(formId) as Array<{ type_name: string }>
    ).map((type) => type.type_name);

  const moves = db()
    .prepare(
      `SELECT m.name
       FROM species_moves sm
       JOIN moves m ON m.id = sm.move_id
       WHERE sm.species_id = ?
       ORDER BY m.name`,
    )
    .all(id) as Array<{ name: string }>;

  const otherForms: CatalogueForm[] = forms.map((form) => ({
    id: form.id,
    name: form.name,
    isDefault: false,
    isMega: form.is_mega === 1,
    isBattleOnly: form.is_battle_only === 1,
    heightLabel: centimetresLabel(form.height_dm),
    weightLabel: kilogramsLabel(form.weight_hg),
    types: formTypes(form.id),
  }));

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    genus: row.genus,
    generation: row.generation,
    region: row.region,
    color: row.color,
    shape: row.shape,
    habitat: row.habitat,
    gender: row.gender,
    captureRate: row.capture_rate,
    baseHappiness: row.base_happiness,
    isBaby: row.is_baby === 1,
    isLegendary: row.is_legendary === 1,
    isMythical: row.is_mythical === 1,
    hatchCycles: row.hatch_cycles,
    growth: row.growth,
    heightLabel: centimetresLabel(row.height_dm),
    weightLabel: kilogramsLabel(row.weight_hg),
    baseExperience: row.base_experience,
    types: typesFor(id),
    abilities: abilities.map((ability) => ({
      name: ability.ability_name,
      hidden: ability.is_hidden === 1,
      info: ability.info,
    })),
    stats: statOrder
      .map((name) => stats.find((stat) => stat.stat_name === name))
      .filter((stat): stat is { stat_name: string; base: number } => Boolean(stat))
      .map((stat) => ({ name: stat.stat_name, value: stat.base })),
    eggGroups: eggs.map((egg) => (egg.egg_group === "Undiscovered" ? "No egg group" : egg.egg_group)),
    evolvesFrom: from ?? null,
    evolutions,
    weak: packed("weak"),
    resist: packed("resist"),
    immune: packed("immune"),
    forms: otherForms,
    info: row.info,
    infoVersion: row.info_version,
    notes: row.notes,
    evolutionSet: row.evo_set,
    moves: moves.map((move) => move.name),
  };
}
