import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertCryFirst,
  audioContainer,
  cryUrl,
  describeClip,
  encodeYotoMp3,
  inputContainer,
  mergeCryFirst,
} from "@/lib/cry-audio";
import { clampMix, isDefaultMix, mixCacheToken, type MixSettings } from "@/lib/playback-settings";
import { synthesizePiper, type PiperSynthOptions } from "@/lib/piper";
import { chosenVoice, isPiperVoice, piperCacheToken } from "@/lib/piper-voice";
import { RECONNECT_YOTO, reconnectMessage, yotoErrorText } from "@/lib/yoto-error";

type FactCryRequest = {
  cardId: string;
  chapterKey: string;
  dexId: number;
  cryVolume?: number;
  voiceVolume?: number;
  pauseSeconds?: number;
};

type Track = {
  key?: string;
  title?: string;
  trackUrl?: string;
  type?: string;
  voiceId?: string;
  overlayLabel?: string;
  display?: { icon16x16?: string };
  format?: string;
  duration?: number;
  fileSize?: number;
  channels?: string | number;
};

type Chapter = {
  key?: string;
  title?: string;
  tracks?: Track[];
  display?: { icon16x16?: string };
};

type CardPayload = {
  cardId?: string;
  title?: string;
  content?: { chapters?: Chapter[] };
  metadata?: { title?: string; description?: string };
};

const CRY_CACHE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "cries");
const cryMemory = new Map<string, Buffer>();

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function cardOf(payload: unknown): CardPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as { card?: CardPayload };
  return row.card ?? null;
}

function messageOf(payload: unknown, fallback: string): string {
  const text = yotoErrorText(payload, fallback);
  return reconnectMessage(text) ?? text;
}

/** Yoto accepted the upload, then refused to transcode it. Keep their reason when they sent one. */
function transcodeFailure(body: unknown, label: string, kind: "track" | "cry"): string {
  const lead =
    kind === "cry"
      ? `Yoto could not transcode the cry for number ${label}.`
      : `Yoto could not transcode track ${label}.`;
  const progress = (body as { transcode?: { progress?: { error?: unknown; message?: unknown } } } | null)?.transcode
    ?.progress;
  const extra = [progress?.error, progress?.message]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .join(" ");
  if (!extra) return lead;
  return `${lead} ${extra.length > 140 ? `${extra.slice(0, 137)}...` : extra}`;
}

function rateLimitWait(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(20_000, retryAfter * 1000);
  return Math.min(8_000, 500 * 2 ** attempt);
}

async function yoto(
  token: string,
  url: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 60_000,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  let last: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    last = response;
    if (response.status !== 429 || attempt === 3) return response;
    await new Promise((resolve) => setTimeout(resolve, rateLimitWait(response, attempt)));
  }
  return last as Response;
}

export async function ensureCry(
  id: number,
  fetchImpl: typeof fetch = fetch,
  cacheDir: string = CRY_CACHE,
): Promise<Buffer> {
  if (!Number.isInteger(id) || id < 1 || id > 1025) {
    throw new Error(`That cry is not in the national Pokédex (${id}).`);
  }
  const memoryKey = `${cacheDir}\n${id}`;
  const remembered = cryMemory.get(memoryKey);
  if (remembered) return remembered;
  await mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `${id}.ogg`);
  try {
    const cached = await readFile(file);
    if (audioContainer(cached)) {
      const info = await describeClip(cached, `cry.${audioContainer(cached)}`);
      if (info.audioStreams >= 1 && Number.isFinite(info.duration) && info.duration >= 0.05) {
        cryMemory.set(memoryKey, cached);
        return cached;
      }
    }
  } catch {
    // Missing cache is downloaded below. A saved error page is replaced.
  }
  await rm(file, { force: true });
  const response = await fetchImpl(cryUrl(id), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`The cry for number ${id} could not be downloaded (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!audioContainer(bytes)) throw new Error(`The cry for number ${id} was not an Ogg or MP3 file.`);
  let info;
  try {
    info = await describeClip(bytes, `cry.${audioContainer(bytes)}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ffprobe could not read the cry.";
    throw new Error(reason);
  }
  if (info.audioStreams < 1 || !Number.isFinite(info.duration) || info.duration < 0.05) {
    const seconds = Number.isFinite(info.duration) ? `${info.duration.toFixed(2)}s` : "unknown length";
    throw new Error(
      `ffprobe: the cry is ${info.codec || "unreadable"}, ${info.sampleRate || 0} Hz, ${seconds}.`,
    );
  }
  await writeFile(file, bytes);
  cryMemory.set(memoryKey, bytes);
  return bytes;
}

