import { loadBiology } from "@/lib/bulbapedia";
import { getCatalogueEntry } from "@/lib/catalogue-db";
import {
  buildLocalFactTrack,
  CONNECT_FOR_VOICE,
  localFactScript,
  NATIONAL_DEX_TOTAL,
} from "@/lib/local-facts";
import { chosenVoice, isPiperVoice } from "@/lib/piper-voice";
import { clampMix } from "@/lib/playback-settings";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";

type LocalBody = {
  dexId?: number;
  /** Tests only. The Facts button always sends one dexId and means all 1,025. */
  limit?: number;
  voiceId?: string;
  cryVolume?: number;
  voiceVolume?: number;
  pauseSeconds?: number;
};

async function biologyFor(name: string, id: number) {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await loadBiology(name, id);
    } catch (error) {
      last = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error("Bulbapedia did not answer.");
}

async function buildOne(
  dexId: number,
  voiceId: string,
  token: string,
  mix: { cryVolume: number; voiceVolume: number; pauseSeconds: number },
) {
  const entry = getCatalogueEntry(dexId);
  if (!entry) throw new Error("That Pokémon is not in the catalogue.");
  const biology = await biologyFor(entry.name, entry.id);
  const text = localFactScript(entry.name, biology.blocks);
  return buildLocalFactTrack({
    dexId: entry.id,
    name: entry.name,
    title: entry.name,
    text,
    voiceId,
    token,
    ...mix,
  });
}

export async function POST(request: Request) {
  let body: LocalBody;
  try {
    body = (await request.json()) as LocalBody;
  } catch {
    return jsonError("The fact request was not valid JSON.");
  }

  const voiceId = chosenVoice(body.voiceId);
  const token = bearerToken(request) ?? "";
  if (!isPiperVoice(voiceId) && !token) return jsonError(CONNECT_FOR_VOICE, 401);

  const mix = clampMix(body);
  const dexId = body.dexId;
  try {
    if (dexId != null) {
      if (!Number.isInteger(dexId) || dexId < 1 || dexId > NATIONAL_DEX_TOTAL) {
        return jsonError("That number is not in the national Pokédex.", 404);
      }
      const result = await buildOne(dexId, voiceId, token, mix);
      return Response.json({ ...result, total: NATIONAL_DEX_TOTAL });
    }
    const limit = body.limit;
    if (limit == null) return jsonError("Choose a Pokémon to build.");
    if (!Number.isInteger(limit) || limit < 1 || limit > NATIONAL_DEX_TOTAL) {
      return jsonError("That build limit is not in the national Pokédex.");
    }
    const results = [];
    for (let id = 1; id <= limit; id += 1) {
      results.push(await buildOne(id, voiceId, token, mix));
    }
    return Response.json({ total: NATIONAL_DEX_TOTAL, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This fact was not built.";
    const status = message === CONNECT_FOR_VOICE ? 401 : 422;
    return jsonError(message, status);
  }
}
