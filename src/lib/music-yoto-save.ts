import { musicTrackIcon } from "./music-pokemon";
import { statusErrorText } from "./yoto-error";
import { finishedPlaylistId, uploadForPlaylist } from "./yoto-send";
import { musicPlaylistUpload, type MusicPlaylistTrack } from "./youtube-playlist";

/** One My playlist song, with the video it plays. */
export type MusicSaveSong = { page: string; title: string; youtubeId: string };

export type MusicSaveStep = { done: number; total: number; text: string };

/** `yotoFetch` in the page. Tests pass their own. */
export type MusicSaveFetch = (path: string, init?: RequestInit) => Promise<Response>;

type SavedTrack = MusicPlaylistTrack & { dexId: number | null };

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

async function readOk(response: Response, fallback: string): Promise<unknown> {
  const payload = await readBody(response);
  if (!response.ok) throw new Error(statusErrorText(response.status, payload, fallback));
  return payload;
}

/** The finished MP3 that /api/music/mp3 uploaded for one song. */
export function readSavedTrack(payload: unknown, song: MusicSaveSong): SavedTrack {
  const tracks = (payload as { tracks?: unknown } | null)?.tracks;
  const row = (Array.isArray(tracks) ? tracks[0] : null) as {
    trackUrl?: unknown;
    duration?: unknown;
    fileSize?: unknown;
    channels?: unknown;
    youtubeId?: unknown;
    dexId?: unknown;
  } | null;
  const trackUrl = typeof row?.trackUrl === "string" ? row.trackUrl : "";
  if (!trackUrl.startsWith("yoto:#")) throw new Error(`${song.title} did not reach Yoto as an MP3.`);
  return {
    title: song.title,
    youtubeId: typeof row?.youtubeId === "string" ? row.youtubeId : song.youtubeId,
    trackUrl,
    duration: typeof row?.duration === "number" ? row.duration : 0,
    fileSize: typeof row?.fileSize === "number" ? row.fileSize : 0,
    format: "mp3",
    channels: row?.channels === "stereo" ? "stereo" : "mono",
    dexId: typeof row?.dexId === "number" && Number.isInteger(row.dexId) && row.dexId > 0 ? row.dexId : null,
  };
}

/** Upload one 16×16 pixel per Pokémon. A picture that fails keeps the music icon. */
async function uploadPictures(
  dexIds: readonly number[],
  fetcher: MusicSaveFetch,
  signal?: AbortSignal,
): Promise<Record<number, string>> {
  const media: Record<number, string> = {};
  for (const id of new Set(dexIds)) {
    signal?.throwIfAborted();
    try {
      const response = await fetcher(`/api/yoto/icon?id=${id}`, { method: "POST", signal });
      const payload = await readBody(response);
      const mediaId = (payload as { mediaId?: unknown } | null)?.mediaId;
      if (response.ok && typeof mediaId === "string" && mediaId) media[id] = mediaId;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return media;
}

/**
 * Save every song as an MP3, upload it to Yoto, then create one new playlist.
 * The server converts and uploads each song; this only runs the steps in order.
 */
export async function saveMusicPlaylistToYoto(input: {
  title: string;
  songs: readonly MusicSaveSong[];
  fetcher: MusicSaveFetch;
  signal?: AbortSignal;
  onStep?: (step: MusicSaveStep) => void;
}): Promise<{ cardId: string; title: string }> {
  const { songs, fetcher, signal } = input;
  if (songs.length === 0) throw new Error("Add a song before saving this playlist.");
  const total = songs.length;
  const tracks: SavedTrack[] = [];
  for (const [index, song] of songs.entries()) {
    signal?.throwIfAborted();
    input.onStep?.({ done: index, total, text: `Saving ${song.title} as an MP3 (${index + 1} of ${total})…` });
    const response = await fetcher("/api/music/mp3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: song.page, youtubeId: song.youtubeId, upload: true }),
      signal,
    });
    tracks.push(readSavedTrack(await readOk(response, `${song.title} could not be saved as an MP3.`), song));
  }

  input.onStep?.({ done: total, total, text: "Adding the Pokémon pictures…" });
  const media = await uploadPictures(
    tracks.flatMap((track) => (track.dexId ? [track.dexId] : [])),
    fetcher,
    signal,
  );

  signal?.throwIfAborted();
  input.onStep?.({ done: total, total, text: "Saving the playlist to Yoto…" });
  const upload = uploadForPlaylist(
    musicPlaylistUpload(
      input.title,
      tracks.map(({ dexId, ...track }) => ({ ...track, icon: musicTrackIcon(dexId, media) })),
    ),
    undefined,
  );
  const response = await fetcher("/api/yoto/job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(upload),
    signal,
  });
  const job = (await readOk(response, "Yoto did not accept this playlist.")) as {
    status?: string;
    result?: { cardId?: string; title?: string };
  } | null;
  const cardId = finishedPlaylistId({ status: job?.status, cardId: job?.result?.cardId, create: true });
  if (!cardId) throw new Error("Yoto did not return the new playlist.");
  return { cardId, title: upload.content.title ?? input.title };
}