async function loadCard(token: string, cardId: string, playable: boolean, fetchImpl: typeof fetch): Promise<CardPayload> {
  const url = new URL(`https://api.yotoplay.com/content/${encodeURIComponent(cardId)}`);
  if (playable) url.searchParams.set("playable", "true");
  const response = await yoto(token, url.toString(), undefined, fetchImpl);
  const payload = await readJson(response);
  const card = cardOf(payload);
  if (!response.ok || !card?.content?.chapters) {
    throw new Error(messageOf(payload, "Yoto did not return the recorded card."));
  }
  return card;
}

type UploadedAudio = {
  trackUrl: string;
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string;
};

async function uploadMerged(
  token: string,
  dexId: number,
  audio: Buffer,
  fetchImpl: typeof fetch,
  maxPolls = 45,
): Promise<UploadedAudio> {
  const hash = sha256(audio);
  const uploadUrl = new URL("https://api.yotoplay.com/media/transcode/audio/uploadUrl");
  uploadUrl.searchParams.set("sha256", hash);
  uploadUrl.searchParams.set("filename", `pokefacts-${dexId}-cry.mp3`);
  const created = await yoto(token, uploadUrl.toString(), undefined, fetchImpl);
  const createdBody = (await readJson(created)) as {
    upload?: { uploadId?: string; uploadUrl?: string | null };
  } | null;
  const uploadId = createdBody?.upload?.uploadId;
  if (!created.ok || !uploadId) {
    throw new Error(messageOf(createdBody, "Yoto did not open an upload for the cry."));
  }
  if (createdBody?.upload?.uploadUrl) {
    const put = await fetchImpl(createdBody.upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(60_000),
    });
    if (!put.ok) throw new Error("Yoto did not store the cry and the reading.");
  }
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400));
    const statusUrl = `https://api.yotoplay.com/media/upload/${encodeURIComponent(uploadId)}/transcoded?loudnorm=false`;
    const status = await yoto(token, statusUrl, undefined, fetchImpl);
    const body = (await readJson(status)) as {
      transcode?: {
        transcodedSha256?: string;
        progress?: { phase?: string };
        transcodedInfo?: { duration?: number; fileSize?: number; format?: string; channels?: string | number };
      };
    } | null;
    const transcode = body?.transcode;
    const phase = transcode?.progress?.phase;
    if (transcode?.transcodedSha256) {
      const channels = transcode.transcodedInfo?.channels;
      return {
        trackUrl: `yoto:#${transcode.transcodedSha256}`,
        duration: transcode.transcodedInfo?.duration,
        fileSize: transcode.transcodedInfo?.fileSize ?? audio.length,
        format: transcode.transcodedInfo?.format ?? "mp3",
        channels: typeof channels === "string" ? channels : "mono",
      };
    }
    if (phase && phase !== "queued" && phase !== "processing" && phase !== "transcoding") {
      throw new Error(transcodeFailure(body, String(dexId), "cry"));
    }
  }
  throw new Error(`Yoto is still transcoding the cry for number ${dexId}.`);
}

/**
 * After Labs has recorded Lily, download that MP3, put the cry in front,
 * upload the merged file, and point this chapter at it.
 */
