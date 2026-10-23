import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFactSpeech } from "@/lib/bulbapedia";
import { getCatalogueEntry, listMonSheets } from "@/lib/catalogue-db";
import { sayableName } from "@/lib/story/adventure-route";
import { episodeDescription, episodeTitle, isEpisodeDate, newestFirst, type EpisodeMeta } from "@/lib/radio/radio-feed";
import { RADIO_LINE_IDS, RADIO_LINES, type RadioLineId } from "@/lib/radio/radio-lines";
import { planDexIds, planEpisode, type EpisodePlan, type SavedTake } from "@/lib/radio/radio-plan";
import { renderEpisode } from "@/lib/radio/radio-render";
import { flat, radioScripts, type RadioKind, type RadioScripts } from "@/lib/radio/radio-scripts";
import { YOTO_VOICES } from "@/lib/yoto-icons";
import { ensureCry, speechKey } from "@/lib/yoto-fact-audio";

const DATA = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
export const RADIO_ROOT = path.join(/* turbopackIgnore: true */ DATA, "radio");
const SPEECH_ROOT = path.join(/* turbopackIgnore: true */ DATA, "speech");
const SOUNDS_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "sounds");

/** A new episode each day at midnight here, where Pokefacts is made. */
export const RADIO_TIME_ZONE = "Australia/Melbourne";

/** Episodes kept in the feed. Older ones are deleted. */
export const RADIO_KEEP = 60;

/** Pokémon heard in this many recent episodes wait their turn. */
const RECENT_EPISODES = 45;

/** Today's date where the radio is made, YYYY-MM-DD. */
export function radioDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RADIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function episodeFile(date: string, ext: "mp3" | "json", root = RADIO_ROOT): string {
  if (!isEpisodeDate(date)) throw new Error("That is not an episode date.");
  return path.join(/* turbopackIgnore: true */ root, `${date}.${ext}`);
}

function isMeta(value: unknown): value is EpisodeMeta {
  const row = value as Partial<EpisodeMeta> | null;
  return (
    !!row &&
    typeof row.date === "string" &&
    isEpisodeDate(row.date) &&
    typeof row.title === "string" &&
    typeof row.description === "string" &&
    typeof row.bytes === "number" &&
    typeof row.seconds === "number" &&
    Array.isArray(row.dexIds) &&
    typeof row.made === "string"
  );
}

/** Every saved episode, newest first. */
export async function listEpisodes(root = RADIO_ROOT): Promise<EpisodeMeta[]> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const episodes: EpisodeMeta[] = [];
  for (const name of names) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    try {
      const meta: unknown = JSON.parse(await readFile(path.join(/* turbopackIgnore: true */ root, name), "utf8"));
      if (isMeta(meta)) episodes.push(meta);
    } catch {
      // A half-written or broken file is skipped; the episode is made again next time.
    }
  }
  return newestFirst(episodes);
}

/** The scripts every card sends, built once per server start. Fact readings come from the saved wiki copy only. */
let scripts: Promise<RadioScripts> | null = null;

function cardScripts(): Promise<RadioScripts> {
  scripts ??= (async () => {
    const sheets = listMonSheets();
    const offline = (() => Promise.reject(new Error("Pokefacts Radio reads the saved wiki copy only."))) as typeof fetch;
    const factSpeech: Record<number, string> = {};
    for (const sheet of sheets) {
      const entry = getCatalogueEntry(sheet.id);
      if (!entry) continue;
      factSpeech[sheet.id] = (await loadFactSpeech(entry.name, entry.id, entry.info, { fetchImpl: offline })).speech;
    }
    return radioScripts(sheets, factSpeech);
  })().catch((error: unknown) => {
    scripts = null;
    throw error;
  });
  return scripts;
}

/** Where saved Yoto-voice recordings of each line are, by voice. The first matching script wins for a voice. */
export function savedTakes(texts: readonly string[], saved: ReadonlySet<string>): SavedTake[] {
  const takes: SavedTake[] = [];
  for (const voice of YOTO_VOICES) {
    for (const text of texts) {
      const file = `${speechKey(text, voice.id)}.mp3`;
      if (saved.has(file)) {
        takes.push({ voiceId: voice.id, file });
        break;
      }
    }
  }
  return takes;
}

