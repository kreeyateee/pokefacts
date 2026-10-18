import { getDossier } from "@/lib/poke";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 1025) {
    return Response.json(
      { error: "That national number is outside the field guide." },
      { status: 404 },
    );
  }
  try {
    const dossier = await getDossier(id);
    return Response.json({ dossier });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The field guide could not open that entry.";
    return Response.json({ error: message }, { status: 502 });
  }
}
