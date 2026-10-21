import rawIndex from "@/data/music-index.json";
import { readMusicIndex } from "@/lib/music-index";
import { youtubeIdForSong } from "@/lib/youtube-search";
import { jsonError } from "@/lib/yoto-proxy";

export const maxDuration = 300;

export async function GET(request: Request) {
  const page = new URL(request.url).searchParams.get("page")?.trim() ?? "";
  if (!page || page.length > 180 || /[#?&/\\]/.test(page)) {
    return jsonError("That song is not in the music list.");
  }
  const { index, error } = readMusicIndex(rawIndex);
  if (error) return jsonError(error);
  const song = index.songs.find((item) => item.page === page);
  if (!song) return jsonError("That song is not in the music list.");
  try {
    const youtubeId = await youtubeIdForSong(page, song.title, song.youtubeId);
    return Response.json({ page, title: song.title, youtubeId });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "That song could not be found on YouTube.";
    return jsonError(message, 422);
  }
}