/** The host line's file in one voice. */
export function hostLineFile(id: RadioLineId, voiceId: string): string {
  return `${speechKey(flat(RADIO_LINES[id]), voiceId)}.mp3`;
}

/** Voices that have every host line saved. */
export function hostVoices(saved: ReadonlySet<string>): string[] {
  return YOTO_VOICES.filter((voice) => RADIO_LINE_IDS.every((id) => saved.has(hostLineFile(id, voice.id)))).map(
    (voice) => voice.id,
  );
}

function voiceName(voiceId: string): string {
  return YOTO_VOICES.find((voice) => voice.id === voiceId)?.name ?? "Pokefacts";
}

function pokemonName(dexId: number): string {
  const name = getCatalogueEntry(dexId)?.name;
  return name ? sayableName(name) : `Number ${dexId}`;
}

/** Plans the day from the recordings saved right now. Null when there is nothing to play yet. */
export async function planDay(date: string, speechRoot = SPEECH_ROOT, root = RADIO_ROOT): Promise<EpisodePlan | null> {
  const saved = new Set(await readdir(speechRoot).catch(() => [] as string[]));
  const byDex = await cardScripts();
  const recent = new Set(
    (await listEpisodes(root))
      .filter((episode) => episode.date < date)
      .slice(0, RECENT_EPISODES)
      .flatMap((episode) => episode.dexIds),
  );
  return planEpisode({
    date,
    dexIds: [...byDex.keys()],
    takes: (dexId: number, kind: RadioKind) => savedTakes(byDex.get(dexId)?.[kind] ?? [], saved),
    hostVoices: hostVoices(saved),
    recent,
  });
}

async function writeAtomic(file: string, bytes: Buffer | string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}

async function makeEpisode(date: string): Promise<EpisodeMeta | null> {
  const plan = await planDay(date);
  if (!plan) return null;
  const speech = (file: string) => readFile(path.join(/* turbopackIgnore: true */ SPEECH_ROOT, file));
  const { mp3, seconds } = await renderEpisode(plan, {
    speech,
    cry: (dexId) => ensureCry(dexId),
    sound: (name) => readFile(path.join(/* turbopackIgnore: true */ SOUNDS_ROOT, name)),
    hostLine: async (id) => (plan.host ? speech(hostLineFile(id, plan.host)).catch(() => null) : null),
  });
  const voices = [plan.host, plan.fact.voiceId, plan.guess?.clues.voiceId, plan.joke?.voiceId].filter(
    (voice): voice is string => Boolean(voice),
  );
  const meta: EpisodeMeta = {
    date,
    title: episodeTitle(date, pokemonName(plan.fact.dexId)),
    description: episodeDescription({
      factName: pokemonName(plan.fact.dexId),
      guess: Boolean(plan.guess),
      jokeName: plan.joke ? pokemonName(plan.joke.dexId) : undefined,
      voiceNames: voices.map(voiceName),
    }),
    bytes: mp3.length,
    seconds,
    dexIds: planDexIds(plan),
    made: new Date().toISOString(),
  };
  // The MP3 first: an episode is listed only once its audio is in place.
  await writeAtomic(episodeFile(date, "mp3"), mp3);
  await writeAtomic(episodeFile(date, "json"), JSON.stringify(meta, null, 2));
  await pruneEpisodes();
  return meta;
}

/** Deletes all but the newest RADIO_KEEP episodes. */
export async function pruneEpisodes(root = RADIO_ROOT, keep = RADIO_KEEP): Promise<void> {
  const episodes = await listEpisodes(root);
  for (const old of episodes.slice(keep)) {
    await rm(episodeFile(old.date, "json", root), { force: true });
    await rm(episodeFile(old.date, "mp3", root), { force: true });
  }
}

/** One episode is made at a time, and a day being made is shared by everyone who asks for it. */
const making = new Map<string, Promise<EpisodeMeta | null>>();

/** The day's episode, made from saved recordings the first time anyone asks for it. */
export async function ensureEpisode(date: string): Promise<EpisodeMeta | null> {
  const existing = (await listEpisodes()).find((episode) => episode.date === date);
  if (existing) return existing;
  let job = making.get(date);
  if (!job) {
    job = makeEpisode(date).finally(() => making.delete(date));
    making.set(date, job);
  }
  return job;
}
