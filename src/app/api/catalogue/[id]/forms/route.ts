import { listSpecialForms, getCatalogueEntry } from "@/lib/catalogue-db";
import { bulbapediaArticleUrl } from "@/lib/bulbapedia";
import { loadFormProse } from "@/lib/form-prose";
import { spokenWiki } from "@/lib/spoken-wiki";
import type { BiologyView } from "@/lib/catalogue-types";

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
  const forms = listSpecialForms(entry.id);
  const articles: Array<{
    formId: number;
    name: string;
    speech: string;
    article: BiologyView;
  }> = [];
  for (const form of forms) {
    try {
      const article = await loadFormProse(form);
      articles.push({
        formId: form.formId,
        name: form.formName,
        speech: spokenWiki(form.formName, article.blocks),
        article,
      });
    } catch {
      articles.push({
        formId: form.formId,
        name: form.formName,
        speech: spokenWiki(form.formName, []),
        article: {
          status: "unavailable",
          url: bulbapediaArticleUrl(form.speciesName),
          blocks: [],
        },
      });
    }
  }
  return Response.json({ forms: articles });
}
