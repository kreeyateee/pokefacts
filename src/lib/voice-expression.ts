import { hasVoiceTags } from "@/lib/voice-tags";

/**
 * Where the Yoto voices add expression to the Pokefacts scripts. The tags are ElevenLabs v3 audio tags
 * written in braces (see voice-tags.ts). Piper, browser voices and the page never see them.
 *
 * A script gets one to three tags at natural moments: the name, a surprising line, the reveal.
 * The choice is drawn from small sets by the Pokémon's number, so a 100-track card does not sound
 * samey, and the same Pokémon always gets the same script, so recordings stay cached.
 */

/** What picks the delivery. A form uses its form id so it does not copy its species. */
export type VoiceSeat = { dexId?: number; formId?: number; types?: readonly string[] };

/** How the name is said at the start of a fact. */
const FACT_OPENERS = ["excited", "cheerfully", "happy", "curious", "excited", "cheerfully"] as const;

/** A Ghost type is introduced in a whisper, then the voice comes back for the facts. */
const AFTER_WHISPER = ["curious", "cheerfully"] as const;

/** Before the line most likely to make a child go "wow". */
const WOW_TAGS = ["surprised", "gasps", "excited", "curious"] as const;

/** The first Who's That clue. The last clue is always whispered, and the countdown is excited. */
const CLUE_OPENERS = ["curious", "curious", "cheerfully"] as const;

/** The Who's That reveal. */
const REVEALS = ["excited", "gasps", "excited", "happy", "excited"] as const;

/**
 * Words that mark a fact worth a gasp: size, power, rarity, legend. A sentence with one of these wins.
 * Plain "can" is left out because nearly every line has it.
 */
const WOW =
  /\b(?:enough(?: \w+)? to|capable of|so (?:strong|powerful|fast|hot|cold|big|heavy|loud|sharp)|even|legends?|legendary|myths?|mythical|said to|believed|rumou?red|thousands?|millions?|hundreds of|tons?|tonnes?|fastest|strongest|largest|biggest|smallest|heaviest|lightest|tallest|loudest|hottest|coldest|most powerful|explod\w*|volcan\w*|meteor\w*|outer space|universe|incredibl[ey]|amazing|astonishing|immense|enormous|gigantic|tremendous)\b/i;

/** Weaker hints, used when no sentence has a strong one. */
const MAYBE_WOW = /\b(?:able to|only|never|rare|rarely|ancient|survive\w*|without)\b/i;

/** Abbreviations that end in a full stop but do not end a sentence. "Mr. Mime" is one name. */
const NOT_AN_END = /(?:\b(?:Mr|Mrs|Ms|Jr|Sr|Dr|Prof|St|vs|etc|No)|\b[A-Z])\.$/;

