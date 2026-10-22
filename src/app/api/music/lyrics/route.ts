import rawIndex from "@/data/music-index.json";
import { readMusicIndex, songForPage } from "@/lib/music-index";
import { loadSongLyrics } from "@/lib/song-lyrics";
import { jsonError } from "@/lib/yoto-proxy";

export async function GET(request: Request) {
  const { index, error } = readMusicIndex(rawIndex);
  if (error) return jsonError(error);
  const song = songForPage(index, new URL(request.url).searchParams.get("page"));
  if (!song) return jsonError("That song is not in the music list.");
  try {
    const lyrics = await loadSongLyrics(song.page);
    return Response.json({ title: song.title, lyrics });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The lyrics could not be loaded.";
    return jsonError(message, 422);
  }
}
