import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cryUrl, mergeCryFirst } from "@/lib/cry-audio";
import { LILY_VOICE_ID } from "@/lib/kid-cards";
import { reconnectMessage } from "@/lib/yoto-error";

export type FactCryRequest = {
  cardId: string;
  chapterKey: string;
  dexId: number;
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

const CRY_CACHE = path.join(process.cwd(), "data", "cries");

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
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as { message?: string; error?: string | { message?: string } };
  const text =
    typeof row.message === "string"
      ? row.message
      : typeof row.error === "string"
        ? row.error
        : row.error && typeof row.error.message === "string"
          ? row.error.message
          : fallback;
  return reconnectMessage(text) ?? text;
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
  return fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}

export async function ensureCry(id: number, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  if (!Number.isInteger(id) || id < 1 || id > 1025) {
    throw new Error("That cry is not in the national Pokédex.");
  }
  await mkdir(CRY_CACHE, { recursive: true });
  const file = path.join(CRY_CACHE, `${id}.ogg`);
  try {
    await access(file);
    return await readFile(file);
  } catch {
    const response = await fetchImpl(cryUrl(id), { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`The cry for number ${id} could not be downloaded.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 4).toString("ascii") !== "OggS") {
      throw new Error(`The cry for number ${id} was not an Ogg file.`);
    }
    await writeFile(file, bytes);
    return bytes;
  }
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
  uploadUrl.searchParams.set("filename", `champdex-${dexId}-cry.mp3`);
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
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
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
      throw new Error(`Yoto could not transcode the cry for number ${dexId}.`);
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
      const merged = await mergeCryFirst(cry, speech);
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

export type TrackPrepareRequest = {
  text?: string;
  title?: string;
  dexId?: number;
  speechJobId?: string;
  speechCardId?: string;
  uploadId?: string;
  discardCardId?: string;
};

export type TrackPrepareResult = {
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

const SPEECH_ROOT = path.join(process.cwd(), "data", "speech");
const RENDER_ROOT = path.join(process.cwd(), "data", "rendered");

function cacheKey(text: string, dexId?: number): string {
  return sha256(Buffer.from(`${LILY_VOICE_ID}\n${dexId ?? 0}\n${text}`));
}

function speechKey(text: string): string {
  return sha256(Buffer.from(`${LILY_VOICE_ID}\n${text}`));
}

function scratchContent(text: string, title: string) {
  return {
    title: "Champdex scratch",
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
              voiceId: LILY_VOICE_ID,
            },
          ],
        },
      ],
    },
    metadata: {
      title: "Champdex scratch",
      description: "Temporary line. Champdex deletes this.",
    },
  };
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

function httpsAudio(card: CardPayload): string {
  for (const chapter of card.content?.chapters ?? []) {
    for (const track of chapter.tracks ?? []) {
      if (track.trackUrl && /^https?:\/\//.test(track.trackUrl)) return track.trackUrl;
    }
  }
  return "";
}

async function readRendered(file: string): Promise<UploadedAudio | undefined> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as UploadedAudio;
    if (parsed.trackUrl?.startsWith("yoto:#")) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}

async function writeRendered(file: string, audio: UploadedAudio): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(audio));
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function discardCard(token: string, cardId: string, fetchImpl: typeof fetch): Promise<void> {
  if (!/^[\w-]{4,80}$/.test(cardId)) return;
  try {
    await yoto(
      token,
      `https://api.yotoplay.com/content/${encodeURIComponent(cardId)}`,
      { method: "DELETE" },
      fetchImpl,
      15_000,
    );
  } catch {
    // The scratch card is only a Lily recording. The playlist does not need it.
  }
}

async function openUpload(
  token: string,
  label: string,
  audio: Buffer,
  fetchImpl: typeof fetch,
): Promise<string> {
  const uploadUrl = new URL("https://api.yotoplay.com/media/transcode/audio/uploadUrl");
  uploadUrl.searchParams.set("sha256", sha256(audio));
  uploadUrl.searchParams.set("filename", `champdex-${label}.mp3`);
  const created = await yoto(token, uploadUrl.toString(), undefined, fetchImpl, 20_000);
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
      signal: AbortSignal.timeout(20_000),
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
): Promise<UploadedAudio | undefined> {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
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
      throw new Error(`Yoto could not transcode track ${label}.`);
    }
  }
  return undefined;
}

