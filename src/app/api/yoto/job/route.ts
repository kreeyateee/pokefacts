import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";
import { safeHttpStatus, validYotoCardId, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, forwardYoto, jsonError } from "@/lib/yoto-proxy";

type JobBody = {
  voiceId?: string;
  /** Bulk Pokefacts sends this so a saved card id cannot turn the job into a replace. */
  create?: boolean;
  content?: {
    title?: string;
    cardId?: string;
    content?: { chapters?: unknown[] };
    metadata?: { title?: string; description?: string };
  };
};

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before cutting a card.", 401);

  let body: JobBody;
  try {
    body = (await request.json()) as JobBody;
  } catch {
    return jsonError("The card payload was not valid JSON.");
  }

  const voiceId = body.voiceId?.trim() ?? "";
  if (!/^[A-Za-z0-9]{10,40}$/.test(voiceId)) {
    return jsonError("Pick one of the Champdex voices.");
  }

  const chapters = body.content?.content?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return jsonError("Add at least one Pokémon before cutting a card.");
  }

  let trackCount = 0;
  let audioCount = 0;
  let speechCount = 0;
  for (const chapter of chapters) {
    if (!chapter || typeof chapter !== "object") {
      return jsonError("A chapter in this card is malformed.");
    }
    const tracks = (chapter as { tracks?: unknown[] }).tracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return jsonError("Every chapter needs a spoken briefing.");
    }
    trackCount += tracks.length;
    for (const track of tracks) {
      if (!track || typeof track !== "object") {
        return jsonError("A track in this card is malformed.");
      }
      const spoken = track as { type?: string; trackUrl?: string };
      if (spoken.type === "audio") {
        audioCount += 1;
        if (!spoken.trackUrl?.startsWith("yoto:#")) {
          return jsonError("A track is missing its finished recording.");
        }
        continue;
      }
      speechCount += 1;
      if (spoken.type !== "elevenlabs") {
        return jsonError("Champdex cards are spoken with Yoto text to speech.");
      }
      if (!spoken.trackUrl || spoken.trackUrl.length > 3000) {
        return jsonError("A briefing is empty or longer than Yoto allows.");
      }
    }
  }
  if (trackCount > YOTO_TRACK_LIMIT) {
    return jsonError(
      `A Yoto Make Your Own playlist holds ${YOTO_TRACK_LIMIT} tracks. Send the next card for the rest.`,
    );
  }
  if (audioCount > 0 && speechCount > 0) {
    return jsonError("Finished audio and spoken text cannot share one card.");
  }

  const content = body.content ? { ...body.content } : undefined;
  if (body.create === true && content) delete content.cardId;

  if (audioCount > 0) {
    const upstream = await forwardYoto("https://api.yotoplay.com/content", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
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
    const row = parsed && typeof parsed === "object" ? (parsed as { cardId?: string; card?: { cardId?: string } }) : {};
    const cardId = validYotoCardId(row.card?.cardId) ?? validYotoCardId(row.cardId);
    if (!cardId) return jsonError("Yoto stored the audio but did not return the playlist.", 422);
    return Response.json({
      status: "completed",
      result: { cardId, title: content?.title },
    });
  }

  const url = `https://labs.api.yotoplay.com/content/job?voiceId=${encodeURIComponent(voiceId)}`;
  const upstream = await forwardYoto(url, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
  if (upstream.ok) return upstream;
  const text = await upstream.text();
  return Response.json(yotoUpstreamFailure(text), { status: safeHttpStatus(upstream.status) });
}
