import type { StickerCard } from "@/lib/sticker-cover";
import { isScene, type Scene } from "@/lib/sticker-scenes";
import { clampMix, type MixSettings } from "@/lib/playback-settings";
import type { FinishedAudio, PlaylistUpload, RenderJob } from "@/lib/yoto-send";

/**
 * A send to Yoto is driven by the page, one track at a time. Its progress is kept here after
 * every finished track, so a refresh, a closed tab, or a Yoto login picks up where it stopped
 * instead of recording everything again.
 */
export const PENDING_SEND_KEY = "pokefacts.pendingSend";

/** An older send is dropped: its Yoto login and scratch recordings are long gone. */
export const PENDING_SEND_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One tab drives a send. Another tab may take over once this heartbeat is this old. */
export const SEND_LOCK_KEY = "pokefacts.sendLock";
export const SEND_LOCK_STALE_MS = 20_000;
export const SEND_LOCK_BEAT_MS = 5_000;

/** A playlist with its spoken text and pictures ready, waiting for its tracks to be recorded. */
export type PendingPlaylist = {
  /** The Pokefacts card id, used for the saved Yoto card. */
  playlistId: string;
  libraryTitle: string;
  headline: string;
  rangeLabel: string;
  /** The first Pokémon's artwork, the bare cover used when drawing the cover fails. */
  coverId?: number;
  /** The cover's background, in place of the one chosen for the set. */
  coverScene?: Scene;
  /** The cover's Pokémon is a silhouette, so a Who's That card does not give its first answer away. */
  coverHidden?: boolean;
  /** The card the cover is drawn from: its sticker front, as the child designed it or as made for it. */
  coverCard?: StickerCard;
  upload: PlaylistUpload;
  jobs: RenderJob[];
};

/** What the bar and toast say when a single playlist is in the library. */
export type PendingFinish = {
  detail: string;
  toastTitle: string;
  updated: boolean;
  tracks: number;
};

/** "Send all" prepares each numbered playlist only when it is next. */
export type PendingBulk = {
  remaining: string[];
  created: string[];
  total: number;
  dexNote: string;
};

export type PendingSend = {
  version: 1;
  startedAt: number;
  /** The playlist name shown in the Make Your Own card window. */
  title: string;
  /** Voice and mix chosen when the send started, so a resumed send sounds the same. */
  voiceId: string;
  mix: MixSettings;
  current: PendingPlaylist | null;
  /** Finished tracks of `current`, by track key. */
  audio: Record<string, FinishedAudio>;
  /** Cover for `current`: missing until it is uploaded, null when there is none. */
  cover?: string | null;
  /** Scratch voice cards to delete, including ones left by a stopped run. */
  scratch: string[];
  finish: PendingFinish | null;
  bulk: PendingBulk | null;
  /** Why the last run stopped. A failed send waits for Retry instead of starting by itself. */
  failed?: string;
  /** Yoto's voice service turned adventure lines away, so the rest is read by Piper. */
  voiceFallback?: boolean;
};

export function startPendingSend(input: {
  title: string;
  now: number;
  voiceId: string;
  mix: MixSettings;
  current?: PendingPlaylist;
  finish?: PendingFinish;
  bulk?: PendingBulk;
}): PendingSend {
  return {
    version: 1,
    startedAt: input.now,
    title: input.title,
    voiceId: input.voiceId,
    mix: clampMix(input.mix),
    current: input.current ?? null,
    audio: {},
    scratch: [],
    finish: input.finish ?? null,
    bulk: input.bulk ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFinishedAudio(value: unknown): value is FinishedAudio {
  return isRecord(value) && typeof value.trackUrl === "string" && value.trackUrl.startsWith("yoto:#");
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCoverCard(value: unknown): value is StickerCard {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.libraryTitle === "string" &&
    typeof value.rangeLabel === "string" &&
    typeof value.blurb === "string" &&
    typeof value.childDoes === "string" &&
    Array.isArray(value.chapters) &&
    value.chapters.every(
      (chapter) =>
        isRecord(chapter) &&
        typeof chapter.key === "string" &&
        typeof chapter.title === "string" &&
        typeof chapter.overlay === "string" &&
        (chapter.dexId === undefined || typeof chapter.dexId === "number"),
    )
  );
}

function isPendingPlaylist(value: unknown): value is PendingPlaylist {
  if (!isRecord(value)) return false;
  return (
    typeof value.playlistId === "string" &&
    typeof value.libraryTitle === "string" &&
    typeof value.headline === "string" &&
    typeof value.rangeLabel === "string" &&
    (value.coverId === undefined || typeof value.coverId === "number") &&
    (value.coverScene === undefined || isScene(value.coverScene)) &&
    (value.coverHidden === undefined || typeof value.coverHidden === "boolean") &&
    (value.coverCard === undefined || isCoverCard(value.coverCard)) &&
    isRecord(value.upload) &&
    isRecord(value.upload.content) &&
    Array.isArray(value.jobs) &&
    value.jobs.every((job) => isRecord(job) && typeof job.key === "string" && typeof job.text === "string")
  );
}

function isPendingFinish(value: unknown): value is PendingFinish {
  return (
    isRecord(value) &&
    typeof value.detail === "string" &&
    typeof value.toastTitle === "string" &&
    typeof value.updated === "boolean" &&
    typeof value.tracks === "number"
  );
}

function isPendingBulk(value: unknown): value is PendingBulk {
  return (
    isRecord(value) &&
    isStringList(value.remaining) &&
    isStringList(value.created) &&
    typeof value.total === "number" &&
    typeof value.dexNote === "string"
  );
}

/** The saved send, or null when there is none, it is too old, or it does not look right. */
export function readPendingSend(raw: string | null, now: number): PendingSend | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== 1) return null;
  if (typeof value.startedAt !== "number" || now - value.startedAt > PENDING_SEND_MAX_AGE_MS) return null;
  if (typeof value.title !== "string" || typeof value.voiceId !== "string" || !isRecord(value.mix)) return null;
  if (value.current !== null && !isPendingPlaylist(value.current)) return null;
  if (value.finish !== null && !isPendingFinish(value.finish)) return null;
  if (value.bulk !== null && !isPendingBulk(value.bulk)) return null;
  if (value.current === null && (value.bulk === null || value.bulk.remaining.length === 0)) return null;
  const audio: Record<string, FinishedAudio> = {};
  if (isRecord(value.audio)) {
    for (const [key, item] of Object.entries(value.audio)) {
      if (isFinishedAudio(item)) audio[key] = item;
    }
  }
  const send: PendingSend = {
    version: 1,
    startedAt: value.startedAt,
    title: value.title,
    voiceId: value.voiceId,
    mix: clampMix(value.mix),
    current: value.current,
    audio,
    scratch: isStringList(value.scratch) ? value.scratch : [],
    finish: value.finish,
    bulk: value.bulk,
  };
  if (value.cover === null || typeof value.cover === "string") send.cover = value.cover;
  if (typeof value.failed === "string" && value.failed) send.failed = value.failed;
  return send;
}

