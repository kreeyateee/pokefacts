import { bulbapediaArticleUrl, loadBiology } from "@/lib/bulbapedia";
import { getCatalogueEntry } from "@/lib/catalogue-db";
import { spokenWiki } from "@/lib/spoken-wiki";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "That number is not in the catalogue." }, { status: 404 });
  }
  let name = "";
  try {
    const entry = getCatalogueEntry(id);
    if (!entry) {
      return Response.json({ error: "That Pokémon is not in the catalogue." }, { status: 404 });
    }
    name = entry.name;
    const biology = await loadBiology(entry.name, entry.id);
    return Response.json({ biology, speech: spokenWiki(entry.name, biology.blocks) });
  } catch {
    return Response.json({
      biology: {
        status: "unavailable",
        url: name ? bulbapediaArticleUrl(name) : "",
        blocks: [],
      },
      speech: name ? spokenWiki(name, []) : "",
    });
  }
}
