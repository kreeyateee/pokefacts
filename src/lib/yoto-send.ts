import { factsPlaylistUpload, pokefactsTitle, trackProgressLabel, type KidCard } from "@/lib/kid-cards";
import {
  looksLikeGateway,
  PUBLIC_LINK_TIMEOUT,
  reconnectMessage,
  savedCardIsGone,
  statusErrorText,
} from "@/lib/yoto-error";

export type SavedCardMap = Partial<Record<string, string>>;

export type PlaylistUpload = {
  voiceId: string;
  /** When set, the job route deletes cardId before Yoto sees the body. */
  create?: boolean;
  content: {
    title?: string;
    cardId?: string;
    metadata?: { title?: string; description?: string };
    content?: unknown;
  };
};

export function dropSavedCard(store: SavedCardMap, playlistId: string): SavedCardMap {
  if (!Object.prototype.hasOwnProperty.call(store, playlistId)) return store;
  const next = { ...store };
  delete next[playlistId];
  return next;
}

/**
 * One numbered Pokefacts playlist for the bulk send.
 * The body is always a create: no saved card id, title "Pokefacts N".
 */
export function factsBulkUpload(card: KidCard, mediaById: Record<number, string>): PlaylistUpload {
  const index = Number(/^meet-(\d+)$/.exec(card.id)?.[1]);
  if (!Number.isInteger(index) || index < 1) {
    throw new Error("That Pokefacts playlist has no number.");
  }
  const title = pokefactsTitle(index);
  const upload = factsPlaylistUpload(card, mediaById);
  const content = { ...upload.content, title };
  delete content.cardId;
  content.metadata = { ...content.metadata, title };
  return { voiceId: upload.voiceId, create: true, content };
}

/**
 * A replace was rejected because that card is gone.
 * Drop the saved id and, once, send the same playlist as a create.
 */
export function afterRejectedPlaylist(options: {
  playlistId: string;
  upload: PlaylistUpload;
  status: number;
  body: unknown;
  store: SavedCardMap;
  retried: boolean;
}):
  | { action: "retry-create"; upload: PlaylistUpload; store: SavedCardMap }
  | { action: "fail"; store: SavedCardMap; message: string } {
  const missing = options.status === 400 || savedCardIsGone(options.status, options.body);
  const store = missing ? dropSavedCard(options.store, options.playlistId) : options.store;
  if (!options.retried && options.upload.content.cardId && missing) {
    const content = { ...options.upload.content };
    delete content.cardId;
    return {
      action: "retry-create",
      upload: { ...options.upload, create: true, content },
      store,
    };
  }
  return {
    action: "fail",
    store,
    message: statusErrorText(options.status, options.body, "Yoto did not accept this card."),
  };
}

/**
 * Status line for a bulk stop.
 * The library sentence is only for an earlier playlist that succeeded in this run.
 * Playlist 1 and gateway errors never claim that.
 */
export function bulkFailureText(input: {
  headline: string;
  rangeLabel: string;
  reason: string;
  createdTitles: string[];
  playlistIndex?: number;
  gateway?: boolean;
}): string {
  const reconnect = reconnectMessage(input.reason);
  if (reconnect) return reconnect;
  const gateway = Boolean(input.gateway) || looksLikeGateway(0, input.reason);
  const reason = gateway ? PUBLIC_LINK_TIMEOUT : input.reason.trim() || "The recording stopped.";
  const earlier =
    !gateway && (input.playlistIndex ?? 1) > 1 && input.createdTitles.length > 0
      ? " Playlists before this one are already in your library."
      : "";
  return `${input.headline} failed (${input.rangeLabel}). ${reason}${earlier} Retry when you are ready.`;
}

export type FinishedAudio = {
  trackUrl: string;
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string | number;
};

export type RenderJob = {
  key: string;
  title: string;
  text: string;
  dexId?: number;
  progress: string;
};

type UploadTrack = { key?: string; title?: string; trackUrl?: string };

function uploadChapters(upload: PlaylistUpload): UploadTrack[][] {
  const nested = upload.content.content;
  if (!nested || typeof nested !== "object") return [];
  const chapters = (nested as { chapters?: Array<{ tracks?: UploadTrack[] }> }).chapters;
  if (!Array.isArray(chapters)) return [];
  return chapters.map((chapter) => (Array.isArray(chapter.tracks) ? chapter.tracks : []));
}

/** One browser request per track. Species lines use "Pokefacts 1, track 12 of 99". */
export function renderJobs(libraryTitle: string, card: KidCard, upload: PlaylistUpload): RenderJob[] {
  const chapters = uploadChapters(upload);
  const rows = chapters.flatMap((tracks, index) => {
    const source = card.chapters[index];
    return tracks.map((track, trackIndex) => {
      const sourceTrack = source?.tracks[trackIndex];
      const dexId = sourceTrack?.lead === "cry" ? source?.dexId : undefined;
      return {
        key: track.key ?? "",
        title: track.title ?? sourceTrack?.title ?? "Line",
        text: track.trackUrl ?? "",
        dexId,
      };
    });
  });
  const total = rows.filter((row) => row.dexId).length;
  let seen = 0;
  return rows.map((row) => {
    if (!row.dexId) return { ...row, progress: `${libraryTitle}, introduction` };
    seen += 1;
    return { ...row, progress: trackProgressLabel(libraryTitle, seen, total) };
  });
}

/** Swap spoken scripts for finished yoto:# audio. A bulk create still has no card id. */
export function applyFinishedAudio(upload: PlaylistUpload, audioByKey: Record<string, FinishedAudio>): PlaylistUpload {
  const content = structuredClone(upload.content) as PlaylistUpload["content"] & {
    content?: { chapters?: Array<{ tracks?: Array<Record<string, unknown>> }> };
  };
  const chapters = content.content?.chapters ?? [];
  for (const chapter of chapters) {
    for (const track of chapter.tracks ?? []) {
      const key = typeof track.key === "string" ? track.key : "";
      const audio = audioByKey[key];
      if (!audio?.trackUrl.startsWith("yoto:#")) {
        throw new Error(`Track ${key || "unknown"} is not a finished recording.`);
      }
      track.type = "audio";
      track.trackUrl = audio.trackUrl;
      delete track.voiceId;
      if (audio.duration != null) track.duration = audio.duration;
      if (audio.fileSize != null) track.fileSize = audio.fileSize;
      track.format = audio.format ?? "mp3";
      track.channels = audio.channels ?? "mono";
    }
  }
  if (upload.create) delete content.cardId;
  return { ...upload, content };
}
