import { listBaseStats, listMonSheets } from "@/lib/catalogue-db";
import { COMPANION_GAMES } from "@/lib/game-companion";
import { companionCards } from "@/lib/kid-cards";

/** GET returns { cards }: one game's Game Companion playlists, built when a parent picks that game. */
export async function GET(_request: Request, ctx: { params: Promise<{ game: string }> }) {
  const { game: id } = await ctx.params;
  const game = COMPANION_GAMES.find((item) => item.id === id);
  if (!game) return Response.json({ error: "That game isn't on the list." }, { status: 404 });
  return Response.json({ cards: companionCards(game, listMonSheets(), listBaseStats()) });
}
