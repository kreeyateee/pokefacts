import {
  countSpokenTracks,
  factsPlaylistUpload,
  pokefactsTitle,
  trackProgressLabel,
  YOTO_EVENT_NAMES,
  YOTO_TRACK_LIMIT,
  type KidCard,
  type YotoTrackEvents,
} from "@/lib/kid-cards";
import {
  looksLikeGateway,
  PUBLIC_LINK_TIMEOUT,
  reconnectMessage,
  savedCardIsGone,
  statusErrorText,
  validYotoCardId,
} from "@/lib/yoto-error";
import type { StoryBed } from "@/lib/story/story-sound";
import type { TrackPart } from "@/lib/story/story-voices";
import { isYotoCoverUrl } from "@/lib/yoto-playlist";

export type SavedCardMap = Partial<Record<string, string>>;

export type PlaylistUpload = {
  voiceId: string;
  /** When set, the job route deletes cardId before Yoto sees the body. */
  create?: boolean;
  /** When set, Send adds tracks onto this card instead of creating one. */
  append?: boolean;
  /** When set, Send replaces every track on this card with these, keeping the card (and any linked card). */
  replace?: boolean;
  content: {
    title?: string;
    cardId?: string;
    metadata?: {
      title?: string;
      description?: string;
      cover?: { imageL?: string };
    };
    content?: unknown;
  };
};

export function applyPlaylistCover(upload: PlaylistUpload, imageL?: string): PlaylistUpload {
  const url = imageL?.trim();
  if (!isYotoCoverUrl(url)) return upload;
  return {
    ...upload,
    content: {
      ...upload.content,
      metadata: {
        ...upload.content.metadata,
        cover: { imageL: url },
      },
    },
  };
}

function dropSavedCard(store: SavedCardMap, playlistId: string): SavedCardMap {
  if (!Object.prototype.hasOwnProperty.call(store, playlistId)) return store;
  const next = { ...store };
  delete next[playlistId];
  return next;
}

/**
 * One numbered Pokefacts playlist for the bulk send.
 * The body is always a create: no saved card id, title "Pokefacts N".
 */
export function factsBulkUpload(
  card: KidCard,
  mediaById: Record<number, string>,
  voiceId?: string,
): PlaylistUpload {
  const index = Number(/^meet-(\d+)$/.exec(card.id)?.[1]);
  if (!Number.isInteger(index) || index < 1) {
    throw new Error("That Pokefacts playlist has no number.");
  }
  const title = pokefactsTitle(index);
  const upload = factsPlaylistUpload(card, mediaById, undefined, voiceId);
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
  /** Species name, used when a cry cannot be added. */
  name?: string;
  /** Adventure lines in several voices, with sounds, recorded as this one track. */
  parts?: TrackPart[];
  /** Ambience and music under those lines. */
  bed?: StoryBed;
  progress: string;
  /** Finished tracks so far, including this one when it has started. */
  done?: number;
  total?: number;
};

type UploadTrack = { key?: string; title?: string; trackUrl?: string };

/** True for a choose-your-own-adventure card, whose tracks jump by key when a button is pressed. */
export function isInteractive(content: PlaylistUpload["content"] | undefined): boolean {
  const nested = content?.content;
  return isRecord(nested) && nested.playbackType === "interactive";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uploadChapters(upload: PlaylistUpload): UploadTrack[][] {
  const nested = upload.content.content;
  if (!nested || typeof nested !== "object") return [];
  const chapters = (nested as { chapters?: Array<{ tracks?: UploadTrack[] }> }).chapters;
  if (!Array.isArray(chapters)) return [];
  return chapters.map((chapter) => (Array.isArray(chapter.tracks) ? chapter.tracks : []));
}

/** Tracks prepared at once. Three overlaps ffmpeg and Yoto uploads; four is the ceiling. */
export const TRACK_POOL_SIZE = 3;
const TRACK_POOL_CAP = 4;

export function trackPoolSize(requested = TRACK_POOL_SIZE): number {
  const size = Math.trunc(requested);
  if (!Number.isFinite(size) || size < 1) return 1;
  return Math.min(TRACK_POOL_CAP, size);
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 * A failure stops new work. Tracks already running finish, then the error is thrown.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  limit = TRACK_POOL_SIZE,
): Promise<R[]> {
  const width = Math.min(trackPoolSize(limit), items.length);
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failure: unknown;
  async function run(): Promise<void> {
    for (;;) {
      if (failure !== undefined) return;
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index] as T, index);
      } catch (error) {
        if (failure === undefined) failure = error;
        return;
      }
    }
  }
  if (width > 0) await Promise.all(Array.from({ length: width }, () => run()));
  if (failure !== undefined) throw failure;
  return results;
}

