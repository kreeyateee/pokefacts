/**
 * Store a second English Pokédex line on each species.
 * The first line already in the catalogue stays. The second is the oldest
 * useful line whose wording and game differ.
 *
 * Tables come from PokéAPI: versions.csv, version_names.csv,
 * pokemon_species_flavor_text.csv in data/poke-csv.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { catalogueVersionRank, pickCataloguePair, type DexCandidate } from "../src/lib/catalogue-info";

const CSV_DIR = path.join(process.cwd(), "data", "poke-csv");
const OUT = path.join(process.cwd(), "data", "champdex.sqlite");
const ENGLISH = "9";

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

const versionRows = parseCsv("versions.csv");
const versionIdentifier = new Map(versionRows.map((row) => [row.id, row.identifier]));
const versionLabel = new Map<string, string>();
for (const row of parseCsv("version_names.csv")) {
  if (row.local_language_id === ENGLISH && row.name) versionLabel.set(row.version_id, row.name);
}

const grouped = new Map<string, DexCandidate[]>();
for (const row of parseCsv("pokemon_species_flavor_text.csv")) {
  if (row.language_id !== ENGLISH) continue;
  const identifier = versionIdentifier.get(row.version_id);
  if (!identifier) continue;
  const rank = catalogueVersionRank(identifier);
  if (rank < 0) continue;
  const list = grouped.get(row.species_id) ?? [];
  list.push({
    text: row.flavor_text,
    rank,
    version: versionLabel.get(row.version_id) ?? identifier,
  });
  grouped.set(row.species_id, list);
}

const db = new DatabaseSync(OUT);
const columns = db.prepare("PRAGMA table_info(species)").all() as Array<{ name: string }>;
if (!columns.some((column) => column.name === "info2")) {
  db.exec("ALTER TABLE species ADD COLUMN info2 TEXT NOT NULL DEFAULT ''");
}
if (!columns.some((column) => column.name === "info2_version")) {
  db.exec("ALTER TABLE species ADD COLUMN info2_version TEXT NOT NULL DEFAULT ''");
}

const species = db.prepare("SELECT id, info FROM species ORDER BY id").all() as Array<{
  id: number;
  info: string;
}>;
const update = db.prepare("UPDATE species SET info2 = ?, info2_version = ? WHERE id = ?");
let filled = 0;
db.exec("BEGIN");
for (const row of species) {
  const pair = pickCataloguePair(grouped.get(String(row.id)) ?? []);
  const second = pair.secondary;
  const text = second && second.text !== row.info ? second.text : "";
  const version = text ? (second?.version ?? "") : "";
  update.run(text, version, row.id);
  if (text) filled += 1;
}
db.exec("COMMIT");
console.log(`Second Pokédex line stored for ${filled} of ${species.length} species.`);
