import { movePlaylistItem, shiftPlaylistItem } from "./playlist-order";
import { isYoutubeVideoId } from "./youtube-link";

/** Same cap as a Yoto playlist, without building a card. */
export const MUSIC_PLAYLIST_LIMIT = 100;

export const MUSIC_PLAYLIST_STORAGE_KEY = "pokefacts.musicPlaylist";

export type MusicPlaylistSong = {
  id: string;
  page: string;
  title: string;
  album: string;
  youtubeId: string;
};

export type MusicPlaylistDraft = {
  page: string;
  title: string;
  album: string;
  youtubeId: string | null;
};

export type MusicPlaylistRefusal = "novideo" | "full" | "duplicate";

export type AddMusicPlaylistResult = {
  songs: MusicPlaylistSong[];
  added: boolean;
  refusal: MusicPlaylistRefusal | "";
};

/** Off, the whole list again, or the current song again. */
export type MusicRepeat = "off" | "all" | "one";

export type StoredMusicPlaylist = {
  songs: MusicPlaylistSong[];
  /** The current song in My playlist. */
  index: number;
  /** Whether the player was paused. A reload always starts paused, so nothing plays by itself. */
  paused: boolean;
  repeat: MusicRepeat;
  shuffle: boolean;
  /** Song ids in shuffled play order. Empty while shuffle is off. */
  order: string[];
};

export function emptyMusicPlaylist(): StoredMusicPlaylist {
  return { songs: [], index: 0, paused: true, repeat: "off", shuffle: false, order: [] };
}

export function playableYoutubeId(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim();
  return isYoutubeVideoId(id) ? id : null;
}

/** `page:youtubeId`, with `#2`, `#3`… when that id is already taken. */
function uniqueSongId(page: string, youtubeId: string, used: Set<string>, preferred?: string): string {
  const base = preferred || `${page}:${youtubeId}`;
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}#${n}`;
  used.add(id);
  return id;
}

export function musicPlaylistRefusalText(refusal: MusicPlaylistRefusal): string {
  if (refusal === "novideo") return "No YouTube video was found for this song.";
  if (refusal === "duplicate") return "That song is already in My playlist.";
  return `A playlist holds ${MUSIC_PLAYLIST_LIMIT} tracks.`;
}

export function hasMusicPlaylistSong(songs: readonly MusicPlaylistSong[], page: string): boolean {
  return songs.some((song) => song.page === page);
}

export function addMusicPlaylistSong(
  songs: readonly MusicPlaylistSong[],
  draft: MusicPlaylistDraft,
): AddMusicPlaylistResult {
  const refuse = (refusal: MusicPlaylistRefusal) => ({ songs: songs.slice(), added: false, refusal });
  if (hasMusicPlaylistSong(songs, draft.page)) return refuse("duplicate");
  if (songs.length >= MUSIC_PLAYLIST_LIMIT) return refuse("full");
  const youtubeId = playableYoutubeId(draft.youtubeId);
  if (!youtubeId) return refuse("novideo");
  const used = new Set(songs.map((song) => song.id));
  return {
    songs: [
      ...songs,
      {
        id: uniqueSongId(draft.page, youtubeId, used),
        page: draft.page,
        title: draft.title,
        album: draft.album,
        youtubeId,
      },
    ],
    added: true,
    refusal: "",
  };
}

export function removeMusicPlaylistSong(songs: readonly MusicPlaylistSong[], index: number): MusicPlaylistSong[] {
  if (!Number.isInteger(index) || index < 0 || index >= songs.length) return songs.slice();
  return songs.filter((_, itemIndex) => itemIndex !== index);
}

/** Move one step toward the start (`-1`) or the end (`1`). */
export function moveMusicPlaylistSong(
  songs: readonly MusicPlaylistSong[],
  index: number,
  delta: -1 | 1,
): MusicPlaylistSong[] {
  return shiftPlaylistItem(songs, index, delta);
}

export function musicPlaylistIndexAfterRemove(index: number, removed: number, lengthBefore: number): number {
  if (!Number.isInteger(removed) || removed < 0 || removed >= lengthBefore) return clampIndex(index, lengthBefore);
  const nextLength = lengthBefore - 1;
  if (nextLength <= 0) return 0;
  if (removed < index) return index - 1;
  if (removed === index) return Math.min(index, nextLength - 1);
  return clampIndex(index, nextLength);
}

/** Drop the song at `from` onto `to`. The moved song occupies `to`. */
export function placeMusicPlaylistSong<T>(songs: readonly T[], from: number, to: number): T[] {
  return movePlaylistItem(songs, from, to);
}

