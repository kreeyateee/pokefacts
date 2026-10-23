"use client";

import { useCallback, useRef, useState } from "react";

import type { MonLook } from "@/lib/playlist-cover";
import type { SpeciesSize } from "@/lib/sticker-spec";

export type { SpeciesSize };

const PICK_CHUNK = 200;

/** Height and colour, and where each lives, for the group photo and the cover's background. */
export type SpeciesLook = SpeciesSize & MonLook;

function readLook(item: Record<string, unknown>): SpeciesLook {
  return {
    heightDm: typeof item.heightDm === "number" ? item.heightDm : 0,
    color: typeof item.color === "string" ? item.color : "",
    habitat: typeof item.habitat === "string" ? item.habitat : null,
    types: Array.isArray(item.types) ? item.types.filter((type): type is string => typeof type === "string") : [],
    legendary: item.legendary === true,
    mythical: item.mythical === true,
  };
}

/** Pokédex height, colour, habitat, and types for each id, a few hundred per request. Ids that fail are left out. */
export async function fetchSpeciesLooks(ids: readonly number[]): Promise<Record<number, SpeciesLook>> {
  const wanted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  const found: Record<number, SpeciesLook> = {};
  for (let start = 0; start < wanted.length; start += PICK_CHUNK) {
    const chunk = wanted.slice(start, start + PICK_CHUNK);
    try {
      const response = await fetch(`/api/catalogue?pick=${chunk.join(",")}`);
      const payload = (await response.json().catch(() => null)) as { items?: Array<Record<string, unknown>> } | null;
      for (const item of payload?.items ?? []) {
        if (typeof item.id === "number") found[item.id] = readLook(item);
      }
    } catch {
      // Without sizes everyone stands the same height. The photo still works.
    }
  }
  return found;
}

/** Pokédex height and colour for the group photo and pile, read in a few requests per card. */
export function useSpeciesSizes() {
  const [sizes, setSizes] = useState<Record<number, SpeciesSize>>({});
  const asked = useRef(new Set<number>());

  const loadAll = useCallback(async (ids: readonly number[]) => {
    const wanted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0 && !asked.current.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) asked.current.add(id);
    const found = await fetchSpeciesLooks(wanted);
    // Ask again next time for any that did not arrive.
    for (const id of wanted) if (!found[id]) asked.current.delete(id);
    setSizes((current) => ({ ...current, ...found }));
  }, []);

  return { sizes, loadAll };
}
