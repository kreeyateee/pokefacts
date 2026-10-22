import rawIndex from "@/data/music-index.json";
import { readMusicIndex, songForPage } from "@/lib/music-index";
import { localToolsAllowed } from "@/lib/youtube-mp3-site";
import { youtubeIdForSong } from "@/lib/youtube-search";
import { jsonError } from "@/lib/yoto-proxy";

export const maxDuration = 300;

export async function GET(request: Request) {
  const { index, error } = readMusicIndex(rawIndex);
  if (error) return jsonError(error);
  const song = songForPage(index, new URL(request.url).searchParams.get("page"));
  if (!song) return jsonError("That song is not in the music list.");
  try {
    const youtubeId = await youtubeIdForSong(song.page, song.title, song.youtubeId, {
      local: localToolsAllowed(request),
    });
    return Response.json({ page: song.page, title: song.title, youtubeId });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "That song could not be found on YouTube.";
    return jsonError(message, 422);
  }
}