export function musicPlaylistIndexAfterPlace(index: number, from: number, to: number, length: number): number {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= length ||
    to >= length ||
    from === to
  ) {
    return clampIndex(index, length);
  }
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

export function musicPlaylistIndexAfterMove(
  index: number,
  from: number,
  delta: -1 | 1,
  length: number,
): number {
  const to = from + delta;
  if (!Number.isInteger(from) || from < 0 || from >= length || to < 0 || to >= length) return clampIndex(index, length);
  if (index === from) return to;
  if (index === to) return from;
  return index;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isInteger(index) || index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

/**
 * Shuffle every id except `firstId`, which stays at the front so the
 * song that is on now is not played twice. `random` returns [0, 1).
 */
export function shuffledMusicOrder(
  ids: readonly string[],
  firstId: string | undefined,
  random: () => number = Math.random,
): string[] {
  const rest = ids.filter((id) => id !== firstId);
  for (let at = rest.length - 1; at > 0; at -= 1) {
    const pick = Math.min(at, Math.floor(random() * (at + 1)));
    [rest[at], rest[pick]] = [rest[pick] as string, rest[at] as string];
  }
  return firstId !== undefined && ids.includes(firstId) ? [firstId, ...rest] : rest;
}

/** Keep the shuffled order in step with the songs: gone ids leave, new ids join at the end. */
function reconcileOrder(order: readonly string[], songs: readonly MusicPlaylistSong[], shuffle: boolean): string[] {
  if (!shuffle) return [];
  const present = new Set(songs.map((song) => song.id));
  const kept = [...new Set(order)].filter((id) => present.has(id));
  const listed = new Set(kept);
  return [...kept, ...songs.map((song) => song.id).filter((id) => !listed.has(id))];
}

/** Clamp the index and repair the shuffle order after any change. */
function tidy(playlist: StoredMusicPlaylist): StoredMusicPlaylist {
  const songs = playlist.songs.slice(0, MUSIC_PLAYLIST_LIMIT);
  return {
    ...playlist,
    songs,
    index: clampIndex(playlist.index, songs.length),
    order: reconcileOrder(playlist.order, songs, playlist.shuffle),
  };
}

export function addToMusicPlaylist(
  playlist: StoredMusicPlaylist,
  draft: MusicPlaylistDraft,
): { playlist: StoredMusicPlaylist; refusal: MusicPlaylistRefusal | "" } {
  const result = addMusicPlaylistSong(playlist.songs, draft);
  if (!result.added) return { playlist, refusal: result.refusal };
  return { playlist: tidy({ ...playlist, songs: result.songs }), refusal: "" };
}

export function removeFromMusicPlaylist(playlist: StoredMusicPlaylist, at: number): StoredMusicPlaylist {
  return tidy({
    ...playlist,
    songs: removeMusicPlaylistSong(playlist.songs, at),
    index: musicPlaylistIndexAfterRemove(playlist.index, at, playlist.songs.length),
  });
}

export function moveInMusicPlaylist(playlist: StoredMusicPlaylist, at: number, delta: -1 | 1): StoredMusicPlaylist {
  return tidy({
    ...playlist,
    songs: moveMusicPlaylistSong(playlist.songs, at, delta),
    index: musicPlaylistIndexAfterMove(playlist.index, at, delta, playlist.songs.length),
  });
}

export function placeInMusicPlaylist(playlist: StoredMusicPlaylist, from: number, to: number): StoredMusicPlaylist {
  return tidy({
    ...playlist,
    songs: placeMusicPlaylistSong(playlist.songs, from, to),
    index: musicPlaylistIndexAfterPlace(playlist.index, from, to, playlist.songs.length),
  });
}

export function selectInMusicPlaylist(playlist: StoredMusicPlaylist, at: number): StoredMusicPlaylist {
  return tidy({ ...playlist, index: at });
}

export function nextMusicRepeat(repeat: MusicRepeat): MusicRepeat {
  if (repeat === "off") return "all";
  if (repeat === "all") return "one";
  return "off";
}

export function musicRepeatLabel(repeat: MusicRepeat): string {
  if (repeat === "all") return "Repeat: all";
  if (repeat === "one") return "Repeat: this song";
  return "Repeat: off";
}

/** Turning shuffle on keeps the current song first, then shuffles the rest. */
export function shuffleMusicPlaylist(
  playlist: StoredMusicPlaylist,
  shuffle: boolean,
  random: () => number = Math.random,
): StoredMusicPlaylist {
  const current = playlist.songs[playlist.index]?.id;
  const order = shuffle ? shuffledMusicOrder(playlist.songs.map((song) => song.id), current, random) : [];
  return tidy({ ...playlist, shuffle, order });
}

/** Indexes into `songs`, in the order they play. */
export function musicPlayOrder(playlist: StoredMusicPlaylist): number[] {
  if (!playlist.shuffle) return playlist.songs.map((_, index) => index);
  const indexById = new Map(playlist.songs.map((song, index) => [song.id, index]));
  return reconcileOrder(playlist.order, playlist.songs, true).flatMap((id) => {
    const index = indexById.get(id);
    return index === undefined ? [] : [index];
  });
}

/**
 * The song after (`1`) or before (`-1`) the current one, or null when the list stops there.
 * A song that ends with Repeat one plays again. Repeat all wraps at both ends.
 * Repeat one does not hold back Next and Previous.
 */
export function musicPlaylistNeighbour(
  playlist: StoredMusicPlaylist,
  direction: -1 | 1,
  reason: "skip" | "ended",
): number | null {
  if (playlist.songs.length === 0) return null;
  const index = clampIndex(playlist.index, playlist.songs.length);
  if (reason === "ended" && playlist.repeat === "one") return index;
  const sequence = musicPlayOrder(playlist);
  const at = Math.max(0, sequence.indexOf(index));
  let next = at + direction;
  if (next < 0 || next >= sequence.length) {
    if (playlist.repeat !== "all") return null;
    next = (next + sequence.length) % sequence.length;
  }
  return sequence[next] ?? null;
}

/**
 * In-page YouTube embed. The id is only placed in the iframe URL.
 * Nothing here fetches media bytes.
 */
export function youtubeNocookieEmbedSrc(videoId: string, origin: string, autoplay: boolean): string {
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
  });
  if (origin) params.set("origin", origin);
  if (autoplay) params.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

