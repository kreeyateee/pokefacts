import { inputContainer } from "@/lib/cry-audio";
import { isPiperVoice } from "@/lib/piper-voice";
import { looksLikeGateway, PUBLIC_LINK_TIMEOUT, reconnectMessage } from "@/lib/yoto-error";
import { prepareDemoAudio } from "@/lib/yoto-demo";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { spokenForDemo } from "@/lib/voice-choice";

export async function POST(request: Request) {
  let body: { text?: string; title?: string; voiceId?: string; dexId?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("The demo request was not valid JSON.");
  }

  const token = bearerToken(request);
  if (!token && !isPiperVoice(body.voiceId)) return jsonError("Connect Yoto before hearing an entry.", 401);

  try {
    const result = await prepareDemoAudio(token ?? "", {
      text: spokenForDemo(body.text ?? ""),
      title: body.title,
      voiceId: body.voiceId,
      dexId: body.dexId,
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
