import type { SelectionKind } from "@/lib/selection-playlist";

/** The Make your own pick lives in localStorage, so a Yoto login redirect or a refresh keeps it. */
export const CATALOGUE_PICKS_KEY = "pokefacts.cataloguePicks";

/** The last national dex number. A picked id past it is a PokéAPI form id, such as 10091 for Alolan Rattata. */
export const LAST_SPECIES_ID = 1025;

/** More than every species and form together; a pick this long is a bad row, not a real pick. */
const MAX_PICKED = 2000;

const SELECTION_KINDS: readonly SelectionKind[] = ["facts", "whos-that", "advanced"];

type CataloguePicks = {
  ids: number[];
  kind: SelectionKind;
  title: string;
};

export const EMPTY_PICKS: CataloguePicks = { ids: [], kind: "facts", title: "" };

/** Species and forms share one list, so the order the child picked stays the playlist order. */
export function isFormPick(id: number): boolean {
  return id > LAST_SPECIES_ID;
}

function isSelectionKind(value: unknown): value is SelectionKind {
  return SELECTION_KINDS.includes(value as SelectionKind);
}

function cleanIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 1) continue;
    seen.add(item);
    if (seen.size >= MAX_PICKED) break;
  }
  return [...seen];
}

export function readCataloguePicks(raw: string | null): CataloguePicks {
  if (!raw) return EMPTY_PICKS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_PICKS;
  }
  if (!value || typeof value !== "object") return EMPTY_PICKS;
  const row = value as { ids?: unknown; kind?: unknown; title?: unknown };
  return {
    ids: cleanIds(row.ids),
    kind: isSelectionKind(row.kind) ? row.kind : "facts",
    title: typeof row.title === "string" ? row.title : "",
  };
}

export function serializeCataloguePicks(picks: CataloguePicks): string {
  return JSON.stringify({ ids: cleanIds(picks.ids), kind: picks.kind, title: picks.title });
}
