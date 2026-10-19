import { getSpecialForm } from "@/lib/catalogue-db";
import { bulbapediaArticleUrl } from "@/lib/bulbapedia";
import { loadFormProse } from "@/lib/form-prose";
import { spokenWiki } from "@/lib/spoken-wiki";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ formId: string }> },
) {
  const { formId: raw } = await ctx.params;
  const formId = Number(raw);
  if (!Number.isInteger(formId) || formId < 1) {
    return Response.json({ error: "That form is not in the catalogue." }, { status: 404 });
  }
  const form = getSpecialForm(formId);
  if (!form) {
    return Response.json({ error: "That form is not a Mega Evolution or Gigantamax form." }, { status: 404 });
  }
  try {
    const article = await loadFormProse(form);
    return Response.json({
      formId: form.formId,
      speciesId: form.speciesId,
      name: form.formName,
      speech: spokenWiki(form.formName, article.blocks),
      article,
    });
  } catch {
    return Response.json({
      formId: form.formId,
      speciesId: form.speciesId,
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
