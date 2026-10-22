import { isYoutubeVideoId } from "./youtube-link";

/** `YT.PlayerState` from the YouTube iframe API. */
export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** What /api/music/youtube said about a song that has no stored video id. */
export type VideoLookup =
  | { state: "found"; youtubeId: string }
  | { state: "none" }
  /** The lookup itself failed. It can be tried again. */
  | { state: "error" };

export type LookupSong = { page: string; youtubeId: string | null };

/** The stored id plays first. A lookup only fills in a song that has none. */
export function songVideoId(song: LookupSong, lookup: VideoLookup | undefined): string | null {
  if (song.youtubeId && isYoutubeVideoId(song.youtubeId)) return song.youtubeId;
  return lookup?.state === "found" ? lookup.youtubeId : null;
}

/** A song that still needs /api/music/youtube. Failed lookups wait for Retry. */
export function needsLookup(song: LookupSong, lookup: VideoLookup | undefined): boolean {
  return !songVideoId(song, lookup) && lookup === undefined;
}

/**
 * Songs to look up for the album on screen: the selected song first, then the rest
 * in album order. Songs with a stored id, or an answer already, are skipped.
 */
export function lookupQueue(
  songs: readonly LookupSong[],
  selectedPage: string | undefined,
  lookups: Readonly<Record<string, VideoLookup>>,
): string[] {
  const waiting = songs.filter((song) => needsLookup(song, lookups[song.page]));
  const selected = waiting.find((song) => song.page === selectedPage);
  const rest = waiting.filter((song) => song !== selected);
  return [...(selected ? [selected] : []), ...rest].map((song) => song.page);
}

/** Read the JSON body of /api/music/youtube. */
export function readVideoLookup(ok: boolean, payload: unknown): VideoLookup {
  if (!ok || !payload || typeof payload !== "object") return { state: "error" };
  const id = (payload as { youtubeId?: unknown }).youtubeId;
  if (typeof id === "string" && isYoutubeVideoId(id)) return { state: "found", youtubeId: id };
  return id === null ? { state: "none" } : { state: "error" };
}

/**
 * The line under the player when there is no video to show.
 * Empty when the song can play.
 */
export function songVideoNote(input: { gap?: string; videoId: string | null; lookup: VideoLookup | undefined }): string {
  if (input.videoId) return "";
  if (input.gap === "missingtitle") return "Bulbapedia does not have a page for this song.";
  if (input.gap) return "This song page did not load from Bulbapedia.";
  if (input.lookup === undefined) return "Finding this song on YouTube…";
  if (input.lookup.state === "error") return "YouTube could not be searched just now.";
  return "No YouTube video was found for this song.";
}