export async function attachCry(
  token: string,
  request: FactCryRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ cardId: string; trackUrl: string }> {
  const { cardId, chapterKey, dexId } = request;
  const [stored, playable, cry] = await Promise.all([
    loadCard(token, cardId, false, fetchImpl),
    loadCard(token, cardId, true, fetchImpl),
    ensureCry(dexId, fetchImpl),
  ]);
  const chapters = stored.content?.chapters ?? [];
  const playableChapter = playable.content?.chapters?.find((chapter) => chapter.key === chapterKey);
  const index = chapters.findIndex((chapter) => chapter.key === chapterKey);
  const chapter = index >= 0 ? chapters[index] : undefined;
  if (!chapter?.tracks?.length || !playableChapter?.tracks?.length) {
    throw new Error(`The recording has no chapter for number ${dexId}.`);
  }
  const tracks = await Promise.all(
    chapter.tracks.map(async (track, trackIndex) => {
      const source = playableChapter.tracks?.[trackIndex]?.trackUrl ?? "";
      if (!/^https?:\/\//.test(source)) {
        throw new Error(`Lily's recording for number ${dexId} is not ready to download.`);
      }
      const speechResponse = await fetchImpl(source, { signal: AbortSignal.timeout(60_000) });
      if (!speechResponse.ok) throw new Error(`Lily's recording for number ${dexId} could not be downloaded.`);
      const speech = Buffer.from(await speechResponse.arrayBuffer());
      const mix = clampMix(request);
      const merged = await mergeCryFirst(cry, speech, mix);
      await assertCryFirst(cry, speech, merged, mix.cryVolume);
      const uploaded = await uploadMerged(token, dexId, merged, fetchImpl);
      const { voiceId: _voice, ...rest } = track;
      return {
        ...rest,
        type: "audio",
        trackUrl: uploaded.trackUrl,
        format: uploaded.format ?? "mp3",
        duration: uploaded.duration,
        fileSize: uploaded.fileSize ?? merged.length,
        channels: uploaded.channels ?? "mono",
      };
    }),
  );
  const nextChapters = chapters.map((item, itemIndex) => (itemIndex === index ? { ...item, tracks } : item));
  const update = await yoto(
    token,
    "https://api.yotoplay.com/content",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId,
        title: stored.title,
        content: { ...stored.content, chapters: nextChapters },
        metadata: stored.metadata,
      }),
    },
    fetchImpl,
  );
  const updateBody = await readJson(update);
  if (!update.ok) throw new Error(messageOf(updateBody, "Yoto did not replace the track with the cry."));
  const trackUrl = tracks[0]?.trackUrl;
  if (!trackUrl?.startsWith("yoto:#")) throw new Error("The merged recording was not stored on Yoto.");
  return { cardId, trackUrl };
}

type TrackPrepareRequest = {
  text?: string;
  title?: string;
  dexId?: number;
  /** Pokémon name. Cry failures name this species. */
  name?: string;
  speechJobId?: string;
  speechCardId?: string;
  uploadId?: string;
  discardCardId?: string;
  /** Scratch cards collected by the browser. Deleted with the library sweep. */
  discardCardIds?: string[];
  /** Delete every temporary Pokefacts scratch card still in the library. */
  sweepScratch?: boolean;
  /** ElevenLabs voice. Lily when this is omitted. */
  voiceId?: string;
  cryVolume?: number;
  voiceVolume?: number;
  pauseSeconds?: number;
  /**
   * Finished MP3. When this is set, the track is uploaded with the same
   * openUpload and poll as a Pokémon mix. Speech and the cry are skipped.
   * The HTTP track route does not send this; the music route passes the file.
   */
  audio?: Buffer;
};

type TrackPrepareResult = {
  phase: "speech" | "upload" | "ready" | "discarded";
  speechJobId?: string;
  speechCardId?: string;
  uploadId?: string;
  trackUrl?: string;
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string;
};

const SPEECH_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "speech");
const RENDER_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "rendered");

/** Cache identity for a finished mix: voice, cry gain, voice gain, pause, dex number, and the script. */
export function renderedCacheKey(
  text: string,
  dexId: number | undefined,
  voiceId: string,
  mix?: Partial<MixSettings> | null,
): string {
  const line = text.replace(/\s+/g, " ").trim();
  const voice = chosenVoice(voiceId);
  const synth = piperCacheToken(voice);
  const mixToken = mixCacheToken(mix);
  return sha256(
    Buffer.from(
      synth
        ? `${voice}\n${synth}\n${mixToken}\n${dexId ?? 0}\n${line}`
        : `${voice}\n${mixToken}\n${dexId ?? 0}\n${line}`,
    ),
  );
}

function legacyRenderedKey(text: string, dexId: number | undefined, voiceId: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return sha256(Buffer.from(`${chosenVoice(voiceId)}\n${dexId ?? 0}\n${line}`));
}

function speechKey(text: string, voiceId: string): string {
  const synth = piperCacheToken(voiceId);
  return sha256(Buffer.from(synth ? `${voiceId}\n${synth}\n${text}` : `${voiceId}\n${text}`));
}

