import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { byteRange } from "@/lib/radio/byte-range";
import { isEpisodeDate } from "@/lib/radio/radio-feed";
import { episodeFile } from "@/lib/radio/radio-store";

/** One episode's MP3. Podcast apps ask for parts of it (Range) to skip and resume. */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const date = file.replace(/\.mp3$/, "");
  if (!file.endsWith(".mp3") || !isEpisodeDate(date)) return new Response("Not found", { status: 404 });
  const path = episodeFile(date, "mp3");
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=604800, immutable",
  });
  const range = byteRange(request.headers.get("range"), size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  const body = request.method === "HEAD" ? null : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream);
  return new Response(body, { status: range ? 206 : 200, headers });
}

export { GET as HEAD };
