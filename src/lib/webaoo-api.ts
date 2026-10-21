import { audioDurationSeconds, encodeYotoMp3 } from "@/lib/cry-audio";
import { ffmpegBinDir } from "@/lib/ffmpeg-bin";
import {
  asSendFailure,
  looksLikeGateway,
  PUBLIC_LINK_TIMEOUT,
  reconnectMessage,
  SendFailure,
  statusErrorText,
  validYotoCardId,
  yotoUpstreamFailure,
} from "@/lib/yoto-error";
import { uploadTrackAudio } from "@/lib/yoto-fact-audio";
import {
  appendToPlaylist,
  contentCreateBody,
  finishedPlaylistId,
  type FinishedAudio,
  type PlaylistUpload,
} from "@/lib/yoto-send";
import {
  EXPIRED_LOGIN,
  LOCAL_FILE_ONLY,
  MISSING_FFMPEG,
  musicPlaylistContent,
  WEBAOO_TRACK_CAP,
  youtubeStayEmbedMessage,
  type StagedFinishedAudio,
} from "@/lib/webaoo";

/**
 * Yoto HTTP for local music.
 * Tokens stay in the existing session helper. This module does not store them.
 * It never accepts a video id and never downloads a remote file.
 */

export type SyncTrack = {
  id: string;
  title: string;
  fileName: string;
  mime?: string;
  icon?: string;
  bytes: Buffer;
};

export type SyncResult = {
  cardId: string;
  title: string;
};

const CONTENT_URL = "https://api.yotoplay.com/content";

async function encodeLocal(bytes: Buffer): Promise<Buffer> {
  if (!ffmpegBinDir()) throw new Error(MISSING_FFMPEG);
  try {
    return await encodeYotoMp3(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/was not found|enoent/i.test(message)) throw new Error(MISSING_FFMPEG);
    if (/not a plain 44\.1|not playable/i.test(message)) {
      throw new Error(`ffmpeg could not prepare this file as a 128 kb/s mono 44100 MP3. ${message}`);
    }
    throw error;
  }
}

function failureText(status: number, text: string, fallback: string): string {
  if (status === 401) return EXPIRED_LOGIN;
  const upstream = yotoUpstreamFailure(text);
  return reconnectMessage(upstream.message) ?? reconnectMessage(text) ?? statusErrorText(status, upstream, fallback);
}

async function yotoContent(
  token: string,
  url: string,
  init: RequestInit | undefined,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    throw asSendFailure(error, "Yoto did not answer.");
  }
  const text = await response.text();
  if (looksLikeGateway(response.status, text)) throw new SendFailure(PUBLIC_LINK_TIMEOUT, true);
  if (!response.ok) {
    throw new SendFailure(failureText(response.status, text, "Yoto did not accept this playlist."), looksLikeGateway(response.status, text));
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SendFailure("Yoto did not return the playlist.", false);
  }
}

function stampCardId(payload: unknown, cardId: string): PlaylistUpload["content"] {
  if (payload && typeof payload === "object") {
    const row = payload as { card?: { cardId?: string }; cardId?: string };
    if (row.card && typeof row.card === "object" && !row.card.cardId) row.card.cardId = cardId;
    if (!row.card && !row.cardId) (row as { cardId?: string }).cardId = cardId;
  }
  return payload as PlaylistUpload["content"];
}

function cardIdFrom(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const row = payload as { cardId?: string; card?: { cardId?: string } };
  return validYotoCardId(row.card?.cardId) ?? validYotoCardId(row.cardId);
}

/**
 * Transcode each local file with encodeYotoMp3, upload it with the fact-track
 * media upload, then create or append a Make Your Own playlist.
 * Music tracks are not spoken and do not get a Pokémon cry.
 */
export async function syncLocalPlaylist(input: {
  token: string;
  title?: string;
  cardId?: string;
  tracks: readonly SyncTrack[];
  fetchImpl?: typeof fetch;
  encode?: (bytes: Buffer) => Promise<Buffer>;
  upload?: (token: string, label: string, audio: Buffer, fetchImpl: typeof fetch) => Promise<FinishedAudio>;
}): Promise<SyncResult> {
  if (!input.token || input.token.trim().length < 20) throw new SendFailure(EXPIRED_LOGIN, false);
  if (input.tracks.length === 0) throw new Error(LOCAL_FILE_ONLY);
  if (input.tracks.length > WEBAOO_TRACK_CAP) {
    throw new Error(`A playlist holds ${WEBAOO_TRACK_CAP} tracks. Remove one before adding another.`);
  }
  for (const track of input.tracks) {
    const blocked = youtubeStayEmbedMessage(track.fileName) ?? youtubeStayEmbedMessage(track.title);
    if (blocked) throw new Error(blocked);
    if (/^https?:\/\//i.test(track.fileName.trim())) throw new Error(LOCAL_FILE_ONLY);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const encode = input.encode ?? encodeLocal;
  const upload = input.upload ?? uploadTrackAudio;
  const audioById: Record<string, StagedFinishedAudio> = {};

  for (const [index, track] of input.tracks.entries()) {
    if (!track.bytes?.length) throw new Error(`${track.title || track.fileName} is missing its audio file.`);
    const encoded = await encode(track.bytes);
    const uploaded = await upload(input.token, `music${index + 1}`, encoded, fetchImpl);
    let duration = uploaded.duration;
    let fileSize = uploaded.fileSize;
    if (typeof duration !== "number" || !Number.isFinite(duration)) {
      if (input.encode) throw new Error(`${track.title || "A track"} is missing its length, so Yoto cannot save the playlist.`);
      duration = await audioDurationSeconds(encoded);
    }
    if (typeof fileSize !== "number" || !Number.isFinite(fileSize)) fileSize = encoded.length;
    audioById[track.id] = {
      trackUrl: uploaded.trackUrl,
      duration,
      fileSize,
      format: uploaded.format ?? "mp3",
      channels: uploaded.channels ?? "mono",
    };
  }

  const addition = musicPlaylistContent(
    {
      title: input.title,
      tracks: input.tracks.map((track) => ({ id: track.id, title: track.title, icon: track.icon })),
    },
    audioById,
  );
  const cardId = validYotoCardId(input.cardId);
  const playlist = cardId
    ? appendToPlaylist(stampCardId(await yotoContent(input.token, `${CONTENT_URL}/${encodeURIComponent(cardId)}`, undefined, fetchImpl), cardId), addition)
    : contentCreateBody(addition);
  const saved = await yotoContent(
    input.token,
    CONTENT_URL,
    { method: "POST", body: JSON.stringify(playlist) },
    fetchImpl,
  );
  const confirmed = cardId
    ? finishedPlaylistId({ cardId: cardIdFrom(saved), fallback: cardId })
    : finishedPlaylistId({ status: "completed", cardId: cardIdFrom(saved), create: true });
  if (!confirmed) throw new SendFailure("Yoto did not return the playlist.", false);
  return { cardId: confirmed, title: playlist.title?.trim() || addition.title };
}
