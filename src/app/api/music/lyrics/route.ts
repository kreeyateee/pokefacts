import rawIndex from "@/data/music-index.json";
import { readMusicIndex } from "@/lib/music-index";
import { loadSongLyrics } from "@/lib/song-lyrics";
import { jsonError } from "@/lib/yoto-proxy";

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
    const lyrics = await loadSongLyrics(page);
    return Response.json({ title: song.title, lyrics });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The lyrics could not be loaded.";
    return jsonError(message, 422);
  }
}
