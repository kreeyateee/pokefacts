import { getSpecialForm } from "@/lib/catalogue-db";
import { ensureArtwork } from "@/lib/artwork";

function artworkId(kind: string, raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  if (kind === "species") return id <= 1025 ? id : null;
  if (kind === "form") return getSpecialForm(id) ? id : null;
  return null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id: raw } = await ctx.params;
  const id = artworkId(kind, raw);
  if (!id) return new Response("That picture is not in the catalogue.", { status: 404 });
  try {
    const bytes = await ensureArtwork(id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("That picture could not be loaded.", { status: 404 });
  }
}
