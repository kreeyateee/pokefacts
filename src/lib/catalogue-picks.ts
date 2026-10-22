import type { SelectionKind } from "@/lib/selection-playlist";

/** The Pokédex Cards pick lives in localStorage, so a Yoto login redirect or a refresh keeps it. */
export const CATALOGUE_PICKS_KEY = "pokefacts.cataloguePicks";

/** More than every national dex number; a pick this long is a bad row, not a real pick. */
const MAX_PICKED = 2000;

const SELECTION_KINDS: readonly SelectionKind[] = ["facts", "whos-that", "advanced"];

export type CataloguePicks = {
  ids: number[];
  kind: SelectionKind;
  title: string;
};

export const EMPTY_PICKS: CataloguePicks = { ids: [], kind: "facts", title: "" };

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