async function writeBytesAtomic(file: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  await writeFile(tmp, bytes);
  try {
    await rename(tmp, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") {
      await rm(tmp, { force: true });
      throw error;
    }
    await rm(file, { force: true });
    try {
      await rename(tmp, file);
    } catch (renameError) {
      await rm(tmp, { force: true });
      throw renameError;
    }
  }
}

async function readMp3File(file: string): Promise<Buffer | undefined> {
  try {
    const bytes = await readFile(file);
    if (bytes.length < 128 || audioContainer(bytes) !== "mp3") return undefined;
    if (bytes.subarray(0, 3).toString("ascii") === "ID3") return undefined;
    return bytes;
  } catch {
    return undefined;
  }
}

/** Merged 128 kb/s MP3 for this script, voice, and volume. Missing means it still has to be mixed. */
export async function readCachedMergedMp3(
  text: string,
  voiceId: string,
  dexId: number | undefined,
  renderedRoot: string = RENDER_ROOT,
  mix?: Partial<MixSettings> | null,
): Promise<Buffer | undefined> {
  return readMp3File(path.join(renderedRoot, `${renderedCacheKey(text, dexId, voiceId, mix)}.mp3`));
}

function readyPayload(cached: StoredAudio): TrackPrepareResult {
  return {
    phase: "ready",
    trackUrl: cached.trackUrl,
    duration: cached.duration,
    fileSize: cached.fileSize,
    format: cached.format,
    channels: cached.channels,
  };
}

async function readReady(
  jsonFile: string,
  dexId: number | undefined,
  mp3File?: string,
): Promise<TrackPrepareResult | undefined> {
  const cached = await readRendered(jsonFile);
  if (!cached?.trackUrl.startsWith("yoto:#")) return undefined;
  if (dexId && cached.cryFirst !== true) return undefined;
  if (mp3File && !(await readMp3File(mp3File))) return undefined;
  return readyPayload(cached);
}

function scratchContent(text: string, title: string, voiceId: string) {
  return {
    title: "Pokefacts scratch",
    content: {
      chapters: [
        {
          key: "line",
          title,
          tracks: [
            {
              key: "line-1",
              title,
              trackUrl: text,
              type: "elevenlabs",
              voiceId,
            },
          ],
        },
      ],
    },
    metadata: {
      title: "Pokefacts scratch",
      description: "Temporary line. Pokefacts deletes this.",
    },
  };
}

function textField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

/** Job results have put the new card id on result, on the job, or under result.card. */
export function recordingCardId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const row = payload as {
    cardId?: unknown;
    contentId?: unknown;
    card?: { cardId?: unknown };
  };
  return textField(row.cardId) ?? textField(row.contentId) ?? textField(row.card?.cardId);
}

function jobFields(payload: unknown): { jobId?: string; status?: string; cardId?: string; error?: string } {
  if (!payload || typeof payload !== "object") return {};
  const row = payload as {
    jobId?: string;
    status?: string;
    error?: unknown;
    result?: unknown;
    cardId?: unknown;
    job?: {
      jobId?: string;
      status?: string;
      error?: unknown;
      result?: unknown;
      cardId?: unknown;
    };
  };
  const job = row.job ?? row;
  const error = typeof job.error === "string" ? job.error : undefined;
  return {
    jobId: job.jobId,
    status: job.status,
    cardId: recordingCardId(job.result) ?? recordingCardId(job),
    error,
  };
}

function httpsAudio(card: CardPayload): string {
  for (const chapter of card.content?.chapters ?? []) {
    for (const track of chapter.tracks ?? []) {
      if (track.trackUrl && /^https?:\/\//.test(track.trackUrl)) return track.trackUrl;
    }
  }
  return "";
}

type StoredAudio = UploadedAudio & { cryFirst?: boolean };

async function readRendered(file: string): Promise<StoredAudio | undefined> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as StoredAudio;
    if (parsed.trackUrl?.startsWith("yoto:#")) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}

async function writeRendered(file: string, audio: UploadedAudio, cryFirst: boolean): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ ...audio, cryFirst }));
}

function uploadMarkPath(renderedRoot: string, uploadId: string): string {
  return path.join(renderedRoot, `upload-${uploadId}.json`);
}

async function readCryMark(file: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as { cryFirst?: boolean };
    return parsed.cryFirst === true;
  } catch {
    return false;
  }
}

async function writeCryMark(file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ cryFirst: true }));
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const SCRATCH_TITLES = new Set(["Pokefacts scratch", "Pokefacts demo", "Champdex scratch"]);

