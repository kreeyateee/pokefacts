import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BiologyBlock } from "@/lib/catalogue-types";
import { assertCryFirst, inputContainer, mergeCryFirst } from "@/lib/cry-audio";
import { synthesizePiper, type PiperSynthOptions } from "@/lib/piper";
import { chosenVoice, isPiperVoice } from "@/lib/piper-voice";
import { clampMix, type MixSettings } from "@/lib/playback-settings";
import { pronounce } from "@/lib/pronounce";
import { capProse, leadParagraphs, spokenWiki } from "@/lib/spoken-wiki";
import { reconnectMessage, yotoErrorText } from "@/lib/yoto-error";
import { CONNECT_FOR_VOICE, NATIONAL_DEX_TOTAL } from "@/lib/fact-build";
import {
  ensureCry,
  readCachedMergedMp3,
  saveCachedMergedMp3,
  speechCacheFile,
} from "@/lib/yoto-fact-audio";

export { CONNECT_FOR_VOICE, NATIONAL_DEX_TOTAL };

export type LocalFactStatus = "cached" | "built";

export type LocalFactInput = {
  dexId: number;
  name: string;
  /** Spoken fact. The same script a Facts playlist sends. */
  text: string;
  title?: string;
  voiceId?: string;
  token?: string;
} & Partial<MixSettings>;

export type LocalFactOptions = {
  speech?: string;
  rendered?: string;
  cries?: string;
  merge?: (cry: Buffer, speech: Buffer) => Promise<Buffer>;
  piper?: PiperSynthOptions;
  loadCry?: (id: number) => Promise<Buffer>;
  /** Labs speech. The default uses the Yoto login and does not leave a content card. */
  speak?: (text: string, voiceId: string, token: string, title: string) => Promise<Buffer>;
  fetchImpl?: typeof fetch;
};

/** A name on its own, or the short Pokédex blurb, is not a finished Biology fact. */
export function isUnfinishedFactScript(text: string): boolean {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return true;
  if (/It is number \d+\b/.test(clean) && /It is the .+ Pokémon\./i.test(clean)) return true;
  const words = clean.replace(/[.!?]+$/g, "").split(/\s+/).filter(Boolean);
  return words.length <= 5 && clean.length < 48;
}

/**
 * Name, then the first two Biology paragraphs, with the same respelling as a Facts track.
 * Credit sentences stay on the page. The recording does not say Bulbapedia.
 * A missing description is an error, so it is not cached as done.
 */
export function localFactScript(name: string, blocks: BiologyBlock[]): string {
  const title = name.replace(/\s+/g, " ").trim() || "This Pokémon";
  const prose = capProse(leadParagraphs(blocks));
  if (!prose) throw new Error(`${title} has no Biology description yet.`);
  const text = pronounce(spokenWiki(name, blocks));
  if (/bulbapedia/i.test(text)) throw new Error("The reading must not say Bulbapedia.");
  if (isUnfinishedFactScript(text)) throw new Error(`${title} has no Biology description yet.`);
  return text;
}

function playlistPost(url: string, method: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return method === "POST" && parsed.hostname === "api.yotoplay.com" && parsed.pathname === "/content";
}

/** Block the playlist create. Cry downloads and a Labs speech job are not that call. */
export function localBuildFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (playlistPost(url, method)) {
      throw new Error("Building facts on this PC does not create a Yoto card.");
    }
    return fetchImpl(input, init);
  };
}

async function readSpeech(file: string, piper: boolean): Promise<Buffer | undefined> {
  try {
    const bytes = await readFile(file);
    const kind = inputContainer(bytes);
    const min = kind === "wav" ? 44 : 128;
    if (!kind || bytes.length < min) return undefined;
    if (piper && kind !== "wav") return undefined;
    if (!piper && kind === "wav") return undefined;
    return bytes;
  } catch {
    return undefined;
  }
}

function messageOf(payload: unknown, fallback: string): string {
  const text = yotoErrorText(payload, fallback);
  return reconnectMessage(text) ?? text;
}

function jobFields(payload: unknown): { jobId?: string; status?: string; cardId?: string; error?: string } {
  if (!payload || typeof payload !== "object") return {};
  const row = payload as {
    jobId?: string;
    status?: string;
    error?: unknown;
    result?: { cardId?: string };
    job?: { jobId?: string; status?: string; error?: unknown; result?: { cardId?: string } };
  };
  const job = row.job ?? row;
  const error = typeof job.error === "string" ? job.error : undefined;
  return { jobId: job.jobId, status: job.status, cardId: job.result?.cardId, error };
}

async function yoto(
  token: string,
  url: string,
  init: RequestInit | undefined,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  return fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
}

async function discardScratch(token: string, cardId: string, fetchImpl: typeof fetch): Promise<void> {
  if (!/^[\w-]{4,80}$/.test(cardId)) return;
  try {
    await yoto(token, `https://api.yotoplay.com/content/${encodeURIComponent(cardId)}`, { method: "DELETE" }, fetchImpl);
  } catch {
    // The speech job is only a recording. The local mix does not keep it.
  }
}

/**
 * One Labs line, then the scratch card is deleted.
 * This never POSTs https://api.yotoplay.com/content, which is how a playlist card is created.
 */
