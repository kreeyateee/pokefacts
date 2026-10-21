import { movePlaylistItem, shiftPlaylistItem } from "./playlist-order";

/** Same cap as a Yoto playlist, without building a card. */
export const MUSIC_PLAYLIST_LIMIT = 100;

export const MUSIC_PLAYLIST_STORAGE_KEY = "pokefacts.musicPlaylist";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

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

export type MusicPlaylistRefusal = "novideo" | "full";

export type AddMusicPlaylistResult = {
  songs: MusicPlaylistSong[];
  added: boolean;
  refusal: MusicPlaylistRefusal | "";
};

export type StoredMusicPlaylist = {
  songs: MusicPlaylistSong[];
  index: number;
};

let playlistSongSeq = 0;

function nextPlaylistSongId(page: string, youtubeId: string): string {
  playlistSongSeq += 1;
  return `${page}:${youtubeId}:${playlistSongSeq}`;
}

export function playableYoutubeId(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim();
  return VIDEO_ID.test(id) ? id : null;
}

/** The sentence already used when a song page has no embedded video. */
export function musicPlaylistRefusalText(refusal: MusicPlaylistRefusal): string {
  if (refusal === "novideo") return "No YouTube video was found for this song.";
  return "A playlist holds 100 tracks.";
}

export function addMusicPlaylistSong(
  songs: readonly MusicPlaylistSong[],
  draft: MusicPlaylistDraft,
): AddMusicPlaylistResult {
  const youtubeId = playableYoutubeId(draft.youtubeId);
  if (!youtubeId) return { songs: songs.slice(), added: false, refusal: "novideo" };
  if (songs.length >= MUSIC_PLAYLIST_LIMIT) return { songs: songs.slice(), added: false, refusal: "full" };
  return {
    songs: [
      ...songs,
      {
        id: nextPlaylistSongId(draft.page, youtubeId),
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

export function stepMusicPlaylist(index: number, length: number, delta: -1 | 1): number {
  if (length <= 0) return 0;
  const next = index + delta;
  if (next < 0 || next >= length) return clampIndex(index, length);
  return next;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isInteger(index) || index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
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

function isPlaylistSong(value: unknown): value is MusicPlaylistSong {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MusicPlaylistSong>;
  return (
    typeof row.page === "string" &&
    typeof row.title === "string" &&
    typeof row.youtubeId === "string" &&
    playableYoutubeId(row.youtubeId) === row.youtubeId
  );
}

export function readStoredMusicPlaylist(raw: string | null): StoredMusicPlaylist {
  if (!raw) return { songs: [], index: 0 };
  try {
    return normalizeStoredMusicPlaylist(JSON.parse(raw) as unknown);
  } catch {
    return { songs: [], index: 0 };
  }
}

function normalizeStoredMusicPlaylist(value: unknown): StoredMusicPlaylist {
  if (!value || typeof value !== "object") return { songs: [], index: 0 };
  const row = value as { songs?: unknown; index?: unknown };
  if (!Array.isArray(row.songs)) return { songs: [], index: 0 };
  const songs: MusicPlaylistSong[] = [];
  for (const item of row.songs) {
    if (!isPlaylistSong(item)) continue;
    const album = typeof item.album === "string" ? item.album : "";
    const id = typeof item.id === "string" && item.id.trim() ? item.id : nextPlaylistSongId(item.page, item.youtubeId);
    songs.push({ id, page: item.page, title: item.title, album, youtubeId: item.youtubeId });
    if (songs.length >= MUSIC_PLAYLIST_LIMIT) break;
  }
  return { songs, index: clampIndex(typeof row.index === "number" ? row.index : 0, songs.length) };
}

export function serializeMusicPlaylist(playlist: StoredMusicPlaylist): string {
  return JSON.stringify({
    songs: playlist.songs.slice(0, MUSIC_PLAYLIST_LIMIT),
    index: clampIndex(playlist.index, playlist.songs.length),
  });
}