/** A small integer hash so neighbouring numbers draw different tags. */
function mix(seed: number, salt: number): number {
  let value = (Math.trunc(seed) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function pick<T>(items: readonly T[], seed: number, salt: number): T {
  return items[mix(seed, salt) % items.length] as T;
}

/** A stable number for a script with no Pokémon behind it. */
function textSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seedFor(seat: VoiceSeat, script: string): number {
  return seat.formId ?? seat.dexId ?? textSeed(script);
}

/** Where each sentence starts. A tag goes only at one of these, never inside a word or a name. */
function sentenceStarts(script: string): number[] {
  const starts: number[] = [];
  const first = script.search(/\S/);
  if (first < 0) return starts;
  starts.push(first);
  const boundary = /([.!?]["'”’)]?)(\s+)(?=["'“‘(]?[A-Z0-9])/g;
  for (const match of script.matchAll(boundary)) {
    const end = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (NOT_AN_END.test(script.slice(Math.max(0, end - 6), end))) continue;
    starts.push(end + (match[2]?.length ?? 0));
  }
  return starts;
}

/** A tag and the offset of the sentence or line it goes in front of. */
type TagAt = { at: number; tag: string };

/** Puts each tag in front of the text at its offset. The words themselves are left exactly as they were. */
function insertTags(script: string, tags: TagAt[]): string {
  const ordered = [...tags].sort((left, right) => right.at - left.at);
  let out = script;
  for (const { at, tag } of ordered) {
    out = `${out.slice(0, at)}{${tag}} ${out.slice(at)}`;
  }
  return out;
}

/**
 * A fact track: "Pikachu. Pikachu is a small mouse..." The name gets an opening tag,
 * and the first striking line after the opening gets a second one.
 */
export function expressFact(script: string, seat: VoiceSeat = {}): string {
  if (!script.trim() || hasVoiceTags(script)) return script;
  const seed = seedFor(seat, script);
  const starts = sentenceStarts(script);
  const ghost = (seat.types ?? []).some((type) => type.toLowerCase() === "ghost");
  const opener = ghost ? "whispers" : pick(FACT_OPENERS, seed, 1);
  const tags: TagAt[] = [{ at: starts[0] ?? 0, tag: opener }];
  if (ghost && starts[1] !== undefined) tags.push({ at: starts[1], tag: pick(AFTER_WHISPER, seed, 2) });
  // The name and the line after it are left alone. The surprise is the first later sentence with a strong word,
  // or failing that a weaker one.
  const later = starts.slice(2).map((at, index) => ({
    at,
    sentence: script.slice(at, starts[index + 3] ?? script.length),
  }));
  const wow = later.find((item) => WOW.test(item.sentence)) ?? later.find((item) => MAYBE_WOW.test(item.sentence));
  if (wow) tags.push({ at: wow.at, tag: pick(WOW_TAGS.filter((tag) => tag !== opener), seed, 3) });
  return insertTags(script, tags);
}

/**
 * A Who's That clue, one clue per line: a curious start, the last clue whispered,
 * then an excited countdown. Nothing is added that could give the name away.
 */
export function expressClues(script: string, seat: VoiceSeat = {}): string {
  if (!script.trim() || hasVoiceTags(script)) return script;
  const seed = seedFor(seat, script);
  const lines = script.split("\n");
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  const tags: TagAt[] = [{ at: offsets[0] ?? 0, tag: pick(CLUE_OPENERS, seed, 4) }];
  const last = lines.length - 1;
  const countdown = last >= 1 && /^Shout your guess\b/i.test(lines[last] ?? "");
  const finalClue = countdown ? last - 1 : last;
  if (finalClue >= 2) tags.push({ at: offsets[finalClue] as number, tag: "whispers" });
  if (countdown) tags.push({ at: offsets[last] as number, tag: "excited" });
  return insertTags(script, tags);
}

/** The Who's That answer: "It's Pikachu!" said with a gasp or with excitement. */
export function expressAnswer(script: string, seat: VoiceSeat = {}): string {
  if (!script.trim() || hasVoiceTags(script)) return script;
  return insertTags(script, [{ at: script.search(/\S/), tag: pick(REVEALS, seedFor(seat, script), 5) }]);
}

/** The how-to track at the start of a numbered card. */
export function expressIntro(script: string): string {
  if (!script.trim() || hasVoiceTags(script)) return script;
  const guess = /^\s*Who's That/i.test(script);
  const tags: TagAt[] = [{ at: script.search(/\S/), tag: guess ? "curious" : "excited" }];
  const turn = script.search(guess ? /\bSay the name\b/ : /\bNumber \d+ is\b/);
  if (turn > 0) tags.push({ at: turn, tag: guess ? "excited" : "cheerfully" });
  return insertTags(script, tags);
}

/** The how-to line in front of the first Pokémon on a random card. */
export function expressHowTo(script: string): string {
  if (!script.trim() || hasVoiceTags(script)) return script;
  return insertTags(script, [{ at: script.search(/\S/), tag: "excited" }]);
}

/** The script a Yoto voice reads for one kind of track. Unknown kinds, such as jokes, are left as written. */
export function expressTrack(key: string, script: string, seat: VoiceSeat = {}): string {
  if (key === "entry") return expressFact(script, seat);
  if (key === "clues") return expressClues(script, seat);
  if (key === "answer") return expressAnswer(script, seat);
  if (key === "how") return expressIntro(script);
  return script;
}
