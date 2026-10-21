import rawIndex from "@/data/music-index.json";
import { readMusicIndex } from "@/lib/music-index";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { finishFactUpload } from "@/lib/yoto-fact-audio";
import { downloadYoutubeMp3s, ensureYoutubeMp3, type ParsedMp3 } from "@/lib/youtube-mp3";
import { YOUTUBE_MP3_DISABLED_MESSAGE, YOUTUBE_MP3_PUBLIC } from "@/lib/youtube-mp3-site";
import { youtubeIdForSong } from "@/lib/youtube-search";
import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";

export const maxDuration = 900;

type TrackBody = {
  page?: string;
  url?: string;
  limit?: number;
  upload?: boolean;
};

function publicTrack(song: {
  page?: string;
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
    ...(song.trackUrl ? { trackUrl: song.trackUrl } : {}),
  };
}

export async function POST(request: Request) {
  if (!YOUTUBE_MP3_PUBLIC) return jsonError(YOUTUBE_MP3_DISABLED_MESSAGE, 410);

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
    let songs: Array<ParsedMp3 & { page?: string }>;
    if (page) {
      const { index, error } = readMusicIndex(rawIndex);
      if (error) return jsonError(error);
      const song = index.songs.find((item) => item.page === page);
      if (!song) return jsonError("That song is not in the music list.");
      const youtubeId = await youtubeIdForSong(song.page, song.title, song.youtubeId);
      if (!youtubeId) return jsonError("No YouTube video was found for this song.");
      const parsed = await ensureYoutubeMp3(youtubeId, song.title);
      songs = [{ ...parsed, page: song.page, title: song.title }];
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
