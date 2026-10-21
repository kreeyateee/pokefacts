import { readFile } from "node:fs/promises";
import path from "node:path";

import { getAlternateForm } from "@/lib/catalogue-db";
import { ensureArtwork, isPng } from "@/lib/artwork";
import { ensureFormPixel } from "@/lib/form-pixel";

function artworkId(kind: string, raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  if (kind === "species") return id <= 1025 ? id : null;
  if (kind === "form") return getAlternateForm(id) ? id : null;
  if (kind === "pixel") {
    if (id <= 1025) return id;
    return getAlternateForm(id) ? id : null;
  }
  return null;
}

function png(bytes: Buffer) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id: raw } = await ctx.params;
  const id = artworkId(kind, raw);
  if (!id) return new Response("That picture is not in the catalogue.", { status: 404 });
  try {
    if (kind === "pixel") {
      const shadow = new URL(request.url).searchParams.get("shadow") === "1";
      if (id <= 1025) {
        const name = shadow ? `${id}-shadow.png` : `${id}.png`;
        const bytes = await readFile(path.join(process.cwd(), "public", "pixels", name));
        if (!isPng(bytes)) throw new Error("not png");
        return png(bytes);
      }
      if (shadow) return new Response("That picture is not a national Pokédex icon.", { status: 404 });
      const bytes = await ensureFormPixel(id);
      if (!isPng(bytes)) throw new Error("not png");
      return png(bytes);
    }
    const bytes = await ensureArtwork(id);
    return png(bytes);
  } catch {
    return new Response("That picture could not be loaded.", { status: 404 });
  }
}
