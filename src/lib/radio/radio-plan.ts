import { drawSample, mulberry32 } from "@/lib/kid-cards";
import type { RadioKind } from "@/lib/radio/radio-scripts";

/** A saved recording: whose words, in which voice, and its file in the speech cache. */
export type SavedTake = { voiceId: string; file: string };

/** One recording picked for an episode. */
export type RadioPick = SavedTake & { dexId: number };

/** What one day's episode plays, in order: the host's lines when that voice has them all. */
export type EpisodePlan = {
  date: string;
  /** The host voice, when every host line is saved in it. Without one, music joins the parts. */
  host?: string;
  fact: RadioPick;
  guess?: { clues: RadioPick; answer: RadioPick };
  joke?: RadioPick;
};

export type PlanInput = {
  /** The day, as YYYY-MM-DD. The same day always plans the same episode. */
  date: string;
  /** The national Pokédex numbers to choose from. */
  dexIds: readonly number[];
  /** Saved takes of one Pokémon's line, in any voice. */
  takes: (dexId: number, kind: RadioKind) => SavedTake[];
  /** Voices with every host line saved. */
  hostVoices: readonly string[];
  /** Pokémon heard in recent episodes, kept out while others are left. */
  recent?: ReadonlySet<number>;
};

/** A stable number for a day: 2026-10-25 becomes 20261025. */
export function daySeed(date: string): number {
  return Number(date.replace(/\D/g, "")) || 1;
}

/** The day's order: everyone not heard recently first, each group shuffled by the day. */
function dayOrder(ids: readonly number[], recent: ReadonlySet<number>, random: () => number): number[] {
  const fresh = ids.filter((id) => !recent.has(id));
  const heard = ids.filter((id) => recent.has(id));
  return [...drawSample(fresh, fresh.length, random), ...drawSample(heard, heard.length, random)];
}

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T;
}

/**
 * Plans one day's Pokefacts Radio from saved recordings only: a Pokémon of the day, a Who's That with
 * its clues and answer in the same voice, and a joke about a third Pokémon. Null when no fact is saved yet.
 */
export function planEpisode(input: PlanInput): EpisodePlan | null {
  const random = mulberry32(daySeed(input.date));
  const recent = input.recent ?? new Set<number>();
  const order = dayOrder(input.dexIds, recent, random);
  const used = new Set<number>();

  let fact: RadioPick | undefined;
  for (const dexId of order) {
    const takes = input.takes(dexId, "entry");
    if (takes.length === 0) continue;
    fact = { dexId, ...pickOne(takes, random) };
    break;
  }
  if (!fact) return null;
  used.add(fact.dexId);

  let guess: EpisodePlan["guess"];
  for (const dexId of order) {
    if (used.has(dexId)) continue;
    const clues = input.takes(dexId, "clues");
    const answers = input.takes(dexId, "answer");
    const voices = clues.map((take) => take.voiceId).filter((voice) => answers.some((take) => take.voiceId === voice));
    if (voices.length === 0) continue;
    const voiceId = pickOne(voices, random);
    guess = {
      clues: { dexId, ...(clues.find((take) => take.voiceId === voiceId) as SavedTake) },
      answer: { dexId, ...(answers.find((take) => take.voiceId === voiceId) as SavedTake) },
    };
    used.add(dexId);
    break;
  }

  let joke: RadioPick | undefined;
  for (const dexId of order) {
    if (used.has(dexId)) continue;
    const takes = input.takes(dexId, "joke");
    if (takes.length === 0) continue;
    joke = { dexId, ...pickOne(takes, random) };
    break;
  }

  // The host is the fact's voice when it has every host line, so the episode opens in one voice.
  const host = input.hostVoices.includes(fact.voiceId)
    ? fact.voiceId
    : input.hostVoices.length > 0
      ? pickOne(input.hostVoices, random)
      : undefined;
  return { date: input.date, ...(host ? { host } : {}), fact, ...(guess ? { guess } : {}), ...(joke ? { joke } : {}) };
}

/** Every Pokémon an episode plays, for keeping them out of the next few days. */
export function planDexIds(plan: Pick<EpisodePlan, "fact" | "guess" | "joke">): number[] {
  return [plan.fact.dexId, plan.guess?.clues.dexId, plan.joke?.dexId].filter((id): id is number => typeof id === "number");
}
