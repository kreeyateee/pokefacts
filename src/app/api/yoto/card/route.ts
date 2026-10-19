import { safeHttpStatus, validYotoCardId, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, forwardYoto, jsonError } from "@/lib/yoto-proxy";
import { playlistSummary } from "@/lib/yoto-send";

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before reading a playlist.", 401);
  const cardId = validYotoCardId(new URL(request.url).searchParams.get("id") ?? undefined);
  if (!cardId) return jsonError("That Yoto playlist id does not look right.");

  const upstream = await forwardYoto(`https://api.yotoplay.com/content/${encodeURIComponent(cardId)}`, token);
  const text = await upstream.text();
  if (!upstream.ok) {
    return Response.json(yotoUpstreamFailure(text), { status: safeHttpStatus(upstream.status) });
  }
  let parsed: unknown = null;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    parsed = null;
  }
  const summary = playlistSummary(parsed);
  if (!summary) return jsonError("Yoto did not return that playlist.", 422);
  return Response.json(summary);
}
