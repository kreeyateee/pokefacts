import { getNationalDex } from "@/lib/poke";

export async function GET() {
  try {
    const pokemon = await getNationalDex();
    return Response.json({ pokemon });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The field guide could not reach PokéAPI.";
    return Response.json({ error: message }, { status: 502 });
  }
}
