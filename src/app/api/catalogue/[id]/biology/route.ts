import { bulbapediaArticleUrl, loadFactSpeech } from "@/lib/bulbapedia";
import { getCatalogueEntry } from "@/lib/catalogue-db";
import { spokenDexLine, WIKI_DEX_NOTE } from "@/lib/spoken-wiki";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "That number is not in the catalogue." }, { status: 404 });
  }
  const entry = getCatalogueEntry(id);
  if (!entry) {
    return Response.json({ error: "That Pokémon is not in the catalogue." }, { status: 404 });
  }
  try {
    const fact = await loadFactSpeech(entry.name, entry.id, entry.info);
    return Response.json({ biology: fact.biology, speech: fact.speech, notice: fact.notice });
  } catch {
    return Response.json({
      biology: {
        status: "unavailable",
        url: bulbapediaArticleUrl(entry.name),
        blocks: [],
      },
      speech: spokenDexLine(entry.name, entry.info),
      notice: entry.info.trim() ? WIKI_DEX_NOTE : "",
    });
  }
}
