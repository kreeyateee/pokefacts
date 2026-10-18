import { getCatalogueEntry } from "@/lib/catalogue-db";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "That number is not in the catalogue." }, { status: 404 });
  }
  try {
    const entry = getCatalogueEntry(id);
    if (!entry) {
      return Response.json({ error: "That Pokémon is not in the catalogue." }, { status: 404 });
    }
    return Response.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The catalogue could not be opened.";
    return Response.json({ error: message }, { status: 500 });
  }
}
