import { audioContainer } from "@/lib/cry-audio";
import { ensureCry } from "@/lib/yoto-fact-audio";
import { looksLikeGateway, PUBLIC_LINK_TIMEOUT } from "@/lib/yoto-error";
import { jsonError } from "@/lib/yoto-proxy";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const dexId = Number(id);
  if (!Number.isInteger(dexId) || dexId < 1 || dexId > 1025) {
    return jsonError("That cry is not in the national Pokédex.");
  }
  try {
    const bytes = await ensureCry(dexId);
    const type = audioContainer(bytes) === "mp3" ? "audio/mpeg" : "audio/ogg";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "That cry could not be played.";
    const text = looksLikeGateway(0, message) ? PUBLIC_LINK_TIMEOUT : message;
    return jsonError(text, 422);
  }
}