/**
 * One short step of a single track: start Lily, merge the cry, or collect the yoto:# hash.
 * The browser calls this once per track, then creates the playlist.
 */
export async function prepareFactTrack(
  token: string,
  request: TrackPrepareRequest,
  fetchImpl: typeof fetch = fetch,
  roots: { speech: string; rendered: string } = { speech: SPEECH_ROOT, rendered: RENDER_ROOT },
): Promise<TrackPrepareResult> {
  if (request.discardCardId && !request.text?.trim()) {
    await discardCard(token, request.discardCardId, fetchImpl);
    return { phase: "discarded" };
  }

  const text = request.text?.replace(/\s+/g, " ").trim() ?? "";
  if (!text || text.length > 3000) throw new Error("That line is empty or longer than Yoto allows.");
  const title = (request.title?.trim() || "Line").slice(0, 80);
  if (request.dexId != null && (!Number.isInteger(request.dexId) || request.dexId < 1 || request.dexId > 1025)) {
    throw new Error("That cry is not in the national Pokédex.");
  }
  const dexId = request.dexId;
  if (request.speechJobId && !/^[\w-]{8,80}$/.test(request.speechJobId)) {
    throw new Error("That recording job id does not look right.");
  }
  if (request.speechCardId && !/^[\w-]{4,80}$/.test(request.speechCardId)) {
    throw new Error("That Yoto card id does not look right.");
  }
  if (request.uploadId && !/^[\w-]{4,120}$/.test(request.uploadId)) {
    throw new Error("That upload id does not look right.");
  }

  const label = dexId ? String(dexId) : "intro";
  const renderedFile = path.join(roots.rendered, `${cacheKey(text, dexId)}.json`);
  const speechFile = path.join(roots.speech, `${speechKey(text)}.mp3`);
  const cached = await readRendered(renderedFile);
  if (cached?.trackUrl.startsWith("yoto:#")) return { phase: "ready", ...cached };

  const readyFrom = async (uploadId: string, polls: number): Promise<TrackPrepareResult> => {
    const uploaded = await pollUpload(token, uploadId, label, fetchImpl, polls);
    if (!uploaded?.trackUrl.startsWith("yoto:#")) return { phase: "upload", uploadId };
    await writeRendered(renderedFile, uploaded);
    return { phase: "ready", ...uploaded };
  };

  if (request.uploadId) return readyFrom(request.uploadId, 4);

  const mix = async (speech: Buffer): Promise<Buffer> => {
    if (!dexId) return speech;
    const cry = await ensureCry(dexId, fetchImpl);
    return mergeCryFirst(cry, speech);
  };

  const fromSpeechFile = async (): Promise<TrackPrepareResult> => {
    const speech = await readFile(speechFile);
    const audio = await mix(speech);
    const uploadId = await openUpload(token, label, audio, fetchImpl);
    return readyFrom(uploadId, 4);
  };

  if (await fileExists(speechFile)) return fromSpeechFile();

  const fromCard = async (cardId: string): Promise<TrackPrepareResult> => {
    const playable = await loadCard(token, cardId, true, fetchImpl);
    const source = httpsAudio(playable);
    if (!source) throw new Error("Lily's recording is not ready to download.");
    const speechResponse = await fetchImpl(source, { signal: AbortSignal.timeout(20_000) });
    if (!speechResponse.ok) throw new Error("Lily's recording could not be downloaded.");
    const speech = Buffer.from(await speechResponse.arrayBuffer());
    if (speech.length < 128) throw new Error("Lily's recording was empty.");
    await mkdir(path.dirname(speechFile), { recursive: true });
    await writeFile(speechFile, speech);
    await discardCard(token, cardId, fetchImpl);
    return fromSpeechFile();
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
    `https://labs.api.yotoplay.com/content/job?voiceId=${encodeURIComponent(LILY_VOICE_ID)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scratchContent(text, title)),
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
