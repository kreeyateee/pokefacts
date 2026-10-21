import rawIndex from "@/data/music-index.json";
import { clientAppPreflight, withClientAppCors } from "@/lib/client-app-cors";
import { CLIENT_YOUTUBE_MESSAGE, youtubeStaysOnClient } from "@/lib/client-youtube";
import { readMusicIndex } from "@/lib/music-index";
import { youtubeIdForSong } from "@/lib/youtube-search";
import { jsonError } from "@/lib/yoto-proxy";

export const maxDuration = 300;

export function OPTIONS(request: Request) {
  return clientAppPreflight(request);
}

export async function GET(request: Request) {
  const response = await lookupSong(request);
  return withClientAppCors(request, response);
}

async function lookupSong(request: Request) {
  const page = new URL(request.url).searchParams.get("page")?.trim() ?? "";
  if (!page || page.length > 180 || /[#?&/\\]/.test(page)) {
    return jsonError("That song is not in the music list.");
  }
  const { index, error } = readMusicIndex(rawIndex);
  if (error) return jsonError(error);
  const song = index.songs.find((item) => item.page === page);
  if (!song) return jsonError("That song is not in the music list.");
  if (youtubeStaysOnClient()) return jsonError(CLIENT_YOUTUBE_MESSAGE, 422);
  try {
    const youtubeId = await youtubeIdForSong(page, song.title, song.youtubeId);
    return Response.json({ page, title: song.title, youtubeId });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "That song could not be found on YouTube.";
    return jsonError(message, 422);
  }
}
