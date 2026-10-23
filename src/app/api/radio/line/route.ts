import { readdir } from "node:fs/promises";
import path from "node:path";

import { looksLikeGateway, PUBLIC_LINK_TIMEOUT } from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { isRadioLineId, RADIO_LINE_IDS, RADIO_LINES } from "@/lib/radio/radio-lines";
import { hostLineFile } from "@/lib/radio/radio-store";
import { recordSavedLine } from "@/lib/yoto-fact-audio";
import { YOTO_VOICES } from "@/lib/yoto-icons";

const SPEECH_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "speech");

/** Which host lines are saved in which Yoto voice, for the recorder on /radio#record. */
export async function GET() {
  const saved = new Set(await readdir(SPEECH_ROOT).catch(() => [] as string[]));
  const voices = YOTO_VOICES.map((voice) => ({
    id: voice.id,
    name: voice.name,
    saved: RADIO_LINE_IDS.filter((id) => saved.has(hostLineFile(id, voice.id))),
  }));
  return Response.json({ lines: RADIO_LINE_IDS, voices }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Records one of the radio host's lines in a Yoto voice with the caller's own Yoto login, one step per call.
 * Only the fixed lines in radio-lines.ts can be recorded, so nothing else can reach the radio.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before recording a radio line.", 401);
  let body: { line?: unknown; voiceId?: unknown; speechJobId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("The request was not valid JSON.");
  }
  if (!isRadioLineId(body.line)) return jsonError("That is not one of the radio's lines.");
  const voiceId = typeof body.voiceId === "string" ? body.voiceId : "";
  if (!YOTO_VOICES.some((voice) => voice.id === voiceId)) return jsonError("That is not a Yoto voice.");
  try {
    const step = await recordSavedLine(token, {
      text: RADIO_LINES[body.line],
      voiceId,
      speechJobId: typeof body.speechJobId === "string" ? body.speechJobId : undefined,
    });
    return Response.json(step);
  } catch (error) {
    const message = error instanceof Error ? error.message : "This line did not record.";
    return jsonError(looksLikeGateway(0, message) ? PUBLIC_LINK_TIMEOUT : message, 422);
  }
}