export async function downloadLabsSpeech(
  token: string,
  text: string,
  title: string,
  voiceId: string,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  const created = await yoto(
    token,
    `https://labs.api.yotoplay.com/content/job?voiceId=${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Pokefacts scratch",
        content: {
          chapters: [
            {
              key: "line",
              title,
              tracks: [{ key: "line-1", title, trackUrl: text, type: "elevenlabs", voiceId }],
            },
          ],
        },
        metadata: { description: "Temporary line. Pokefacts deletes this." },
      }),
    },
    fetchImpl,
  );
  const started = jobFields(await created.json().catch(() => null));
  if (!created.ok || !started.jobId) {
    throw new Error(started.error || "Yoto did not start this line.");
  }
  let fields = started;
  for (let attempt = 0; attempt < 40 && !(fields.status === "completed" && fields.cardId); attempt += 1) {
    if (fields.status === "failed") throw new Error(fields.error || "Yoto could not record this line.");
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = await yoto(
      token,
      `https://labs.api.yotoplay.com/content/job/${encodeURIComponent(fields.jobId ?? "")}`,
      undefined,
      fetchImpl,
    );
    const next = jobFields(await status.json().catch(() => null));
    if (!status.ok) throw new Error(next.error || "Could not check this recording.");
    fields = { ...fields, ...next, jobId: next.jobId ?? fields.jobId };
  }
  if (!fields.cardId) throw new Error("This voice is still recording.");
  const cardId = fields.cardId;
  try {
    const playable = await yoto(
      token,
      `https://api.yotoplay.com/content/${encodeURIComponent(cardId)}?playable=true`,
      undefined,
      fetchImpl,
    );
    const body = (await playable.json().catch(() => null)) as {
      card?: { content?: { chapters?: Array<{ tracks?: Array<{ trackUrl?: string }> }> } };
    } | null;
    let source = "";
    for (const chapter of body?.card?.content?.chapters ?? []) {
      for (const track of chapter.tracks ?? []) {
        if (track.trackUrl && /^https?:\/\//.test(track.trackUrl)) source = track.trackUrl;
      }
    }
    if (!playable.ok || !source) throw new Error(messageOf(body, "This voice recording is not ready."));
    const audioResponse = await fetchImpl(source, { signal: AbortSignal.timeout(20_000) });
    if (!audioResponse.ok) throw new Error("This voice recording could not be downloaded.");
    const audio = Buffer.from(await audioResponse.arrayBuffer());
    if (!inputContainer(audio) || audio.length < 128) throw new Error("This voice recording was not playable audio.");
    return audio;
  } finally {
    await discardScratch(token, cardId, fetchImpl);
  }
}

/**
 * Cry, then the selected voice, written to the same mix cache a Facts playlist reuses.
 * A file already mixed for this script, voice, cry gain, voice gain, and pause is left as it is.
 * Nothing here creates a Yoto playlist card.
 */
export async function buildLocalFactTrack(
  input: LocalFactInput,
  options: LocalFactOptions = {},
): Promise<{ status: LocalFactStatus; dexId: number; name: string }> {
  const dexId = input.dexId;
  if (!Number.isInteger(dexId) || dexId < 1 || dexId > NATIONAL_DEX_TOTAL) {
    throw new Error(`That cry is not in the national Pokédex (${String(dexId)}).`);
  }
  const name = (input.name.replace(/\s+/g, " ").trim() || `Number ${dexId}`).slice(0, 40);
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text || text.length > 3000) throw new Error("That line is empty or longer than Yoto allows.");
  if (/bulbapedia/i.test(text)) throw new Error("The reading must not say Bulbapedia.");
  if (isUnfinishedFactScript(text)) throw new Error(`${name} has no Biology description yet.`);
  const voiceId = chosenVoice(input.voiceId);
  const mix = clampMix(input);
  const rendered = options.rendered ?? path.join(process.cwd(), "data", "rendered");
  const cached = await readCachedMergedMp3(text, voiceId, dexId, rendered, mix);
  if (cached) return { status: "cached", dexId, name };

  if (!isPiperVoice(voiceId) && !input.token) {
    throw new Error(CONNECT_FOR_VOICE);
  }

  const fetchImpl = localBuildFetch(options.fetchImpl ?? fetch);
  const speechRoot = options.speech ?? path.join(process.cwd(), "data", "speech");
  const speechFile = speechCacheFile(speechRoot, text, voiceId);
  let speech = speechFile ? await readSpeech(speechFile, isPiperVoice(voiceId)) : undefined;
  if (!speech) {
    if (isPiperVoice(voiceId)) {
      speech = await synthesizePiper(text, options.piper);
      if (inputContainer(speech) !== "wav" || speech.length < 44) throw new Error("Piper did not write a recording.");
    } else {
      const title = (input.title?.trim() || name).slice(0, 80);
      const speak =
        options.speak ??
        ((line: string, voice: string, token: string, spokenTitle: string) =>
          downloadLabsSpeech(token, line, spokenTitle, voice, fetchImpl));
      speech = await speak(text, voiceId, input.token ?? "", title);
      if (!inputContainer(speech) || speech.length < 128) throw new Error("This voice recording was not playable audio.");
    }
    await mkdir(speechRoot, { recursive: true });
    await writeFile(speechFile, speech);
  }

  const cry = options.loadCry
    ? await options.loadCry(dexId)
    : await ensureCry(dexId, fetchImpl, options.cries);
  const merged = options.merge ? await options.merge(cry, speech) : await mergeCryFirst(cry, speech, mix);
  if (merged === speech) throw new Error("The cry was not mixed in front of the reading.");
  if (!options.merge) await assertCryFirst(cry, speech, merged, mix.cryVolume);
  await saveCachedMergedMp3(text, voiceId, dexId, merged, rendered, mix);
  return { status: "built", dexId, name };
}
