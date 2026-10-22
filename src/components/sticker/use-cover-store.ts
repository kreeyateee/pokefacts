"use client";

import { useEffect, useRef, useState } from "react";

import type { KidCard } from "@/lib/kid-cards";
import { monsFor, suggestedCover } from "@/lib/sticker-cover";
import { readCoverDraft, staleCoverIds, stickerStorageKey, type CoverDraft } from "@/lib/sticker-layout";

const SAVE_DELAY_MS = 300;
const PICK_PREFIX = stickerStorageKey("selection-");

function readCover(item: KidCard): CoverDraft {
  const fresh = suggestedCover(item);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(stickerStorageKey(item.id));
  } catch {
    return fresh;
  }
  return readCoverDraft(raw, fresh, new Set(monsFor(item).map((mon) => mon.key)));
}

function comparable(cover: CoverDraft): string {
  return JSON.stringify({ ...cover, savedAt: 0 });
}

/** Old Pokédex pick covers pile up, one per pick. Keep the newest and drop the rest. */
function tidyOldPicks(keep: ReadonlySet<string>) {
  try {
    const saved: { id: string; savedAt: number }[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PICK_PREFIX)) continue;
      const id = key.slice(stickerStorageKey("").length);
      if (keep.has(id)) continue;
      const savedAt = Number((JSON.parse(localStorage.getItem(key) ?? "{}") as { savedAt?: unknown }).savedAt);
      saved.push({ id, savedAt: Number.isFinite(savedAt) ? savedAt : 0 });
    }
    for (const id of staleCoverIds(saved)) localStorage.removeItem(stickerStorageKey(id));
  } catch {
    // Tidying is a nicety. A full or blocked store still prints.
  }
}

/** Save covers that changed since they were last written. False when the browser refused one. */
function writeChanged(seen: Map<string, string>, covers: Record<string, CoverDraft>): boolean {
  let ok = true;
  for (const [id, cover] of Object.entries(covers)) {
    const same = comparable(cover);
    if (seen.get(id) === same) continue;
    try {
      localStorage.setItem(stickerStorageKey(id), JSON.stringify({ ...cover, savedAt: Date.now() }));
      seen.set(id, same);
    } catch {
      ok = false;
    }
  }
  return ok;
}

/**
 * Every card's cover in this studio, read once when it opens and saved a moment after each change.
 * `saveFailed` turns on when the browser will not keep the cover, so the page can say so.
 */
export function useCoverStore(roster: readonly KidCard[]) {
  const [covers, setCovers] = useState<Record<string, CoverDraft>>(() =>
    Object.fromEntries(roster.map((item) => [item.id, readCover(item)])),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const written = useRef<Map<string, string> | null>(null);
  const latest = useRef(covers);

  useEffect(() => {
    const seen = new Map(Object.entries(latest.current).map(([id, cover]) => [id, comparable(cover)]));
    written.current = seen;
    tidyOldPicks(new Set(seen.keys()));
    return () => {
      writeChanged(seen, latest.current);
    };
  }, []);

  useEffect(() => {
    latest.current = covers;
    const seen = written.current;
    if (!seen) return;
    const timer = window.setTimeout(() => setSaveFailed(!writeChanged(seen, covers)), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [covers]);

  function update(id: string, change: (cover: CoverDraft) => CoverDraft) {
    setCovers((current) => {
      const cover = current[id];
      return cover ? { ...current, [id]: change(cover) } : current;
    });
  }

  return { covers, update, saveFailed };
}