/**
 * One browser request per track. Species lines use "Pokefacts 1, track 12 of 99".
 * On an interactive card every track is counted, and only tracks marked `lead: "cry"` get the cry,
 * so a choice's repeating question does not.
 */
export function renderJobs(libraryTitle: string, card: KidCard, upload: PlaylistUpload): RenderJob[] {
  const interactive = isInteractive(upload.content);
  const chapters = uploadChapters(upload);
  const rows = chapters.flatMap((tracks, index) => {
    const source = card.chapters[index];
    if (!source) {
      throw new Error("A playlist chapter has no Pokémon to attach a cry to.");
    }
    return tracks.map((track, trackIndex) => {
      const sourceTrack = source.tracks[trackIndex];
      // Every track in a species chapter starts with that cry, even if `lead` was dropped.
      const dexId = interactive && sourceTrack?.lead !== "cry" ? undefined : source.dexId;
      return {
        key: track.key ?? "",
        title: track.title ?? sourceTrack?.title ?? "Line",
        text: track.trackUrl ?? "",
        dexId,
        name: dexId ? source.title : undefined,
        ...(sourceTrack?.parts ? { parts: sourceTrack.parts } : {}),
        ...(sourceTrack?.parts && sourceTrack.bed ? { bed: sourceTrack.bed } : {}),
      };
    });
  });
  if (interactive) {
    return rows.map((row, index) => ({
      ...row,
      progress: trackProgressLabel(libraryTitle, index + 1, rows.length),
      done: index + 1,
      total: rows.length,
    }));
  }
  const total = rows.filter((row) => row.dexId).length;
  let seen = 0;
  return rows.map((row) => {
    if (!row.dexId) return { ...row, progress: `${libraryTitle}, introduction`, done: seen, total };
    seen += 1;
    return { ...row, progress: trackProgressLabel(libraryTitle, seen, total), done: seen, total };
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

const YOTO_KEY_LIMIT = 20;
const AUDIO_FORMATS = new Set([
  "mp3",
  "aac",
  "alac",
  "flac",
  "pcm_s16le",
  "opus",
  "ogg",
  "x-m4a",
  "wav",
  "aiff",
  "mpeg",
  "",
]);
const ICON = /^yoto:#[A-Za-z0-9_-]+$/;

type CreateChapter = {
  key?: string;
  title?: string;
  overlayLabel?: string;
  display?: { icon16x16?: string | null };
  defaultTrackDisplay?: string | null;
  defaultTrackAmbient?: string | null;
  tracks?: CreateTrack[];
};

type CreateTrack = {
  key?: string;
  title?: string;
  trackUrl?: string;
  type?: string;
  voiceId?: string;
  overlayLabel?: string;
  display?: { icon16x16?: string | null };
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string | number;
  uid?: string;
  events?: YotoTrackEvents;
};

function fitKey(key: string, used: Set<string>): string {
  const cleaned = key.replace(/[^\w-]/g, "").slice(0, YOTO_KEY_LIMIT);
  const base = cleaned || "track";
  let next = base;
  let n = 2;
  while (used.has(next)) {
    const suffix = String(n);
    next = `${base.slice(0, YOTO_KEY_LIMIT - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(next);
  return next;
}

/** An interactive card keeps its keys exactly, because its button events jump by key. */
function exactKey(key: string | undefined, used: Set<string>, label: string): string {
  if (!key || !/^[\w-]+$/.test(key)) {
    throw new Error(`${label} has no usable key, so a button jump cannot find it.`);
  }
  if (key.length > YOTO_KEY_LIMIT) {
    throw new Error(`${label} has the key ${key}, longer than the ${YOTO_KEY_LIMIT} characters Yoto allows.`);
  }
  if (used.has(key)) throw new Error(`The key ${key} is used twice, so a button jump could land on the wrong one.`);
  used.add(key);
  return key;
}

const EVENT_COMMANDS = new Set(["goto", "stop", "repeat"]);

/** Every track key on the card, by chapter key. */
function trackKeysByChapter(chapters: unknown[]): Map<string, Set<string>> {
  const keys = new Map<string, Set<string>>();
  for (const chapter of chapters) {
    if (!isRecord(chapter) || typeof chapter.key !== "string") continue;
    const tracks = keys.get(chapter.key) ?? new Set<string>();
    for (const track of Array.isArray(chapter.tracks) ? chapter.tracks : []) {
      if (isRecord(track) && typeof track.key === "string") tracks.add(track.key);
    }
    keys.set(chapter.key, tracks);
  }
  return keys;
}

function eventProblem(label: string, name: string, event: unknown, keys: Map<string, Set<string>>): string | undefined {
  if (!(YOTO_EVENT_NAMES as readonly string[]).includes(name)) return `${label} has an unknown event, ${name}.`;
  if (event === undefined) return undefined;
  if (!isRecord(event) || typeof event.cmd !== "string" || !EVENT_COMMANDS.has(event.cmd)) {
    return `${label} ${name} must be goto, stop or repeat.`;
  }
  if (event.cmd !== "goto") return undefined;
  const params = isRecord(event.params) ? event.params : {};
  const { chapterKey, trackKey } = params;
  if (typeof chapterKey !== "string" || typeof trackKey !== "string") {
    return `${label} ${name} jumps without naming a chapter and a track.`;
  }
  if (!keys.get(chapterKey)?.has(trackKey)) {
    return `${label} ${name} jumps to ${chapterKey}/${trackKey}, which is not on this card.`;
  }
  return undefined;
}

/**
 * Why the button events in this card content cannot be sent, or undefined when they are fine.
 * Events belong to an interactive card. Each is goto, stop or repeat,
 * and a goto names a track inside the chapter it names.
 */
export function trackEventProblem(nested: unknown): string | undefined {
  const row = isRecord(nested) ? nested : {};
  const chapters = Array.isArray(row.chapters) ? row.chapters : [];
  const keys = trackKeysByChapter(chapters);
  for (const chapter of chapters) {
    for (const track of isRecord(chapter) && Array.isArray(chapter.tracks) ? chapter.tracks : []) {
      if (!isRecord(track) || track.events === undefined) continue;
      const label = typeof track.key === "string" ? `Track ${track.key}` : "A track";
      if (row.playbackType !== "interactive") return `${label} has button events, which only work on an interactive card.`;
      if (!isRecord(track.events)) return `${label} has malformed button events.`;
      for (const [name, event] of Object.entries(track.events)) {
        const problem = eventProblem(label, name, event, keys);
        if (problem) return problem;
      }
    }
  }
  return undefined;
}

function audioChannels(value: string | number | undefined): "mono" | "stereo" {
  if (value === "stereo" || value === 2 || value === "2") return "stereo";
  return "mono";
}

function audioFormat(value: string | undefined): string {
  const format = (value ?? "mp3").trim().toLowerCase();
  if (AUDIO_FORMATS.has(format)) return format;
  throw new Error(`Yoto cannot play this recording format (${value ?? "missing"}).`);
}

function iconOrThrow(value: string | null | undefined, label: string): string {
  if (value && ICON.test(value)) return value;
  throw new Error(`Yoto cannot use the picture on ${label}.`);
}

/**
 * Body for POST https://api.yotoplay.com/content.
 * Yoto rejects that call when a chapter key is longer than 20 characters,
 * when metadata includes a title field their content schema does not define,
 * or when an audio track omits uid, duration, or fileSize.
 * A create never sends cardId.
 * An interactive card keeps every key as it is, since its button events jump by key,
 * and fails here rather than renaming one.
 */
export function contentCreateBody(content: PlaylistUpload["content"]): PlaylistUpload["content"] {
  const body = structuredClone(content);
  delete body.cardId;
  const metadata = { ...(body.metadata ?? {}) };
  delete metadata.title;
  const nested = body.content;
  const chapters = nested && typeof nested === "object" ? ((nested as { chapters?: CreateChapter[] }).chapters ?? []) : [];
  const interactive = isInteractive(content);
  const usedKeys = new Set<string>();
  const trackKeys = new Set<string>();
  let duration = 0;
  let fileSize = 0;
  for (const chapter of chapters) {
    const label = chapter.title?.trim() || chapter.key || "a track";
    chapter.key = interactive ? exactKey(chapter.key, usedKeys, label) : fitKey(chapter.key ?? "chapter", usedKeys);
    chapter.defaultTrackDisplay = chapter.defaultTrackDisplay ?? null;
    chapter.defaultTrackAmbient = chapter.defaultTrackAmbient ?? null;
    if (chapter.display) chapter.display.icon16x16 = iconOrThrow(chapter.display.icon16x16, label);
    for (const track of chapter.tracks ?? []) {
      const trackLabel = track.title?.trim() || label;
      track.key = interactive
        ? exactKey(track.key, trackKeys, trackLabel)
        : fitKey(track.key ?? chapter.key, usedKeys);
      track.uid = track.key;
      delete track.voiceId;
      if (track.type === "audio") {
        if (typeof track.duration !== "number" || !Number.isFinite(track.duration)) {
          throw new Error(`${trackLabel} is missing its length, so Yoto cannot save the playlist.`);
        }
        if (typeof track.fileSize !== "number" || !Number.isFinite(track.fileSize)) {
          throw new Error(`${trackLabel} is missing its file size, so Yoto cannot save the playlist.`);
        }
        track.format = audioFormat(track.format);
        track.channels = audioChannels(track.channels);
        duration += track.duration;
        fileSize += track.fileSize;
      }
      if (track.display) track.display.icon16x16 = iconOrThrow(track.display.icon16x16, trackLabel);
    }
  }
  const eventIssue = trackEventProblem(nested);
  if (eventIssue) throw new Error(eventIssue);
  body.metadata = {
    ...metadata,
    description: metadata.description ?? body.title ?? "",
    media: { duration, fileSize },
  } as PlaylistUpload["content"]["metadata"];
  return body;
}

export function freeSlotMessage(free: number, needed: number): string {
  const slots = Math.max(0, free);
  const noun = slots === 1 ? "free slot" : "free slots";
  return `This playlist has ${slots} ${noun} left. This send needs ${needed} tracks.`;
}

type LibraryCard = {
  cardId?: string;
  title?: string;
  name?: string;
  metadata?: { title?: string; description?: string; cover?: { imageL?: string } };
  content?: { chapters?: Array<{ tracks?: unknown[] }> };
};

function unwrapCard(payload: unknown): LibraryCard | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as { card?: unknown; cardId?: unknown; content?: unknown };
  if (row.card && typeof row.card === "object") return row.card as LibraryCard;
  if (typeof row.cardId === "string" || row.content) return row as LibraryCard;
  return null;
}

/** Titles from GET /content/mine. "New playlist" is not one of these. */
export function libraryPlaylists(payload: unknown): Array<{ cardId: string; title: string }> {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const lists = [row.cards, row.content, row.items, Array.isArray(payload) ? payload : null];
  const source = lists.find((item): item is unknown[] => Array.isArray(item));
  if (!source) return [];
  const seen = new Set<string>();
  const playlists: Array<{ cardId: string; title: string }> = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const card = item as LibraryCard;
    const cardId = validYotoCardId(card.cardId);
    if (!cardId || seen.has(cardId)) continue;
    seen.add(cardId);
    const title = (card.title || card.metadata?.title || card.name || "Untitled playlist").replace(/\s+/g, " ").trim();
    playlists.push({ cardId, title: title.slice(0, 80) || "Untitled playlist" });
  }
  return playlists;
}

export function playlistSummary(payload: unknown): { cardId: string; title: string; tracks: number } | null {
  const card = unwrapCard(payload);
  const cardId = validYotoCardId(card?.cardId);
  if (!card || !cardId) return null;
  const chapters = card.content?.chapters ?? [];
  const title = (card.title || card.metadata?.title || "Untitled playlist").replace(/\s+/g, " ").trim();
  return {
    cardId,
    title: title.slice(0, 80) || "Untitled playlist",
    tracks: countSpokenTracks(chapters),
  };
}

/**
 * "New playlist" is a create and never keeps a card id.
 * An existing playlist is the one case the update body includes that card id: its tracks are added to
 * the end, or, with "replace", they take the place of everything that was there.
 */
export function uploadForPlaylist(
  upload: PlaylistUpload,
  selection: string | undefined,
  mode: "append" | "replace" = "append",
): PlaylistUpload {
  const cardId = validYotoCardId(selection);
  if (!cardId) {
    const content = { ...upload.content };
    delete content.cardId;
    return { ...upload, create: true, append: false, replace: undefined, content };
  }
  return {
    ...upload,
    create: undefined,
    append: mode === "append",
    replace: mode === "replace" ? true : undefined,
    content: { ...upload.content, cardId },
  };
}

/** The same upload under another name in the Yoto library. */
export function retitledUpload(upload: PlaylistUpload, title: string): PlaylistUpload {
  return {
    ...upload,
    content: {
      ...upload.content,
      title,
      ...(upload.content.metadata ? { metadata: { ...upload.content.metadata, title } } : {}),
    },
  };
}

/**
 * POST /content update: the same card body Yoto stores, plus the new chapters.
 * Existing tracks stay. metadata.title stays off, matching the create schema.
 */
export function appendToPlaylist(
  existing: PlaylistUpload["content"],
  addition: PlaylistUpload["content"],
): PlaylistUpload["content"] {
  const stored = unwrapCard(existing) ?? (existing as LibraryCard);
  const cardId = validYotoCardId(stored.cardId);
  if (!cardId) throw new Error("That Yoto playlist id does not look right.");
  if (isInteractive(addition)) {
    throw new Error("An adventure card is sent as a new playlist. It cannot be added onto another one.");
  }
  const existingNested = (
    stored.content && typeof stored.content === "object" ? structuredClone(stored.content) : { chapters: [] }
  ) as { chapters?: CreateChapter[] };
  const existingChapters = Array.isArray(existingNested.chapters) ? existingNested.chapters : [];
  const existingCount = countSpokenTracks(existingChapters);
  const normalized = contentCreateBody(addition);
  const nested = normalized.content;
  const newChapters =
    nested && typeof nested === "object" && Array.isArray((nested as { chapters?: CreateChapter[] }).chapters)
      ? ((nested as { chapters: CreateChapter[] }).chapters)
      : [];
  const newCount = countSpokenTracks(newChapters);
  const free = YOTO_TRACK_LIMIT - existingCount;
  if (newCount > free) throw new Error(freeSlotMessage(free, newCount));

  const used = new Set<string>();
  for (const chapter of existingChapters) {
    if (chapter.key) used.add(chapter.key);
    for (const track of chapter.tracks ?? []) {
      if (track.key) used.add(track.key);
      if (track.uid) used.add(track.uid);
    }
  }
  for (const chapter of newChapters) {
    chapter.key = fitKey(chapter.key ?? "chapter", used);
    for (const track of chapter.tracks ?? []) {
      track.key = fitKey(track.key ?? chapter.key ?? "track", used);
      track.uid = track.key;
    }
  }

  let duration = 0;
  let fileSize = 0;
  for (const chapter of [...existingChapters, ...newChapters]) {
    for (const track of chapter.tracks ?? []) {
      if (typeof track.duration === "number" && Number.isFinite(track.duration)) duration += track.duration;
      if (typeof track.fileSize === "number" && Number.isFinite(track.fileSize)) fileSize += track.fileSize;
    }
  }

  const previous = { ...(stored.metadata ?? {}) };
  delete previous.title;
  const description =
    (typeof previous.description === "string" && previous.description.trim()) ||
    normalized.metadata?.description ||
    stored.title ||
    "";
  const previousCover = previous.cover?.imageL;
  const addedCover = normalized.metadata?.cover?.imageL;
  const coverUrl = isYotoCoverUrl(previousCover)
    ? previousCover
    : isYotoCoverUrl(addedCover)
      ? addedCover
      : undefined;

  return {
    cardId,
    title: stored.title?.trim() || addition.title,
    content: { ...existingNested, chapters: [...existingChapters, ...newChapters] },
    metadata: {
      ...previous,
      description,
      media: { duration, fileSize },
      ...(coverUrl ? { cover: { imageL: coverUrl } } : {}),
    } as PlaylistUpload["content"]["metadata"],
  };
}

/** A create counts only when Yoto returned a card id. A saved id is not that. */
export function finishedPlaylistId(options: {
  status?: string;
  cardId?: string;
  fallback?: string;
  create?: boolean;
}): string | undefined {
  const returned = validYotoCardId(options.cardId);
  if (options.status === "completed" || options.create) return returned;
  return returned ?? validYotoCardId(options.fallback);
}
