import rawIndex from "@/data/music-index.json";
import names from "@/data/species-names.json";
import { readMusicIndex } from "@/lib/music-index";
import { songPokemonId, type SpeciesName } from "@/lib/music-pokemon";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { finishFactUpload } from "@/lib/yoto-fact-audio";
import { isYoutubeVideoId } from "@/lib/youtube-link";
import { downloadYoutubeMp3s, ensureYoutubeMp3, type ParsedMp3 } from "@/lib/youtube-mp3";
import { LOCAL_TOOLS_DISABLED_MESSAGE, localToolsAllowed } from "@/lib/youtube-mp3-site";
import { youtubeIdForSong } from "@/lib/youtube-search";
import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";

export const maxDuration = 900;

type TrackBody = {
  page?: string;
  /** The video My playlist plays for this page. Without it the song is looked up. */
  youtubeId?: string;
  url?: string;
  limit?: number;
  upload?: boolean;
};

type SavedSong = ParsedMp3 & { page?: string; dexId?: number | null };

function publicTrack(song: {
  page?: string;
  dexId?: number | null;
  title: string;
  youtubeId: string;
  duration: number;
  fileSize: number;
  trackUrl?: string;
  channels?: string;
}) {
  return {
    page: song.page,
    title: song.title,
    youtubeId: song.youtubeId,
    duration: song.duration,
    fileSize: song.fileSize,
    format: "mp3" as const,
    channels: song.channels === "stereo" ? ("stereo" as const) : ("mono" as const),
    ...(song.dexId ? { dexId: song.dexId } : {}),
    ...(song.trackUrl ? { trackUrl: song.trackUrl } : {}),
  };
}

/** Whether this browser may use Save to Yoto. The answer is never cached. */
export function GET(request: Request) {
  return Response.json(
    { available: localToolsAllowed(request) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  if (!localToolsAllowed(request)) return jsonError(LOCAL_TOOLS_DISABLED_MESSAGE, 403);

  let body: TrackBody;
  try {
    body = (await request.json()) as TrackBody;
  } catch {
    return jsonError("The song request was not valid JSON.");
  }

  const upload = body.upload === true;
  const token = bearerToken(request);
  if (upload && !token) return jsonError("Connect Yoto before adding songs to a playlist.", 401);

  const page = body.page?.trim() ?? "";
  const url = body.url?.trim() ?? "";
  if (page && url) return jsonError("Send a song or a link, not both.");

  try {
    let songs: SavedSong[];
    if (page) {
      const { index, error } = readMusicIndex(rawIndex);
      if (error) return jsonError(error);
      const song = index.songs.find((item) => item.page === page);
      if (!song) return jsonError("That song is not in the music list.");
      const picked = body.youtubeId?.trim() ?? "";
      const youtubeId = isYoutubeVideoId(picked)
        ? picked
        : await youtubeIdForSong(song.page, song.title, song.youtubeId, { local: true });
      if (!youtubeId) return jsonError("No YouTube video was found for this song.");
      const parsed = await ensureYoutubeMp3(youtubeId, song.title);
      const dexId = songPokemonId(song.title, song.page, names as SpeciesName[]);
      songs = [{ ...parsed, page: song.page, title: song.title, dexId }];
    } else if (url) {
      const requested = Number(body.limit);
      const limit = Number.isFinite(requested) ? Math.min(YOTO_TRACK_LIMIT, Math.max(1, Math.floor(requested))) : YOTO_TRACK_LIMIT;
      songs = await downloadYoutubeMp3s(url, { limit });
    } else {
      return jsonError("Choose a song or paste a YouTube link.");
    }

    const tracks = [];
    for (const song of songs) {
      if (!upload || !token) {
        tracks.push(publicTrack(song));
        continue;
      }
      const uploaded = await finishFactUpload(token, song.bytes, song.title);
      tracks.push(
        publicTrack({
          ...song,
          trackUrl: uploaded.trackUrl,
          duration: uploaded.duration ?? song.duration,
          fileSize: uploaded.fileSize ?? song.fileSize,
          channels: uploaded.channels ?? "mono",
        }),
      );
    }
    return Response.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "That audio could not be saved as an MP3.";
    return jsonError(message, 422);
  }
}
