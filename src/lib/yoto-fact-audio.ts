import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cryUrl, mergeCryFirst } from "@/lib/cry-audio";

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
  if (typeof row.message === "string") return row.message;
  if (typeof row.error === "string") return row.error;
  if (row.error && typeof row.error.message === "string") return row.error.message;
  return fallback;
}

async function yoto(
  token: string,
  url: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  return fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(60_000) });
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

async function uploadMerged(token: string, dexId: number, audio: Buffer, fetchImpl: typeof fetch): Promise<{
  trackUrl: string;
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string;
}> {
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
  for (let attempt = 0; attempt < 45; attempt += 1) {
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
