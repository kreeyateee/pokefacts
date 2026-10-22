"use client";

import { useCallback, useRef, useState } from "react";

export type HeroEntry = { types: string[]; genus: string };

/** Types and kind for the star Pokémon, read from the Pokédex once per number. */
export function useHeroEntries() {
  const [entries, setEntries] = useState<Record<number, HeroEntry | null>>({});
  const asked = useRef(new Map<number, Promise<void>>());

  const load = useCallback((id: number): Promise<void> => {
    if (!Number.isInteger(id) || id < 1) return Promise.resolve();
    const waiting = asked.current.get(id);
    if (waiting) return waiting;
    const promise = fetch(`/api/catalogue/${id}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          entry?: { types?: unknown; genus?: unknown };
        } | null;
        const types = Array.isArray(payload?.entry?.types)
          ? payload.entry.types.filter((type): type is string => typeof type === "string")
          : [];
        const genus = typeof payload?.entry?.genus === "string" ? payload.entry.genus : "";
        setEntries((current) => ({ ...current, [id]: response.ok ? { types, genus } : null }));
      })
      .catch(() => {
        setEntries((current) => ({ ...current, [id]: null }));
      });
    asked.current.set(id, promise);
    return promise;
  }, []);

  const loadAll = useCallback(async (ids: readonly number[]) => {
    await Promise.all(ids.map((id) => load(id)));
  }, [load]);

  return { entries, load, loadAll };
}
