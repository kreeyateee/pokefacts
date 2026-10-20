export type PlaylistMon = {
  id: number;
  name: string;
};

/**
 * Put the item at `from` into index `to`.
 * The moved item occupies `to` in the returned list.
 */
export function movePlaylistItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items.slice();
  }
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return items.slice();
  next.splice(to, 0, item);
  return next;
}

/** Move one step toward the start (`-1`) or the end (`1`). */
export function shiftPlaylistItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  return movePlaylistItem(items, index, index + delta);
}

export function orderPlaylist(items: readonly PlaylistMon[], by: "number" | "name"): PlaylistMon[] {
  const next = items.slice();
  next.sort((a, b) => {
    if (by === "number") return a.id - b.id;
    const name = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    return name !== 0 ? name : a.id - b.id;
  });
  return next;
}

export function reversePlaylist<T>(items: readonly T[]): T[] {
  return items.slice().reverse();
}