function listedCards(payload: unknown): Array<{ cardId: string; title: string }> {
  const row = payload && typeof payload === "object" ? (payload as { cards?: unknown }) : {};
  if (!Array.isArray(row.cards)) return [];
  const found: Array<{ cardId: string; title: string }> = [];
  for (const item of row.cards) {
    if (!item || typeof item !== "object") continue;
    const card = item as { cardId?: unknown; title?: unknown; metadata?: { title?: unknown } };
    const cardId = textField(card.cardId);
    if (!cardId || !/^[\w-]{4,80}$/.test(cardId)) continue;
    const title = (textField(card.title) ?? textField(card.metadata?.title) ?? "").replace(/\s+/g, " ").trim();
    found.push({ cardId, title });
  }
  return found;
}

/** DELETE one MYO card. A 404 means it is already gone. Other failures are retried. */
export async function discardYotoCard(token: string, cardId: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!/^[\w-]{4,80}$/.test(cardId)) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await yoto(
        token,
        `https://api.yotoplay.com/content/${encodeURIComponent(cardId)}`,
        { method: "DELETE" },
        fetchImpl,
        15_000,
      );
      await response.arrayBuffer().catch(() => undefined);
      if (response.ok || response.status === 404) return true;
    } catch {
      // The next attempt asks Yoto again. A scratch card is not the playlist.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/** Remove temporary recordings by title, including a card whose id the job response hid. */
export async function discardTitledCards(
  token: string,
  titles: ReadonlySet<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await yoto(token, "https://api.yotoplay.com/content/mine", undefined, fetchImpl, 20_000);
  } catch {
    return;
  }
  const payload = await readJson(response);
  if (!response.ok) return;
  for (const card of listedCards(payload)) {
    if (!titles.has(card.title)) continue;
    await discardYotoCard(token, card.cardId, fetchImpl);
  }
}

async function discardCard(token: string, cardId: string, fetchImpl: typeof fetch): Promise<void> {
  await discardYotoCard(token, cardId, fetchImpl);
}

async function openUpload(
  token: string,
  label: string,
  audio: Buffer,
  fetchImpl: typeof fetch,
  timeoutMs = 20_000,
): Promise<string> {
  const uploadUrl = new URL("https://api.yotoplay.com/media/transcode/audio/uploadUrl");
  uploadUrl.searchParams.set("sha256", sha256(audio));
  uploadUrl.searchParams.set("filename", `pokefacts-${label}.mp3`);
  const created = await yoto(token, uploadUrl.toString(), undefined, fetchImpl, timeoutMs);
  const createdBody = (await readJson(created)) as {
    upload?: { uploadId?: string; uploadUrl?: string | null };
  } | null;
  const uploadId = createdBody?.upload?.uploadId;
  if (!created.ok || !uploadId) {
    throw new Error(messageOf(createdBody, "Yoto did not open an upload for this track."));
  }
  if (createdBody?.upload?.uploadUrl) {
    const put = await fetchImpl(createdBody.upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!put.ok) throw new Error("Yoto did not store this track.");
  }
  return uploadId;
}

async function pollUpload(
  token: string,
  uploadId: string,
  label: string,
  fetchImpl: typeof fetch,
  maxPolls: number,
  waitMs = 400,
): Promise<UploadedAudio | undefined> {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const statusUrl = `https://api.yotoplay.com/media/upload/${encodeURIComponent(uploadId)}/transcoded?loudnorm=false`;
    const status = await yoto(token, statusUrl, undefined, fetchImpl, 15_000);
    const body = (await readJson(status)) as {
      transcode?: {
        transcodedSha256?: string;
        progress?: { phase?: string };
        transcodedInfo?: { duration?: number; fileSize?: number; format?: string; channels?: string | number };
      };
    } | null;
    if (!status.ok && attempt === maxPolls - 1) {
      throw new Error(messageOf(body, `Yoto could not transcode track ${label}.`));
    }
    const transcode = body?.transcode;
    const phase = transcode?.progress?.phase;
    if (transcode?.transcodedSha256) {
      const channels = transcode.transcodedInfo?.channels;
      return {
        trackUrl: `yoto:#${transcode.transcodedSha256}`,
        duration: transcode.transcodedInfo?.duration,
        fileSize: transcode.transcodedInfo?.fileSize,
        format: transcode.transcodedInfo?.format ?? "mp3",
        channels: typeof channels === "string" ? channels : "mono",
      };
    }
    if (phase && phase !== "queued" && phase !== "processing" && phase !== "transcoding") {
      throw new Error(transcodeFailure(body, label, "track"));
    }
  }
  return undefined;
}

