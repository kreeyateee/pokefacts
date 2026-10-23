import { inputContainer } from "@/lib/cry-audio";
import { isPiperVoice } from "@/lib/piper-voice";
import { readTrackParts } from "@/lib/story/story-voices";
import { looksLikeGateway, PUBLIC_LINK_TIMEOUT, reconnectMessage } from "@/lib/yoto-error";
import { prepareDemoAudio } from "@/lib/yoto-demo";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { spokenForDemo } from "@/lib/voice-choice";

export async function POST(request: Request) {
  let body: {
    text?: string;
    title?: string;
    voiceId?: string;
    dexId?: number;
    cryVolume?: number;
    voiceVolume?: number;
    pauseSeconds?: number;
    parts?: unknown;
    bed?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("The demo request was not valid JSON.");
  }

  const token = bearerToken(request);
  // An adventure line plays without Yoto only when every voice in it is Piper.
  const parts = body.parts === undefined ? null : readTrackParts(body.parts);
  const piperOnly = parts
    ? parts.every((part) => !("voiceId" in part) || isPiperVoice(part.voiceId))
    : isPiperVoice(body.voiceId);
  if (!token && !piperOnly) return jsonError("Connect Yoto before hearing an entry.", 401);

  try {
    const result = await prepareDemoAudio(token ?? "", {
      text: spokenForDemo(body.text ?? ""),
      title: body.title,
      voiceId: body.voiceId,
      dexId: body.dexId,
      cryVolume: body.cryVolume,
      voiceVolume: body.voiceVolume,
      pauseSeconds: body.pauseSeconds,
      ...(body.parts !== undefined ? { parts: body.parts } : {}),
      ...(body.bed !== undefined ? { bed: body.bed } : {}),
    });
    const kind = inputContainer(result.audio);
    const contentType = kind === "ogg" ? "audio/ogg" : kind === "wav" ? "audio/wav" : "audio/mpeg";
    return new Response(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Pokefacts-Cry": result.cryFirst ? "1" : "0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record this entry.";
    const text = looksLikeGateway(0, message) ? PUBLIC_LINK_TIMEOUT : message;
    return jsonError(reconnectMessage(text) ?? text, 422);
  }
}
