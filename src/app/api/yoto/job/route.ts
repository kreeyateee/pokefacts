import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";
import { bearerToken, forwardYoto, jsonError } from "@/lib/yoto-proxy";

type JobBody = {
  voiceId?: string;
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

  const url = `https://labs.api.yotoplay.com/content/job?voiceId=${encodeURIComponent(voiceId)}`;
  return forwardYoto(url, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body.content),
  });
}
