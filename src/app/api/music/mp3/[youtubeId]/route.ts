import { clientAppPreflight, withClientAppCors } from "@/lib/client-app-cors";
import { jsonError } from "@/lib/yoto-proxy";
import { isYoutubeVideoId } from "@/lib/youtube-link";
import { readCachedMp3 } from "@/lib/youtube-mp3";

export function OPTIONS(request: Request) {
  return clientAppPreflight(request);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ youtubeId: string }> },
) {
  const { youtubeId } = await ctx.params;
  if (!isYoutubeVideoId(youtubeId)) return withClientAppCors(request, jsonError("That YouTube video id does not look right."));
  const cached = await readCachedMp3(youtubeId);
  if (!cached) return withClientAppCors(request, jsonError("That MP3 has not been downloaded yet.", 404));
  return withClientAppCors(
    request,
    new Response(new Uint8Array(cached.bytes), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(cached.bytes.length),
        "Cache-Control": "private, max-age=86400",
      },
    }),
  );
}
