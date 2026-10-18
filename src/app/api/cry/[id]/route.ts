import { ensureCry } from "@/lib/yoto-fact-audio";
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
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "audio/ogg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "That cry could not be played.";
    return jsonError(message, 502);
  }
}
