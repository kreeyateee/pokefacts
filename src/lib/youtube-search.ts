import path from "node:path";

import { readJsonObject, updateJsonObject } from "@/lib/json-cache";
import { isYoutubeVideoId, youtubeWatchUrl } from "@/lib/youtube-link";
import { ytdlpOutput } from "@/lib/youtube-mp3";

const CACHE_FILE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "music-youtube.json");
const SEARCH_FIELD = "\u001f";

export type YoutubeSearchHit = {
  id: string;
  channel: string;
  title: string;
};

const SKIP =
  /\b(nightcore|cover|remix|karaoke|slowed|sped up|hour loop|10 hours|react|8 bit|8-bit|chiptune|chip tune)\b/i;

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Search words for a soundtrack title. The Pokémon name keeps official uploads near the top. */
export function youtubeSearchQuery(title: string): string {
  const cleaned = title
    .replace(/\s*\((?:song|music video|official)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `Pokémon ${cleaned}`.trim();
}

export function youtubeSearchArgs(query: string): string[] {
  return [
    "--no-warnings",
    "--no-playlist",
    "--flat-playlist",
    "--print",
    `%(id)s${SEARCH_FIELD}%(channel)s${SEARCH_FIELD}%(title)s`,
    `ytsearch8:${query}`,
  ];
}

export function parseYoutubeSearchLines(stdout: string): YoutubeSearchHit[] {
  const hits: YoutubeSearchHit[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    const first = trimmed.indexOf(SEARCH_FIELD);
    const second = first >= 0 ? trimmed.indexOf(SEARCH_FIELD, first + 1) : -1;
    if (first < 1 || second < 0) continue;
    const id = trimmed.slice(0, first).trim();
    if (!isYoutubeVideoId(id)) continue;
    hits.push({
      id,
      channel: trimmed.slice(first + 1, second).trim(),
      title: trimmed.slice(second + 1).trim(),
    });
  }
  return hits;
}

/**
 * Prefer an official Pokémon upload whose title contains the song name.
 * Covers, remixes, and nightcore versions stay below a plain match.
 * Higher scores come first. An equal score keeps the earlier hit.
 */
export function rankYoutubeSearchHits(hits: readonly YoutubeSearchHit[], songTitle: string): string[] {
  const wanted = fold(songTitle.replace(/\s*\((?:song|music video|official)\)\s*/gi, " "));
  const words = wanted.split(" ").filter((word) => word.length > 2);
  if (!wanted || words.length === 0) return [];
  const ranked: { id: string; score: number; index: number }[] = [];
  hits.forEach((hit, index) => {
    const title = fold(hit.title);
    const channel = fold(hit.channel);
    if (!words.every((word) => title.includes(word))) return;
    let score = 1;
    if (channel.includes("pokemon")) score += 5;
    if (title.includes("official") || channel.includes("official")) score += 2;
    if (title.includes(wanted)) score += 2;
    if (SKIP.test(`${hit.title} ${hit.channel}`)) score -= 6;
    if (score > 0) ranked.push({ id: hit.id, score, index });
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.map((hit) => hit.id);
}

export function pickYoutubeSearchHit(hits: readonly YoutubeSearchHit[], songTitle: string): string | null {
  return rankYoutubeSearchHits(hits, songTitle)[0] ?? null;
}

/** First ranked upload that is not an id we already know is dead. */
export function replacementSearchId(
  hits: readonly YoutubeSearchHit[],
  songTitle: string,
  skip: readonly string[],
): string | null {
  const dead = new Set(skip);
  return rankYoutubeSearchHits(hits, songTitle).find((id) => !dead.has(id)) ?? null;
}

/**
 * yt-dlp says this watch page cannot be used.
 * A sign-in wall or a missing format is a different failure.
 */
export function isYoutubeVideoUnavailable(message: string): boolean {
  const text = message.toLowerCase();
  if (
    text.includes("sign in to confirm") ||
    text.includes("not a bot") ||
    text.includes("rate-limited") ||
    text.includes("try again later") ||
    text.includes("format is not available")
  ) {
    return false;
  }
  return (
    text.includes("this video is not available") ||
    text.includes("video unavailable") ||
    text.includes("not available in your country") ||
    text.includes("available in your country") ||
    text.includes("private video") ||
    text.includes("this video is private") ||
    text.includes("has been removed") ||
    text.includes("has been terminated") ||
    text.includes("watch page")
  );
}

export type CacheDecision =
  | { action: "use"; youtubeId: string }
  | { action: "probe"; youtubeId: string }
  | { action: "search" };

function cachedId(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const id = (row as { youtubeId?: unknown }).youtubeId;
  return typeof id === "string" && isYoutubeVideoId(id) ? id : null;
}

/**
 * A cached replacement is used before the dead Bulbapedia id is tried again.
 * A cached check of a working id skips another probe. Anything else is looked up.
 */
export function cachedYoutubeId(row: unknown, known: string | null): CacheDecision {
  const knownId = known && isYoutubeVideoId(known) ? known : null;
  const saved = cachedId(row);
  const record = row && typeof row === "object" ? (row as { replaced?: unknown; checked?: unknown }) : null;
  if (!knownId) return saved ? { action: "use", youtubeId: saved } : { action: "search" };
  if (record?.replaced === knownId && saved && saved !== knownId) return { action: "use", youtubeId: saved };
  if (record?.checked === knownId && saved === knownId) return { action: "use", youtubeId: knownId };
  return { action: "probe", youtubeId: knownId };
}

async function rememberSong(page: string, value: Record<string, unknown>): Promise<void> {
  await updateJsonObject(CACHE_FILE, page, value);
}

export async function youtubeVideoUsable(youtubeId: string): Promise<boolean> {
  if (!isYoutubeVideoId(youtubeId)) return false;
  try {
    const stdout = await ytdlpOutput(
      ["--no-warnings", "--no-playlist", "--skip-download", "--print", "%(id)s", youtubeWatchUrl(youtubeId)],
      90_000,
    );
    if (stdout.split(/\r?\n/).some((line) => line.trim() === youtubeId)) return true;
    throw new Error("yt-dlp did not confirm that video.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isYoutubeVideoUnavailable(message)) return false;
    throw error;
  }
}

async function rankedSearchIds(title: string): Promise<string[]> {
  const query = youtubeSearchQuery(title);
  if (!query || query === "Pokémon") return [];
  const stdout = await ytdlpOutput(youtubeSearchArgs(query), 45_000);
  return rankYoutubeSearchHits(parseYoutubeSearchLines(stdout), title);
}

export async function findYoutubeVideoId(title: string): Promise<string | null> {
  const ranked = await rankedSearchIds(title);
  return ranked[0] ?? null;
}

async function findWorkingReplacement(title: string, deadId: string): Promise<string | null> {
  const ranked = (await rankedSearchIds(title)).filter((id) => id !== deadId);
  let attempts = 0;
  for (const id of ranked) {
    attempts += 1;
    try {
      if (await youtubeVideoUsable(id)) return id;
    } catch {
      // This upload could not be checked. Try the next match instead of the dead id.
    }
    if (attempts >= 3) break;
  }
  return null;
}

/**
 * The id a lookup returns without running yt-dlp: the cached answer,
 * otherwise Bulbapedia's own id, otherwise nothing.
 */
export function storedYoutubeId(decision: CacheDecision): string | null {
  return decision.action === "search" ? null : decision.youtubeId;
}

/**
 * Bulbapedia's id when that video can still be played.
 * A removed, private, or region-blocked id is replaced by a searched upload and cached.
 * Songs with no id use the cached search, then a fresh search.
 * Without `local` (see localToolsAllowed) nothing is probed or searched.
 */
export async function youtubeIdForSong(
  page: string,
  title: string,
  known: string | null,
  options: { local: boolean },
): Promise<string | null> {
  const cache = await readJsonObject(CACHE_FILE);
  const decision = cachedYoutubeId(cache[page], known);
  if (decision.action === "use" || !options.local) return storedYoutubeId(decision);
  const fetchedAt = new Date().toISOString();
  if (decision.action === "search") {
    const id = await findYoutubeVideoId(title);
    if (id) await rememberSong(page, { youtubeId: id, title, fetchedAt });
    return id;
  }
  const knownId = decision.youtubeId;
  let usable = false;
  try {
    usable = await youtubeVideoUsable(knownId);
  } catch {
    return knownId;
  }
  if (usable) {
    await rememberSong(page, { youtubeId: knownId, checked: knownId, title, fetchedAt });
    return knownId;
  }
  const replacement = await findWorkingReplacement(title, knownId);
  if (replacement) {
    await rememberSong(page, { youtubeId: replacement, replaced: knownId, title, fetchedAt });
  }
  return replacement;
}
