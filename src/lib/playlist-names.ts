/**
 * Playlist names in the parent's Yoto library: spotting one that is already there, and the next free
 * numbered name. "Starter Pokémon" becomes "Starter Pokémon 2"; a name that already ends in a number,
 * such as "Pokefacts 1", becomes "Pokefacts 1 (2)" so the numbers do not run together.
 */
export type LibraryPlaylist = { cardId: string; title: string };

/** "Starter  pokémon " and "Starter Pokémon" are the same name. */
export function titleKey(title: string): string {
  return title.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-GB");
}

/** The playlist already in the library under this name, if there is one. */
export function playlistNamed(library: readonly LibraryPlaylist[], title: string): LibraryPlaylist | undefined {
  const key = titleKey(title);
  return key ? library.find((item) => titleKey(item.title) === key) : undefined;
}

/** The first numbered name not in the library, or the name itself when it is free. */
export function nextFreeTitle(title: string, taken: readonly string[]): string {
  const base = title.replace(/\s+/g, " ").trim();
  const used = new Set(taken.map(titleKey));
  if (!used.has(titleKey(base))) return base;
  const numbered = /\d$/.test(base) ? (n: number) => `${base} (${n})` : (n: number) => `${base} ${n}`;
  for (let n = 2; ; n += 1) {
    const name = numbered(n);
    if (!used.has(titleKey(name))) return name;
  }
}

/** What to do when a new playlist's name is already in the library. */
export type NameClash = "number" | "replace";
