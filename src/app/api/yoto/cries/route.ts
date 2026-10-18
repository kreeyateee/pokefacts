import { looksLikeGateway, PUBLIC_LINK_TIMEOUT } from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { attachCry } from "@/lib/yoto-fact-audio";

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before adding a cry.", 401);

  let body: { cardId?: string; chapterKey?: string; dexId?: number };
  try {
    body = (await request.json()) as { cardId?: string; chapterKey?: string; dexId?: number };
  } catch {
    return jsonError("The cry request was not valid JSON.");
  }

  const cardId = body.cardId?.trim() ?? "";
  const chapterKey = body.chapterKey?.trim() ?? "";
  const dexId = body.dexId;
  if (!/^[\w-]{4,80}$/.test(cardId)) return jsonError("That Yoto card id does not look right.");
  if (!/^[a-z0-9-]{1,80}$/.test(chapterKey)) return jsonError("That fact chapter does not look right.");
  if (typeof dexId !== "number" || !Number.isInteger(dexId) || dexId < 1 || dexId > 1025) {
    return jsonError("That cry is not in the national Pokédex.");
  }

  try {
    const result = await attachCry(token, { cardId, chapterKey, dexId });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The cry could not be added.";
    const text = looksLikeGateway(0, message) ? PUBLIC_LINK_TIMEOUT : message;
    return jsonError(text, 422);
  }
}