type StoredSongRow = {
  id?: unknown;
  page?: unknown;
  title?: unknown;
  album?: unknown;
  youtubeId?: unknown;
};

function storedSong(value: unknown): (StoredSongRow & { page: string; title: string; youtubeId: string }) | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StoredSongRow;
  if (typeof row.page !== "string" || typeof row.title !== "string" || typeof row.youtubeId !== "string") return null;
  if (playableYoutubeId(row.youtubeId) !== row.youtubeId) return null;
  return row as StoredSongRow & { page: string; title: string; youtubeId: string };
}

export function readStoredMusicPlaylist(raw: string | null): StoredMusicPlaylist {
  if (!raw) return emptyMusicPlaylist();
  try {
    return normalizeStoredMusicPlaylist(JSON.parse(raw) as unknown);
  } catch {
    return emptyMusicPlaylist();
  }
}

/**
 * Saved playlists from before ids, repeat, and shuffle still load.
 * A row without an id gets the same id on every read, and ids never repeat.
 */
function normalizeStoredMusicPlaylist(value: unknown): StoredMusicPlaylist {
  if (!value || typeof value !== "object") return emptyMusicPlaylist();
  const row = value as {
    songs?: unknown;
    index?: unknown;
    paused?: unknown;
    repeat?: unknown;
    shuffle?: unknown;
    order?: unknown;
  };
  if (!Array.isArray(row.songs)) return emptyMusicPlaylist();
  const songs: MusicPlaylistSong[] = [];
  const used = new Set<string>();
  for (const item of row.songs) {
    const song = storedSong(item);
    if (!song) continue;
    const saved = typeof song.id === "string" ? song.id.trim() : "";
    songs.push({
      id: uniqueSongId(song.page, song.youtubeId, used, saved),
      page: song.page,
      title: song.title,
      album: typeof song.album === "string" ? song.album : "",
      youtubeId: song.youtubeId,
    });
    if (songs.length >= MUSIC_PLAYLIST_LIMIT) break;
  }
  const repeat: MusicRepeat = row.repeat === "all" || row.repeat === "one" ? row.repeat : "off";
  const order = Array.isArray(row.order) ? row.order.filter((id): id is string => typeof id === "string") : [];
  return tidy({
    songs,
    index: typeof row.index === "number" ? row.index : 0,
    paused: row.paused !== false,
    repeat,
    shuffle: row.shuffle === true,
    order,
  });
}

export function serializeMusicPlaylist(playlist: StoredMusicPlaylist): string {
  const tidied = tidy(playlist);
  return JSON.stringify({
    songs: tidied.songs,
    index: tidied.index,
    paused: tidied.paused,
    repeat: tidied.repeat,
    shuffle: tidied.shuffle,
    order: tidied.order,
  });
}
