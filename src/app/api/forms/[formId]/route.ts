import { getCatalogueEntry, getPlaylistForm } from "@/lib/catalogue-db";
import { bulbapediaArticleUrl } from "@/lib/bulbapedia";
import { loadFormSpeech } from "@/lib/form-prose";
import { spokenDexLine, WIKI_DEX_NOTE } from "@/lib/spoken-wiki";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ formId: string }> },
) {
  const { formId: raw } = await ctx.params;
  const formId = Number(raw);
  if (!Number.isInteger(formId) || formId < 1) {
    return Response.json({ error: "That form is not in the catalogue." }, { status: 404 });
  }
  const form = getPlaylistForm(formId);
  if (!form) {
    return Response.json({ error: "That form is not in a playlist." }, { status: 404 });
  }
  try {
    const { speech, article, notice } = await loadFormSpeech(form);
    return Response.json({
      formId: form.formId,
      speciesId: form.speciesId,
      name: form.formName,
      speech,
      article,
      notice,
    });
  } catch {
    const info = getCatalogueEntry(form.speciesId)?.info ?? "";
    return Response.json({
      formId: form.formId,
      speciesId: form.speciesId,
      name: form.formName,
      speech: spokenDexLine(form.formName, info),
      notice: info.trim() ? WIKI_DEX_NOTE : "",
      article: {
        status: "unavailable",
        url: bulbapediaArticleUrl(form.speciesName),
        blocks: [],
      },
    });
  }
}
