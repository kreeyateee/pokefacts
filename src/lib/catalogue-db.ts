import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  CatalogueEntry,
  CatalogueForm,
  CatalogueFormRef,
  CatalogueListItem,
  CataloguePage,
} from "@/lib/catalogue-types";
import type { MonSheet } from "@/lib/dex-facts";
import { habitatSpeech } from "@/lib/format";

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

/**
 * PokéAPI stores one English name for each of these pairs.
 * The pictures are different: male and female Mega Meowstic, and
 * Zygarde's Power Construct 10% forme beside the ordinary 10% forme.
 */
const DISTINCT_FORM_NAMES: Record<number, string> = {
  10314: "Mega Meowstic (Male)",
  10326: "Mega Meowstic (Female)",
  10118: "10% Zygarde (Power Construct)",
};

function formDisplayName(id: number, name: string): string {
  return DISTINCT_FORM_NAMES[id] ?? name;
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

/** Every species id matching the catalogue search, in dex order. */
export function catalogueMatchIds(input: SearchInput = {}): number[] {
  const q = (input.q ?? "").trim().slice(0, 40);
  const type = (input.type ?? "").trim();
  const generation =
    input.generation && input.generation >= 1 && input.generation <= 9 ? input.generation : 0;
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
  const rows = db()
    .prepare(`SELECT s.id FROM species s ${where} ORDER BY s.id`)
    .all(...params) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

/** Names for a catalogue pick, in the order the ids were given. Unknown ids are skipped. */
export function cataloguePick(ids: readonly number[]): Array<{ id: number; name: string }> {
  const wanted = ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, 1025);
  if (wanted.length === 0) return [];
  const found = new Map<number, string>();
  const unique = [...new Set(wanted)];
  for (let index = 0; index < unique.length; index += 200) {
    const chunk = unique.slice(index, index + 200);
    const marks = chunk.map(() => "?").join(", ");
    const rows = db()
      .prepare(`SELECT id, name FROM species WHERE id IN (${marks})`)
      .all(...chunk) as Array<{ id: number; name: string }>;
    for (const row of rows) found.set(row.id, row.name);
  }
  return wanted.flatMap((id) => {
    const name = found.get(id);
    return name ? [{ id, name }] : [];
  });
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
    name: formDisplayName(form.id, form.name),
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

/** Every national species, for Facts and Guess Who. Reads SQLite only. */
export function listMonSheets(): MonSheet[] {
  const species = db()
    .prepare(
      `SELECT id, slug, name, genus, habitat, height_dm, weight_hg, info, info_version, evolves_from_id
       FROM species
       ORDER BY id`,
    )
    .all() as Array<{
    id: number;
    slug: string;
    name: string;
    genus: string;
    habitat: string | null;
    height_dm: number;
    weight_hg: number;
    info: string;
    info_version: string;
    evolves_from_id: number | null;
  }>;
  const typeRows = db()
    .prepare("SELECT species_id, type_name FROM species_types ORDER BY species_id, slot")
    .all() as Array<{ species_id: number; type_name: string }>;
  const abilityRows = db()
    .prepare(
      `SELECT sa.species_id, sa.ability_name, sa.is_hidden, IFNULL(a.info, '') AS info
       FROM species_abilities sa
       LEFT JOIN abilities a ON a.id = sa.ability_id
       ORDER BY sa.species_id, sa.is_hidden, sa.slot`,
    )
    .all() as Array<{
    species_id: number;
    ability_name: string;
    is_hidden: number;
    info: string;
  }>;
  const evoRows = db()
    .prepare(
      `SELECT e.from_id, s.name AS name, e.method
       FROM evolutions e
       JOIN species s ON s.id = e.into_id
       ORDER BY e.from_id, e.into_id`,
    )
    .all() as Array<{ from_id: number; name: string; method: string }>;

  const types = new Map<number, string[]>();
  for (const row of typeRows) {
    const list = types.get(row.species_id) ?? [];
    list.push(row.type_name);
    types.set(row.species_id, list);
  }
  const abilities = new Map<number, { name: string; info: string }>();
  for (const row of abilityRows) {
    if (abilities.has(row.species_id)) continue;
    abilities.set(row.species_id, { name: row.ability_name, info: row.info });
  }
  const evolutions = new Map<number, Array<{ name: string; method: string }>>();
  for (const row of evoRows) {
    const list = evolutions.get(row.from_id) ?? [];
    list.push({ name: row.name, method: row.method });
    evolutions.set(row.from_id, list);
  }
  const nameById = new Map(species.map((row) => [row.id, row.name]));

  return species.map((row) => {
    const ability = abilities.get(row.id);
    const steps = evolutions.get(row.id) ?? [];
    const evolution = steps
      .map((step) => `${row.name} becomes ${step.name} ${step.method}.`.replace(/\s+/g, " ").trim())
      .join(" ");
    const evolvesInto = [...new Set(steps.map((step) => step.name))];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      genus: row.genus,
      types: types.get(row.id) ?? [],
      heightDecimetres: row.height_dm,
      weightHectograms: row.weight_hg,
      stats: [],
      abilityName: ability?.name ?? null,
      abilityEffect: ability?.info || null,
      evolution,
      evolvesFrom: row.evolves_from_id ? (nameById.get(row.evolves_from_id) ?? null) : null,
      evolvesInto,
      habitat: row.habitat ? habitatSpeech(row.habitat) : null,
      entries: row.info ? [{ text: row.info, version: row.info_version }] : [],
    };
  });
}

type FormRefRow = {
  id: number;
  species_id: number;
  species_name: string;
  form_name: string;
};

function mapFormRef(row: FormRefRow): CatalogueFormRef {
  return {
    formId: row.id,
    speciesId: row.species_id,
    speciesName: row.species_name,
    formName: formDisplayName(row.id, row.form_name),
  };
}

function queryFormRefs(where: string, param?: number): CatalogueFormRef[] {
  const sql = `SELECT f.id, f.species_id, s.name AS species_name, f.name AS form_name
    FROM forms f JOIN species s ON s.id = f.species_id
    WHERE ${where}
    ORDER BY f.species_id, f.id`;
  const rows = (
    param == null ? db().prepare(sql).all() : db().prepare(sql).all(param)
  ) as FormRefRow[];
  return rows.map(mapFormRef);
}

/** One row per Mega Evolution form. Charizard and Mewtwo each contribute two. */
export function listMegaForms(): CatalogueFormRef[] {
  return queryFormRefs("f.is_mega = 1");
}

/** One row per Gigantamax form, including Amped and Low Key when both exist. */
export function listGigantamaxForms(): CatalogueFormRef[] {
  return queryFormRefs("f.name LIKE 'Gigantamax %'");
}

/** Non-default forms whose names start with Alolan. Totem and cap costumes stay out. */
export function listAlolanForms(): CatalogueFormRef[] {
  return queryFormRefs("f.is_default = 0 AND f.name LIKE 'Alolan %'");
}

/** Non-default forms whose names start with Hisuian. */
export function listHisuianForms(): CatalogueFormRef[] {
  return queryFormRefs("f.is_default = 0 AND f.name LIKE 'Hisuian %'");
}

function sheetsWhere(column: "is_legendary" | "is_mythical"): MonSheet[] {
  const ids = new Set(
    (db().prepare(`SELECT id FROM species WHERE ${column} = 1 ORDER BY id`).all() as Array<{ id: number }>).map(
      (row) => row.id,
    ),
  );
  return listMonSheets().filter((sheet) => ids.has(sheet.id));
}

/** Species flagged legendary. Mythical species are a separate list. */
export function listLegendarySheets(): MonSheet[] {
  return sheetsWhere("is_legendary");
}

/** Species flagged mythical. */
export function listMythicalSheets(): MonSheet[] {
  return sheetsWhere("is_mythical");
}

export function listSpecialForms(speciesId: number): CatalogueFormRef[] {
  return queryFormRefs("(f.is_mega = 1 OR f.name LIKE 'Gigantamax %') AND f.species_id = ?", speciesId);
}

export function getSpecialForm(formId: number): CatalogueFormRef | null {
  return queryFormRefs("(f.is_mega = 1 OR f.name LIKE 'Gigantamax %') AND f.id = ?", formId)[0] ?? null;
}

/** A Mega, Gigantamax, Alolan, or Hisuian form, for the form-reading route. */
export function getPlaylistForm(formId: number): CatalogueFormRef | null {
  return (
    queryFormRefs(
      `(f.is_mega = 1 OR f.name LIKE 'Gigantamax %' OR ((f.name LIKE 'Alolan %' OR f.name LIKE 'Hisuian %') AND f.is_default = 0)) AND f.id = ?`,
      formId,
    )[0] ?? null
  );
}