export function serializePendingSend(send: PendingSend): string {
  return JSON.stringify(send);
}

export function withTrackDone(send: PendingSend, key: string, audio: FinishedAudio): PendingSend {
  return { ...send, audio: { ...send.audio, [key]: audio } };
}

/** Track keys whose finished audio is one of these Yoto media hashes (without the `yoto:#`). */
export function tracksUsingMedia(audio: Record<string, FinishedAudio>, hashes: readonly string[]): string[] {
  const dead = new Set(hashes.map((hash) => `yoto:#${hash}`));
  return Object.entries(audio)
    .filter(([, item]) => dead.has(item.trackUrl))
    .map(([key]) => key);
}

/** Yoto lost these recordings: forget them, so a resumed send prepares those tracks again. */
export function withoutTracks(send: PendingSend, keys: readonly string[]): PendingSend {
  if (!keys.some((key) => Object.prototype.hasOwnProperty.call(send.audio, key))) return send;
  const audio = { ...send.audio };
  for (const key of keys) delete audio[key];
  return { ...send, audio };
}

export function withScratch(send: PendingSend, cardId: string): PendingSend {
  if (send.scratch.includes(cardId)) return send;
  return { ...send, scratch: [...send.scratch, cardId] };
}

export function withoutScratch(send: PendingSend, cardIds: readonly string[]): PendingSend {
  return { ...send, scratch: send.scratch.filter((id) => !cardIds.includes(id)) };
}

export function withCover(send: PendingSend, cover: string | undefined): PendingSend {
  return { ...send, cover: cover ?? null };
}

/** Tracks and cover belong to one playlist, so they start again with the next. */
function nextPlaylist(send: PendingSend): PendingSend {
  const next = { ...send, audio: {} };
  delete next.cover;
  return next;
}

/** Make the next numbered playlist of a bulk send the one being recorded. */
export function withCurrent(send: PendingSend, current: PendingPlaylist): PendingSend {
  const bulk = send.bulk
    ? { ...send.bulk, remaining: send.bulk.remaining.filter((id) => id !== current.playlistId) }
    : null;
  return nextPlaylist({ ...send, current, bulk });
}

/** The current playlist is in the library. Clear it so the next one can start. */
export function withPlaylistSent(send: PendingSend): PendingSend {
  const created = send.current?.libraryTitle;
  const bulk = send.bulk && created ? { ...send.bulk, created: [...send.bulk.created, created] } : send.bulk;
  return nextPlaylist({ ...send, current: null, bulk });
}

export function withFailure(send: PendingSend, message: string): PendingSend {
  return { ...send, failed: message };
}

export function withoutFailure(send: PendingSend): PendingSend {
  const next = { ...send };
  delete next.failed;
  return next;
}

export function withDexNote(send: PendingSend, dexNote: string): PendingSend {
  if (!send.bulk || !dexNote) return send;
  return { ...send, bulk: { ...send.bulk, dexNote } };
}

/** Tracks of the current playlist that still need recording. */
export function unfinishedJobs(send: PendingSend): RenderJob[] {
  return (send.current?.jobs ?? []).filter((job) => !send.audio[job.key]);
}

export function finishedTrackCount(send: PendingSend): number {
  return (send.current?.jobs ?? []).filter((job) => send.audio[job.key]).length;
}

export function isSendDone(send: PendingSend): boolean {
  return send.current === null && (send.bulk?.remaining.length ?? 0) === 0;
}

type SendLock = { owner: string; beat: number };

function readLock(raw: string | null): SendLock | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (isRecord(value) && typeof value.owner === "string" && typeof value.beat === "number") {
      return { owner: value.owner, beat: value.beat };
    }
  } catch {
    // A broken lock is no lock.
  }
  return null;
}

/** True when this tab may drive the send: no lock, its own lock, or one whose tab went quiet. */
export function sendLockFree(raw: string | null, owner: string, now: number): boolean {
  const lock = readLock(raw);
  return !lock || lock.owner === owner || now - lock.beat > SEND_LOCK_STALE_MS;
}

export function sendLockValue(owner: string, now: number): string {
  return JSON.stringify({ owner, beat: now } satisfies SendLock);
}
