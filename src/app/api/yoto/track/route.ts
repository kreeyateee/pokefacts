import { prepareFactTrack } from "@/lib/yoto-fact-audio";
import { looksLikeGateway, PUBLIC_LINK_TIMEOUT } from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before recording a track.", 401);

  let body: {
    text?: string;
    title?: string;
    dexId?: number;
    name?: string;
    speechJobId?: string;
    speechCardId?: string;
    uploadId?: string;
    discardCardId?: string;
    discardCardIds?: string[];
    sweepScratch?: boolean;
    voiceId?: string;
    /** Adventure lines in several voices, with sounds. Checked by prepareFactTrack. */
    parts?: unknown;
    speechPart?: string;
    bed?: unknown;
    cryVolume?: number;
    voiceVolume?: number;
    pauseSeconds?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("The track request was not valid JSON.");
  }

  try {
    const result = await prepareFactTrack(token, body);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "This track did not record.";
    const text = looksLikeGateway(0, message) ? PUBLIC_LINK_TIMEOUT : message;
    return jsonError(text, 422);
  }
}
