import { jsonError } from "@/lib/yoto-proxy";
import { isYoutubeVideoId } from "@/lib/youtube-link";
import { readCachedMp3 } from "@/lib/youtube-mp3";
import { LOCAL_TOOLS_DISABLED_MESSAGE, localToolsAllowed } from "@/lib/youtube-mp3-site";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ youtubeId: string }> },
) {
  if (!localToolsAllowed(request)) return jsonError(LOCAL_TOOLS_DISABLED_MESSAGE, 403);

  const { youtubeId } = await ctx.params;
  if (!isYoutubeVideoId(youtubeId)) return jsonError("That YouTube video id does not look right.");
  const cached = await readCachedMp3(youtubeId);
  if (!cached) return jsonError("That MP3 has not been downloaded yet.", 404);
  return new Response(new Uint8Array(cached.bytes), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(cached.bytes.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
