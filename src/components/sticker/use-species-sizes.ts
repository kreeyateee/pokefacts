"use client";

import { useCallback, useRef, useState } from "react";

export type SpeciesSize = { heightDm: number; color: string };

const PICK_CHUNK = 200;

/** Pokédex height and colour for the group photo and pile, read in a few requests per card. */
export function useSpeciesSizes() {
  const [sizes, setSizes] = useState<Record<number, SpeciesSize>>({});
  const asked = useRef(new Set<number>());

  const loadAll = useCallback(async (ids: readonly number[]) => {
    const wanted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0 && !asked.current.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) asked.current.add(id);
    const found: Record<number, SpeciesSize> = {};
    for (let start = 0; start < wanted.length; start += PICK_CHUNK) {
      const chunk = wanted.slice(start, start + PICK_CHUNK);
      try {
        const response = await fetch(`/api/catalogue?pick=${chunk.join(",")}`);
        const payload = (await response.json().catch(() => null)) as {
          items?: Array<{ id?: unknown; heightDm?: unknown; color?: unknown }>;
        } | null;
        for (const item of payload?.items ?? []) {
          if (typeof item.id !== "number") continue;
          found[item.id] = {
            heightDm: typeof item.heightDm === "number" ? item.heightDm : 0,
            color: typeof item.color === "string" ? item.color : "",
          };
        }
      } catch {
        // Without sizes everyone stands the same height. The photo still works.
        for (const id of chunk) asked.current.delete(id);
      }
    }
    setSizes((current) => ({ ...current, ...found }));
  }, []);

  return { sizes, loadAll };
}
