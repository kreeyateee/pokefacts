import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";
import { isPiperVoice } from "@/lib/piper-voice";
import { safeHttpStatus, validYotoCardId, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, forwardYoto, jsonError } from "@/lib/yoto-proxy";
import { appendToPlaylist, contentCreateBody, trackEventProblem } from "@/lib/yoto-send";

type JobBody = {
  voiceId?: string;
  /** Bulk Pokefacts sends this so a saved card id cannot turn the job into a replace. */
  create?: boolean;
  /** Add these tracks onto an existing playlist. This is the one case cardId is sent. */
  append?: boolean;
  /** Put these tracks in place of everything on an existing playlist, keeping its card id. */
  replace?: boolean;
  content?: {
    title?: string;
    cardId?: string;
    /** An interactive card also carries playbackType, config, editSettings and track events. */
    content?: { chapters?: unknown[]; playbackType?: string };
    metadata?: { title?: string; description?: string; cover?: { imageL?: string } };
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
  const piper = isPiperVoice(voiceId);
  if (!piper && !/^[A-Za-z0-9]{10,40}$/.test(voiceId)) {
    return jsonError("Pick one of the Pokefacts voices.");
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
        return jsonError("Pokefacts cards are spoken with Yoto text to speech.");
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
  if (piper && speechCount > 0) {
    return jsonError("Piper records on this computer.");
  }
  if (body.content?.content?.playbackType === "interactive") {
    if (body.append === true) {
      return jsonError("An adventure card is sent as a new playlist. It cannot be added onto another one.");
    }
    if (speechCount > 0) {
      return jsonError("An adventure card is sent once every track is recorded.");
    }
  }
  const eventProblem = trackEventProblem(body.content?.content);
  if (eventProblem) return jsonError(eventProblem);

  const content = body.content ? { ...body.content } : undefined;
  const appendId =
    body.append === true && body.create !== true ? validYotoCardId(content?.cardId) : undefined;
  const replaceId =
    body.replace === true && body.append !== true && body.create !== true ? validYotoCardId(content?.cardId) : undefined;
  if (body.create === true && content) delete content.cardId;

  if (audioCount > 0 && appendId && content) {
    return updateExistingPlaylist(token, appendId, content);
  }

  if (audioCount > 0) {
    let playlist: ReturnType<typeof contentCreateBody> | undefined;
    try {
      playlist = content ? contentCreateBody(content) : undefined;
      // Yoto updates the playlist with this id in place, so a card linked to it keeps working.
      if (playlist && replaceId) playlist.cardId = replaceId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Yoto did not accept this card.";
      return jsonError(message);
    }
    const upstream = await forwardYoto(
      "https://api.yotoplay.com/content",
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(playlist),
      },
      120_000,
    );
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
    const cardId = validYotoCardId(row.card?.cardId) ?? validYotoCardId(row.cardId) ?? replaceId;
    if (!cardId) {
      const yotoBody = text.trim().slice(0, 500);
      const message = yotoBody
        ? `Yoto did not return the playlist. ${yotoBody}`
        : "Yoto did not return the playlist.";
      return jsonError(message, 422);
    }
    return Response.json({
      status: "completed",
      result: { cardId, title: playlist?.title },
    });
  }

async function updateExistingPlaylist(
  token: string,
  cardId: string,
  content: NonNullable<JobBody["content"]>,
): Promise<Response> {
  const loaded = await forwardYoto(
    `https://api.yotoplay.com/content/${encodeURIComponent(cardId)}`,
    token,
    undefined,
    60_000,
  );
  const loadedText = await loaded.text();
  if (!loaded.ok) {
    return Response.json(yotoUpstreamFailure(loadedText), { status: safeHttpStatus(loaded.status) });
  }
  let parsed: unknown = null;
  try {
    parsed = loadedText ? (JSON.parse(loadedText) as unknown) : null;
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") {
    const row = parsed as { card?: { cardId?: string }; cardId?: string };
    if (row.card && typeof row.card === "object" && !row.card.cardId) row.card.cardId = cardId;
    if (!row.card && !row.cardId) row.cardId = cardId;
  }
  let playlist: ReturnType<typeof appendToPlaylist>;
  try {
    playlist = appendToPlaylist(parsed as NonNullable<JobBody["content"]>, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Yoto did not accept this card.";
    return jsonError(message);
  }
  const upstream = await forwardYoto(
    "https://api.yotoplay.com/content",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(playlist),
    },
    120_000,
  );
  const text = await upstream.text();
  if (!upstream.ok) {
    return Response.json(yotoUpstreamFailure(text), { status: safeHttpStatus(upstream.status) });
  }
  let returned: unknown = null;
  try {
    returned = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    returned = null;
  }
  const row =
    returned && typeof returned === "object" ? (returned as { cardId?: string; card?: { cardId?: string } }) : {};
  const confirmed = validYotoCardId(row.card?.cardId) ?? validYotoCardId(row.cardId) ?? cardId;
  return Response.json({
    status: "completed",
    updated: true,
    result: { cardId: confirmed, title: playlist.title },
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