function clipReason(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || /<!doctype|<html[\s>]/i.test(clean) || /^Command failed:/i.test(clean)) return "";
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

function underlyingReason(error: unknown): string {
  if (!(error instanceof Error)) return "";
  const extra = error as Error & { stderr?: unknown; cause?: unknown };
  const stderrText = Buffer.isBuffer(extra.stderr)
    ? extra.stderr.toString("utf8")
    : typeof extra.stderr === "string"
      ? extra.stderr
      : "";
  const stderrLine = stderrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  const fromStderr = clipReason(stderrLine ?? "");
  if (fromStderr) return fromStderr;
  let message = error.message;
  if (/^fetch failed$/i.test(message.trim()) && extra.cause instanceof Error && extra.cause.message) {
    message = extra.cause.message;
  }
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Command failed:/i.test(line));
  return clipReason(lines.at(-1) ?? "");
}

/**
 * One short step of a single track.
 * Lily's scratch recording stays on disk. The cry is mixed in front of it.
 * Only that merged MP3 is uploaded. A missing cry never becomes a voice-only yoto:# hash.
 * The playlist POST is a later call, after every track in the card is a merged hash.
 */
export async function prepareFactTrack(
  token: string,
  request: TrackPrepareRequest,
  fetchImpl: typeof fetch = fetch,
  roots: {
    speech: string;
    rendered: string;
    cries?: string;
    merge?: (cry: Buffer, speech: Buffer) => Promise<Buffer>;
    piper?: PiperSynthOptions;
  } = { speech: SPEECH_ROOT, rendered: RENDER_ROOT },
): Promise<TrackPrepareResult> {
  const discardIds = [request.discardCardId, ...(request.discardCardIds ?? [])].filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
  if (!request.text?.trim() && (discardIds.length > 0 || request.sweepScratch)) {
    for (const cardId of discardIds) await discardCard(token, cardId, fetchImpl);
    await discardTitledCards(token, SCRATCH_TITLES, fetchImpl);
    return { phase: "discarded" };
  }

  const text = request.text?.replace(/\s+/g, " ").trim() ?? "";
  if (!text || text.length > 3000) throw new Error("That line is empty or longer than Yoto allows.");
  const title = (request.title?.trim() || "Line").slice(0, 80);
  const voiceId = chosenVoice(request.voiceId);
  const dexId = request.dexId;
  const mix = clampMix(request);
  const species = (request.name?.replace(/\s+/g, " ").trim() || title || (typeof dexId === "number" ? `Number ${dexId}` : "")).slice(0, 40);
  const cryFailure = (error?: unknown) => {
    if (error instanceof Error && error.message === RECONNECT_YOTO) return error;
    const lead = `${species} cry could not be added.`;
    if (error instanceof Error && (error.message === lead || error.message.startsWith(`${lead} `))) return error;
    const reason = error == null ? "" : underlyingReason(error);
    return new Error(reason ? `${lead} ${reason}` : lead);
  };
  if (dexId != null && (!Number.isInteger(dexId) || dexId < 1 || dexId > 1025)) {
    throw cryFailure(new Error(`That cry is not in the national Pokédex (${String(dexId)}).`));
  }
  if (request.speechJobId && !/^[\w-]{8,80}$/.test(request.speechJobId)) {
    throw new Error("That recording job id does not look right.");
  }
  if (request.speechCardId && !/^[\w-]{4,80}$/.test(request.speechCardId)) {
    throw new Error("That Yoto card id does not look right.");
  }
  if (request.uploadId && !/^[\w-]{4,120}$/.test(request.uploadId)) {
    throw new Error("That upload id does not look right.");
  }

  // Dex number, not the slot on the card. A Pokefacts playlist never has 142 tracks.
  const label = dexId ? String(dexId) : "intro";
  const renderedFile = path.join(/* turbopackIgnore: true */ roots.rendered, `${renderedCacheKey(text, dexId, voiceId, mix)}.json`);
  const mergedFile = path.join(/* turbopackIgnore: true */ roots.rendered, `${renderedCacheKey(text, dexId, voiceId, mix)}.mp3`);
  const speechFile = path.join(
    /* turbopackIgnore: true */ roots.speech,
    `${speechKey(text, voiceId)}.${isPiperVoice(voiceId) ? "wav" : "mp3"}`,
  );
  let scratchHeld = Boolean(request.speechCardId);
  const releaseScratch = async () => {
    const cardId = request.speechCardId;
    if (!scratchHeld || !cardId) return;
    scratchHeld = false;
    await discardCard(token, cardId, fetchImpl);
  };

  // A supplied MP3 is the song file. Do not reuse a speech recording stored under the same title.
  if (!Buffer.isBuffer(request.audio)) {
    const fresh = await readReady(renderedFile, dexId, dexId ? mergedFile : undefined);
    if (fresh) {
      await releaseScratch();
      return fresh;
    }
    // Hashes written before the volume was part of the key. Those mixes used volume 4, voice 1, and a 0.35s pad.
    if (isDefaultMix(mix)) {
      const legacy = await readReady(
        path.join(roots.rendered, `${legacyRenderedKey(text, dexId, voiceId)}.json`),
        dexId,
      );
      if (legacy) {
        await releaseScratch();
        return legacy;
      }
    }
  }

  const readyFrom = async (uploadId: string, polls: number, persist = true): Promise<TrackPrepareResult> => {
    await releaseScratch();
    if (dexId && !(await readCryMark(uploadMarkPath(roots.rendered, uploadId)))) {
      throw cryFailure(new Error("The saved upload is not a cry-first mix."));
    }
    let uploaded: UploadedAudio | undefined;
    try {
      uploaded = await pollUpload(token, uploadId, label, fetchImpl, polls);
    } catch (error) {
      if (!dexId) throw error;
      throw cryFailure(error);
    }
    if (!uploaded?.trackUrl.startsWith("yoto:#")) return { phase: "upload", uploadId };
    if (persist) await writeRendered(renderedFile, uploaded, Boolean(dexId));
    return {
      phase: "ready",
      trackUrl: uploaded.trackUrl,
      duration: uploaded.duration,
      fileSize: uploaded.fileSize,
      format: uploaded.format,
      channels: uploaded.channels,
    };
  };

  if (Buffer.isBuffer(request.audio)) {
    if (audioContainer(request.audio) !== "mp3") throw new Error(`${title} is not an MP3.`);
    if (request.uploadId) return readyFrom(request.uploadId, 8, false);
    const uploadId = await openUpload(token, label, request.audio, fetchImpl);
    return readyFrom(uploadId, 8, false);
  }

  if (request.uploadId) return readyFrom(request.uploadId, 8);

  if (dexId) {
    const cachedMix = await readMp3File(mergedFile);
    if (cachedMix) {
      await releaseScratch();
      try {
        const uploadId = await openUpload(token, label, cachedMix, fetchImpl);
        await writeCryMark(uploadMarkPath(roots.rendered, uploadId));
        return await readyFrom(uploadId, 8);
      } catch (error) {
        throw cryFailure(error);
      }
    }
  }

  const fromSpeechFile = async (): Promise<TrackPrepareResult> => {
    let speech: Buffer;
    try {
      speech = await readFile(speechFile);
    } catch (error) {
      if (!dexId) throw error;
      throw cryFailure(error);
    }
    const kind = inputContainer(speech);
    const min = kind === "wav" ? 44 : 128;
    if (!kind || speech.length < min) {
      await rm(speechFile, { force: true });
      const bad = new Error(
        isPiperVoice(voiceId) ? "Piper did not write a recording." : "Lily's recording was not an Ogg or MP3 file.",
      );
      if (!dexId) throw bad;
      throw cryFailure(bad);
    }
    await releaseScratch();

    let audio = speech;
    if (dexId) {
      try {
        const cry = await ensureCry(dexId, fetchImpl, roots.cries ?? CRY_CACHE);
        const merged = roots.merge ? await roots.merge(cry, speech) : await mergeCryFirst(cry, speech, mix);
        await assertCryFirst(cry, speech, merged, mix.cryVolume);
        if (merged === speech) throw new Error("The cry was not mixed in front of the reading.");
        await writeBytesAtomic(mergedFile, merged);
        audio = merged;
      } catch (error) {
        throw cryFailure(error);
      }
    } else if (kind === "wav") {
      audio = await encodeYotoMp3(speech);
    }

    try {
      const uploadId = await openUpload(token, label, audio, fetchImpl);
      if (dexId) await writeCryMark(uploadMarkPath(roots.rendered, uploadId));
      return await readyFrom(uploadId, 8);
    } catch (error) {
      if (!dexId) throw error;
      throw cryFailure(error);
    }
  };

  if (await fileExists(speechFile)) return fromSpeechFile();

  if (isPiperVoice(voiceId)) {
    const wav = await synthesizePiper(text, roots.piper);
    if (inputContainer(wav) !== "wav" || wav.length < 44) throw new Error("Piper did not write a recording.");
    await mkdir(path.dirname(speechFile), { recursive: true });
    await writeFile(speechFile, wav);
    return fromSpeechFile();
  }

  const fromCard = async (cardId: string): Promise<TrackPrepareResult> => {
    try {
      const playable = await loadCard(token, cardId, true, fetchImpl);
      const source = httpsAudio(playable);
      if (!source) throw new Error("Lily's recording is not ready to download.");
      const speechResponse = await fetchImpl(source, { signal: AbortSignal.timeout(20_000) });
      if (!speechResponse.ok) throw new Error("Lily's recording could not be downloaded.");
      const speech = Buffer.from(await speechResponse.arrayBuffer());
      if (speech.length < 128) throw new Error("Lily's recording was empty.");
      await mkdir(path.dirname(speechFile), { recursive: true });
      await writeFile(speechFile, speech);
      const ids = new Set<string>([cardId]);
      if (playable.cardId) ids.add(playable.cardId);
      for (const id of ids) await discardCard(token, id, fetchImpl);
      if (request.speechCardId && ids.has(request.speechCardId)) scratchHeld = false;
      return await fromSpeechFile();
    } catch (error) {
      if (!dexId) throw error;
      throw cryFailure(error);
    }
  };

  if (request.speechCardId) return fromCard(request.speechCardId);

  if (request.speechJobId) {
    const status = await yoto(
      token,
      `https://labs.api.yotoplay.com/content/job/${encodeURIComponent(request.speechJobId)}`,
      undefined,
      fetchImpl,
      15_000,
    );
    const fields = jobFields(await readJson(status));
    if (!status.ok) throw new Error(fields.error || "Could not check Lily's recording.");
    if (fields.status === "failed") throw new Error(fields.error || "Lily could not record this line.");
    if (fields.status === "completed" && fields.cardId) return fromCard(fields.cardId);
    return { phase: "speech", speechJobId: request.speechJobId };
  }

  const created = await yoto(
    token,
    `https://labs.api.yotoplay.com/content/job?voiceId=${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scratchContent(text, title, voiceId)),
    },
    fetchImpl,
    20_000,
  );
  const started = jobFields(await readJson(created));
  if (!created.ok || !started.jobId) {
    throw new Error(started.error || "Yoto did not start this line.");
  }
  return { phase: "speech", speechJobId: started.jobId };
}

/**
 * Upload a finished MP3 by calling prepareFactTrack, the same function Pokémon
 * cards use. Eight polls per round, then the same upload id again, matching
 * the studio track loop. The filename stays pokefacts-intro.mp3.
 */
export async function finishFactUpload(
  token: string,
  audio: Buffer,
  title: string,
  fetchImpl: typeof fetch = fetch,
  roots?: { speech: string; rendered: string },
): Promise<UploadedAudio> {
  const name = title.replace(/\s+/g, " ").trim().slice(0, 80) || "Line";
  let uploadId: string | undefined;
  for (let step = 0; step < 60; step += 1) {
    const result = await prepareFactTrack(
      token,
      { text: name, title: name, uploadId, audio },
      fetchImpl,
      roots,
    );
    if (result.phase === "ready" && result.trackUrl?.startsWith("yoto:#")) {
      return {
        trackUrl: result.trackUrl,
        duration: result.duration,
        fileSize: result.fileSize ?? audio.length,
        format: result.format ?? "mp3",
        channels: result.channels ?? "mono",
      };
    }
    if (result.phase === "upload" && result.uploadId) {
      uploadId = result.uploadId;
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    throw new Error(`${name} did not finish.`);
  }
  throw new Error(`Yoto is still transcoding track ${name}.`);
}
