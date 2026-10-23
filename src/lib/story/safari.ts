/**
 * Safari Zone: an expert choose-your-own-adventure card.
 *
 * Marigold the warden takes the child round six stops while Barnaby, the rival, stays one step ahead.
 * At each stop the child first finds the Pokémon (follow its type to the right place, or spot the rare
 * one of two), then picks the right throw: a Safari Ball for a common one, bait for a rare fast one,
 * a rock for a rare slow one. Every day goes round all five stops: the more get away, the humbler the
 * ending, and a perfect run opens a secret stop.
 *
 * The words are hand-written in safari-words.ts and safari-roster.ts. This file only picks which
 * Pokémon, which lines and which side each answer goes. `planSafari` does the picking from the catalogue;
 * `buildSafari` turns a plan into the story map, so it can be tested with a made-up species list.
 */
import { listMonSheets, listSafariSpecies } from "@/lib/catalogue-db";
import type { MonSheet } from "@/lib/dex-facts";
import { drawSample, mulberry32 } from "@/lib/kid-cards";
import { pronounce } from "@/lib/pronounce";
import { jokesFor, toldBy } from "@/lib/jokes";
import type { AdventureInput, Partner } from "@/lib/story/adventure-route";
import { FIELD_NOTES, GOLDEN_STOPS, type FieldNotes } from "@/lib/story/safari-roster";
import * as W from "@/lib/story/safari-words";
import type { StoryGraph, StoryIcon, StoryNode } from "@/lib/story/story-graph";
import { isStorySound, type StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";
import { isExpression } from "@/lib/voice-tags";
import { iconForType, YOTO_ICONS, YOTO_VOICES } from "@/lib/yoto-icons";

export const SAFARI_AREAS = [
  "cave",
  "forest",
  "grassland",
  "mountain",
  "rough-terrain",
  "sea",
  "urban",
  "waters-edge",
] as const;

export type SafariArea = (typeof SAFARI_AREAS)[number];

/** A species sheet with what the Safari needs: home, catch rate, Speed, and its field notes if it has any. */
export type SafariMon = MonSheet & { area: SafariArea; captureRate: number; speed: number; notes?: FieldNotes };

export type SafariThrow = "ball" | "bait" | "rock";

/**
 * Five stops, and every day goes round all of them. A card cannot count, so each stop is laid out once
 * for none, one, and two or more slips so far; with each throw and its result on one track, that is
 * what fits in a card's hundred tracks.
 */
export const SAFARI_STOPS = 5;

/** At or above this catch rate a Pokémon counts as common. */
export const COMMON_CATCH_RATE = 120;

/** At or above this Speed a rare Pokémon counts as fast. */
export const FAST_SPEED = 70;

/** A type sign only counts when at least this many Safari Pokémon of that type live in the right place. */
const HOME_AT_LEAST = 4;

function voiceNamed(name: (typeof YOTO_VOICES)[number]["name"]): string {
  return YOTO_VOICES.find((voice) => voice.name === name)?.id ?? YOTO_VOICES[0].id;
}

/**
 * Who speaks in the Safari. The narrator reads in the voice chosen in Settings. Marigold is older and
 * warm: Alice, or Matilda when Alice is narrating. Barnaby is young and pleased with himself: Liam, or
 * Will. With Piper, everyone shares one voice, so each gets a bigger pitch and speed shift instead.
 */
export const SAFARI_CAST: StoryCharacter[] = [
  {
    id: "marigold",
    name: "Marigold",
    pronoun: "she",
    voices: [voiceNamed("Alice"), voiceNamed("Matilda"), voiceNamed("Lily")],
    tempo: 0.97,
    piper: { pitch: -3, tempo: 0.92 },
  },
  {
    id: "barnaby",
    name: "Barnaby",
    pronoun: "he",
    voices: [voiceNamed("Liam"), voiceNamed("Will"), voiceNamed("Charlie")],
    tempo: 1.03,
    piper: { pitch: 2.5, tempo: 1.08 },
  },
];

/** The sound of each place, and the music that suits it. */
const PLACE_SOUND: Record<SafariArea, StoryBed> = {
  cave: { ambience: "cave", music: "mysterious" },
  forest: { ambience: "woods", music: "mysterious" },
  grassland: { ambience: "grass", music: "bright" },
  mountain: { ambience: "mountain", music: "adventure" },
  "rough-terrain": { ambience: "canyon", music: "adventure" },
  sea: { ambience: "sea", music: "calm" },
  urban: { ambience: "house", music: "homely" },
  "waters-edge": { ambience: "lake", music: "calm" },
};

/** On the path between places. */
const PATH_SOUND: StoryBed = { ambience: "gate", music: "adventure" };

/** The music turns tense whenever Barnaby is about. */
function underScene(bed: StoryBed, text: string): StoryBed {
  return /\bBarnaby\b/.test(text) ? { ...bed, music: "tense" } : bed;
}

/** The Poké Ball on the Yoto screen while the throw question plays. */
const POKEBALL: StoryIcon = { pixel: "pokeball" };
/** The result of a throw: a caught ball with sparkles, or a ball that has burst open. */
const CAUGHT: StoryIcon = { pixel: "pokeball-caught" };
const BROKE_FREE: StoryIcon = { pixel: "pokeball-broken" };

/** How many stops Barnaby turns up at, on the way in. */
const BARNABY_VISITS = 3;

// ---------------------------------------------------------------------------
// Spoken helpers

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** British number words: 190 is "one hundred and ninety". */
export function numberWords(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) {
    const rest = n % 10;
    const tens = TENS[Math.floor(n / 10)] ?? "";
    return rest ? `${tens} ${ONES[rest]}` : tens;
  }
  if (n < 1000) {
    const rest = n % 100;
    const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
    return rest ? `${hundreds} and ${numberWords(rest)}` : hundreds;
  }
  return String(n);
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The name as the narrator should say it: no gender symbols, respelled where the voice slips. */
export function spokenName(name: string): string {
  return pronounce(plainName(name));
}

function plainName(name: string): string {
  return name.replace(/\s*♀/g, " female").replace(/\s*♂/g, " male").trim();
}

/** "a Snorlax", "an Eevee". The card's speech step respells the name later. */
function withArticle(name: string): string {
  const plain = plainName(name);
  return `${/^[aeiou]/i.test(plain) ? "an" : "a"} ${plain}`;
}

/** "an orange one", "a grey one". */
function anOne(colour: string): string {
  return `${/^[aeiou]/i.test(colour) ? "an" : "a"} ${colour} one`;
}

/** Every way a name can be heard or written, for keeping names out of clues. */
export function nameVariants(name: string): string[] {
  return [...new Set([name, plainName(name), spokenName(name), name.replace(/[♀♂]/g, "").trim()])].filter(Boolean);
}

/**
 * Text for the ear: no digits, no stray symbols. Sound cues such as [catch], cries such as [cry:25] and
 * expression tags such as {whispers} are kept.
 */
function speakable(text: string): string {
  return text
    .split(/(\[\w+\]|\[cry:\d{1,4}\]|\{[a-z]+\})/)
    .map((piece) =>
      (/^\[\w+\]$/.test(piece) && isStorySound(piece.slice(1, -1))) ||
      /^\[cry:\d{1,4}\]$/.test(piece) ||
      (/^\{[a-z]+\}$/.test(piece) && isExpression(piece.slice(1, -1)))
        ? piece
        : piece
            .replace(/(\d+)/g, (digits) => numberWords(Number(digits)))
            .replace(/[&]/g, " and ")
            .replace(/[%#*_<>{}[\]|~^$@♀♂]/g, " "),
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function join(...parts: string[]): string {
  return speakable(parts.filter(Boolean).join(" "));
}

/** Fills {gaps} in a hand-written line. A gap with no value is a bug, so it throws. */
function fill(template: string, gaps: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = gaps[key];
    if (value === undefined) {
      // An expression tag ({whispers}) is for the voice, and stays as it is.
      if (isExpression(key)) return `{${key}}`;
      throw new Error(`The Safari line "${template}" needs {${key}}.`);
    }
    return value;
  });
}

// ---------------------------------------------------------------------------
// The throwing rules

/** The warden's rule: common gets a ball, rare and fast gets bait, rare and slow gets a rock. */
export function throwFor(mon: Pick<SafariMon, "captureRate" | "speed">): SafariThrow {
  if (mon.captureRate >= COMMON_CATCH_RATE) return "ball";
  return mon.speed >= FAST_SPEED ? "bait" : "rock";
}

/**
 * Stop Pokémon sit well clear of the rule's edges, so an expert can always tell.
 * A common one also has to be clearly fast or clearly slow, so how it moves never gives it away.
 */
function clearThrow(mon: SafariMon): SafariThrow | null {
  if (mon.captureRate >= 150) return pace(mon) ? "ball" : null;
  if (mon.captureRate <= 90 && mon.speed >= 80) return "bait";
  if (mon.captureRate <= 90 && mon.speed <= 60) return "rock";
  return null;
}

function pace(mon: Pick<SafariMon, "speed">): "fast" | "slow" | null {
  if (mon.speed >= 80) return "fast";
  if (mon.speed <= 60) return "slow";
  return null;
}

// ---------------------------------------------------------------------------
// Planning: which Pokémon, which places, which side

/** How many Safari Pokémon of each type live in each place. */
export type HabitatCounts = Map<string, Map<SafariArea, number>>;

function habitatCounts(pool: readonly SafariMon[]): HabitatCounts {
  const counts: HabitatCounts = new Map();
  for (const mon of pool) {
    for (const type of mon.types) {
      const row = counts.get(type) ?? new Map<SafariArea, number>();
      row.set(mon.area, (row.get(mon.area) ?? 0) + 1);
      counts.set(type, row);
    }
  }
  return counts;
}

function typeCount(counts: HabitatCounts, type: string, area: SafariArea): number {
  return counts.get(type)?.get(area) ?? 0;
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("Nothing to pick from.");
  return item;
}

/** The type sign to follow and a place none of its types live, or null when the type is no fair clue. */
export type AreaClue = { type: string; decoy: SafariArea };

function areaClue(mon: SafariMon, counts: HabitatCounts, random: () => number): AreaClue | null {
  const nowhere = (area: SafariArea) => mon.types.every((type) => typeCount(counts, type, area) === 0);
  for (const type of mon.types) {
    const sign = W.TYPE_SIGNS[type];
    if (!sign || typeCount(counts, type, mon.area) < HOME_AT_LEAST) continue;
    const decoys = sign.never.filter((area) => area !== mon.area && nowhere(area));
    if (decoys.length > 0) return { type, decoy: pick(decoys, random) };
  }
  return null;
}

export type AreaStop = { kind: "area"; mon: SafariMon; clue: AreaClue; homeLeft: boolean };

export type SpotStop = {
  kind: "spot";
  mon: SafariMon;
  /** The common one beside it. */
  common: SafariMon;
  /** The rare one is on the left. */
  rareLeft: boolean;
};

type Throws = {
  wrongThrow: SafariThrow;
  /** The right throw is the left button. */
  throwLeft: boolean;
};

export type SafariStop = (AreaStop | SpotStop) & Throws;

export type GoldenStop = Throws & {
  mon: SafariMon;
  /** Where it leaves its sign, and the wrong place to look. */
  sign: string;
  decoy: SafariArea;
  homeLeft: boolean;
};

export type SafariPlan = {
  seed: number;
  owner: string;
  stops: SafariStop[];
  golden: GoldenStop;
  /** Stop numbers, from 1, where Barnaby turns up. */
  barnaby: number[];
  /** The child's partner Pokémon, who walks round with them. Never one of the Pokémon to catch. */
  partner?: Partner;
};

function relatives(mon: MonSheet): string[] {
  return [mon.name, mon.evolvesFrom ?? "", ...(mon.evolvesInto ?? [])].filter(Boolean);
}

function wrongThrowFor(mon: SafariMon, random: () => number): SafariThrow {
  const right = throwFor(mon);
  return pick(
    (["ball", "bait", "rock"] as const).filter((choice) => choice !== right),
    random,
  );
}

function isArea(value: string): value is SafariArea {
  return (SAFARI_AREAS as readonly string[]).includes(value);
}

/** Chooses the Pokémon and the layout for one adventure. Same pool and seed, same plan. */
export function planSafari(pool: readonly SafariMon[], seed: number, owner = "", partner?: Partner): SafariPlan {
  if (partner) return { ...planSafari(pool.filter((mon) => mon.id !== partner.id), seed, owner), partner };
  const random = mulberry32(seed);
  const counts = habitatCounts(pool.filter((mon) => isArea(mon.area)));
  const eligible = pool.filter((mon) => isArea(mon.area) && mon.notes);
  const used = new Set<string>();
  const usedAreas = new Set<SafariArea>();
  const take = (mon: SafariMon) => {
    for (const name of relatives(mon)) used.add(name);
    usedAreas.add(mon.area);
  };
  const free = (mon: SafariMon) => relatives(mon).every((name) => !used.has(name));

  const golden = planGolden(eligible, counts, random);
  for (const name of relatives(golden.mon)) used.add(name);

  const kinds = drawSample(
    ["area", "area", "area", "spot", "spot", "spot"] as const,
    SAFARI_STOPS,
    random,
  );
  const areaThrows = drawSample(["ball", "bait", "rock"] as const, 3, random);
  const spotThrows = drawSample(["bait", "rock", random() < 0.5 ? "bait" : "rock"] as const, 3, random);

  /** Prefer a place not visited yet, then anywhere. */
  const preferFresh = (items: SafariMon[]) => {
    const fresh = items.filter((item) => !usedAreas.has(item.area));
    return fresh.length > 0 ? fresh : items;
  };

  const areaStop = (wanted: SafariThrow): AreaStop | null => {
    for (const only of [true, false]) {
      const options = eligible.filter((mon) => {
        const clear = clearThrow(mon);
        return free(mon) && clear !== null && (!only || clear === wanted);
      });
      const fresh = preferFresh(options);
      for (const mon of drawSample(fresh, fresh.length, random)) {
        const clue = areaClue(mon, counts, random);
        if (!clue) continue;
        take(mon);
        return { kind: "area", mon, clue, homeLeft: random() < 0.5 };
      }
    }
    return null;
  };

  const commonsBeside = (rare: SafariMon) =>
    eligible.filter(
      (mon) =>
        mon.area === rare.area &&
        mon.captureRate >= 150 &&
        mon.notes?.colour !== rare.notes?.colour &&
        free(mon) &&
        !relatives(rare).includes(mon.name),
    );

  const spotStop = (wanted: SafariThrow): SpotStop | null => {
    for (const only of [true, false]) {
      const rares = eligible.filter((mon) => {
        const clear = clearThrow(mon);
        return (
          free(mon) && clear !== null && clear !== "ball" && (!only || clear === wanted) && commonsBeside(mon).length > 0
        );
      });
      const mon = drawSample(preferFresh(rares), 1, random)[0];
      if (!mon) continue;
      const common = pick(commonsBeside(mon), random);
      take(mon);
      take(common);
      return { kind: "spot", mon, common, rareLeft: random() < 0.5 };
    }
    return null;
  };

  const stops: SafariStop[] = [];
  let areaIndex = 0;
  let spotIndex = 0;
  for (const kind of kinds) {
    const stop =
      kind === "spot"
        ? (spotStop(spotThrows[spotIndex++] ?? "bait") ?? areaStop(areaThrows[areaIndex % 3] ?? "ball"))
        : (areaStop(areaThrows[areaIndex++] ?? "ball") ?? spotStop(spotThrows[spotIndex % 3] ?? "rock"));
    if (!stop) throw new Error("There are not enough Safari Pokémon for six stops.");
    stops.push({ ...stop, wrongThrow: wrongThrowFor(stop.mon, random), throwLeft: random() < 0.5 });
  }

  const everyStop = Array.from({ length: SAFARI_STOPS }, (_, index) => index + 1);
  const barnaby = drawSample(everyStop, BARNABY_VISITS, random).sort((a, b) => a - b);
  return { seed, owner: cleanOwner(owner), stops, golden, barnaby };
}

/** One of the classic rarities, with its hand-written sign. Without one, the rarest Pokémon with a fair type sign. */
function planGolden(eligible: readonly SafariMon[], counts: HabitatCounts, random: () => number): GoldenStop {
  const throws = (mon: SafariMon) => ({ wrongThrow: wrongThrowFor(mon, random), throwLeft: random() < 0.5 });
  const classic = eligible.filter((mon) => {
    const stop = GOLDEN_STOPS[mon.id];
    return stop && isArea(stop.decoy) && stop.decoy !== mon.area && mon.captureRate <= 45 && clearThrow(mon) !== null;
  });
  if (classic.length > 0) {
    const mon = pick(classic, random);
    const stop = GOLDEN_STOPS[mon.id] as { sign: string; decoy: SafariArea };
    return { mon, sign: stop.sign, decoy: stop.decoy, homeLeft: random() < 0.5, ...throws(mon) };
  }
  const rarest = [...eligible]
    .filter((mon) => clearThrow(mon) === "bait" || clearThrow(mon) === "rock")
    .sort((a, b) => a.captureRate - b.captureRate || a.id - b.id);
  for (const mon of rarest) {
    const clue = areaClue(mon, counts, random);
    if (!clue) continue;
    const sign = W.TYPE_SIGNS[clue.type]?.signs[0] ?? "";
    return { mon, sign, decoy: clue.decoy, homeLeft: random() < 0.5, ...throws(mon) };
  }
  throw new Error("The secret stop has no Pokémon.");
}

/** Letters, spaces, hyphens and apostrophes, at most 40 characters. Anything else is dropped. */
export function cleanOwner(owner: string | null | undefined): string {
  const trimmed = (owner ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 40) return "";
  return new RegExp("^\\p{L}[\\p{L} '’-]*$", "u").test(trimmed) ? trimmed : "";
}

// ---------------------------------------------------------------------------
// Building the story map

const ID = {
  find: (stop: number, slips: number) => `s${stop}a${slips}`,
  missed: (stop: number, slips: number) => `s${stop}w${slips}`,
  meet: (stop: number, slips: number) => `s${stop}b${slips}`,
  fled: (stop: number, slips: number) => `s${stop}f${slips}`,
  caught: (stop: number, slips: number) => `s${stop}c${slips}`,
  ending: (number: number) => `end${number}`,
};

const GOLD = { find: "gold", missed: "goldw", meet: "goldb", fled: "goldf", caught: "goldc" };

/** Slips are counted up to this. Two or more all come to the same ending, and the day always goes on. */
export const MOST_SLIPS = 2;

const shadow = (dexId: number): StoryIcon => ({ dexId, shadow: true });
const picture = (dexId: number): StoryIcon => ({ dexId });

/** Draws lines from a pool without repeating one until the pool runs out. */
function deck<T>(items: readonly T[], random: () => number): () => T {
  let left: T[] = [];
  return () => {
    if (left.length === 0) left = drawSample(items, items.length, random);
    return left.pop() as T;
  };
}

/** One deck per pool, so a line is heard at most once on a path wherever the pool allows. */
function decks(random: () => number) {
  const byArea = <K extends "arrive" | "empty">(key: K) =>
    Object.fromEntries(SAFARI_AREAS.map((area) => [area, deck(W.AREAS[area][key], random)])) as Record<
      SafariArea,
      () => string
    >;
  const byThrow = (pools: Record<SafariThrow, readonly string[]>) => ({
    ball: deck(pools.ball, random),
    bait: deck(pools.bait, random),
    rock: deck(pools.rock, random),
  });
  const fled = Object.fromEntries(
    Object.entries(W.FLED_LINES).map(([key, lines]) => [key, deck(lines, random)]),
  ) as Record<W.WrongThrow, () => string>;
  const tally = Object.fromEntries(
    Object.entries(W.TALLY_LINES).map(([key, lines]) => [key, deck(lines, random)]),
  ) as Record<string, () => string>;
  const sign = Object.fromEntries(
    Object.entries(W.TYPE_SIGNS).map(([type, { signs }]) => [type, deck(signs, random)]),
  ) as Record<string, () => string>;
  return {
    arrive: byArea("arrive"),
    empty: byArea("empty"),
    sign,
    first: deck(W.FIRST_OPENERS, random),
    middle: deck(W.MIDDLE_OPENERS, random),
    last: deck(W.LAST_OPENERS, random),
    oneSlip: deck(W.ONE_SLIP_OPENERS, random),
    twoSlips: deck(W.TWO_SLIP_OPENERS, random),
    barnaby: deck(W.BARNABY_LINES, random),
    where: deck(W.WHERE_LINES, random),
    spot: deck(W.SPOT_LINES, random),
    spotAsk: deck(W.SPOT_ASK, random),
    found: deck(W.FOUND_LINES, random),
    spotted: deck(W.SPOTTED_LINES, random),
    ask: deck(W.THROW_ASK, random),
    fast: deck(W.FAST_LINES, random),
    slow: deck(W.SLOW_LINES, random),
    caught: byThrow(W.CAUGHT_LINES),
    fled,
    rightThrow: byThrow(W.RIGHT_THROW_LINES),
    gone: deck(W.GONE_LINES, random),
    home: deck(W.HOME_LINES, random),
    common: deck(W.COMMON_LINES, random),
    rareGone: deck(W.RARE_GONE_LINES, random),
    firstSlip: deck(W.FIRST_SLIP_LINES, random),
    secondSlip: deck(W.SECOND_SLIP_LINES, random),
    lastSlip: deck(W.LAST_SLIP_LINES, random),
    tally,
    tip: deck(W.PARTING_TIPS, random),
    moreCaught: deck(W.MORE_CATCH_LINES, random),
  };
}

type Decks = ReturnType<typeof decks>;

function notesOf(mon: SafariMon): FieldNotes {
  if (!mon.notes) throw new Error(`${mon.name} has no Safari field notes.`);
  return mon.notes;
}

function placeGaps(home: SafariArea) {
  return {
    home: W.AREAS[home].place,
    homeAt: W.AREAS[home].at,
    Home: capital(W.AREAS[home].place),
    HomeAt: capital(W.AREAS[home].at),
  };
}

function bothPlaceGaps(home: SafariArea, decoy: SafariArea) {
  return {
    ...placeGaps(home),
    decoy: W.AREAS[decoy].place,
    decoyAt: W.AREAS[decoy].at,
    Decoy: capital(W.AREAS[decoy].place),
  };
}

function paceLine(mon: SafariMon, words: Decks): string {
  const speed = pace(mon);
  return speed === "fast" ? words.fast() : speed === "slow" ? words.slow() : "";
}

function revealed(mon: SafariMon, caught: boolean): string {
  const name = withArticle(mon.name);
  return `${caught ? `It's ${name}!` : `It was ${name}.`} ${notesOf(mon).fact}`;
}

/** The words for one stop, drawn once and shared by both slip versions of it. */
type StopWords = {
  find: string;
  findIcon: StoryIcon;
  findCry?: number;
  /** Left and right labels for the find choice, as [right answer, wrong answer]. */
  labels: [string, string];
  missed: string;
  meet: string;
  /** The throw that fails, on the broken-ball picture. */
  fled: string;
  /** Who it was, on its own picture. */
  fledReveal: string;
  /** The catch, on the caught-ball picture. */
  caught: string;
  /** Who it is, on its own picture, after its cry. */
  caughtReveal: string;
};

function opener(number: number, words: Decks): string {
  if (number === 1) return words.first();
  if (number === SAFARI_STOPS) return words.last();
  return words.middle();
}

function stopWords(stop: SafariStop, number: number, plan: SafariPlan, words: Decks): StopWords {
  const mon = stop.mon;
  const notes = notesOf(mon);
  const right = throwFor(mon);
  const barnaby = plan.barnaby.includes(number) ? words.barnaby() : "";
  const opening = join(opener(number, words), barnaby);
  const fled = join(words.fled[`${stop.wrongThrow}-${right}` as W.WrongThrow]());
  const fledReveal = join(revealed(mon, false), words.rightThrow[right]());
  const caught = join(words.caught[right](), "[fanfare]");
  const caughtReveal = join(revealed(mon, true));

  if (stop.kind === "area") {
    const { type, decoy } = stop.clue;
    const gaps = { ...bothPlaceGaps(mon.area, decoy), type, a: withArticle(mon.name) };
    return {
      find: join(opening, words.sign[type]?.() ?? "", fill(words.where(), gaps)),
      findIcon: { yoto: iconForType(type.toLowerCase()) },
      labels: [`head for ${gaps.home}`, `head for ${gaps.decoy}`],
      missed: join(words.empty[decoy](), fill(words.gone(), gaps), fill(words.home(), gaps)),
      meet: join(words.found(), words.arrive[mon.area](), notes.look, paceLine(mon, words), words.ask()),
      fled,
      fledReveal,
      caught,
      caughtReveal,
    };
  }

  const common = stop.common;
  const commonNotes = notesOf(common);
  const [leftMon, rightMon] = stop.rareLeft ? [mon, common] : [common, mon];
  const seen = (who: SafariMon) => `${anOne(notesOf(who).colour)}, ${notesOf(who).glimpse}.`;
  const gaps = placeGaps(mon.area);
  return {
    find: join(
      opening,
      words.arrive[mon.area](),
      fill(words.spot(), gaps),
      `On your left, ${seen(leftMon)} On your right, ${seen(rightMon)}`,
      words.spotAsk(),
    ),
    findIcon: shadow(mon.id),
    findCry: mon.id,
    labels: [`creep up on the ${notes.colour} one`, `creep up on the ${commonNotes.colour} one`],
    missed: join(
      fill(words.common(), { colour: commonNotes.colour, a: withArticle(common.name) }),
      fill(words.rareGone(), { other: notes.colour, a: withArticle(mon.name) }),
      notes.fact,
    ),
    meet: join(fill(words.spotted(), { colour: notes.colour }), notes.look, paceLine(mon, words), words.ask()),
    fled,
    fledReveal,
    caught,
    caughtReveal,
  };
}

/** Left and right for a choice whose right answer goes to `win`. */
function sides(rightIsLeft: boolean, [good, bad]: [string, string], win: string, lose: string) {
  const right = { to: win, label: good };
  const wrong = { to: lose, label: bad };
  return rightIsLeft ? { left: right, right: wrong } : { left: wrong, right: right };
}

function throwSides(stop: Throws & { mon: SafariMon }, win: string, lose: string) {
  return sides(stop.throwLeft, [W.THROW_LABEL[throwFor(stop.mon)], W.THROW_LABEL[stop.wrongThrow]], win, lose);
}

/** What is said after a Pokémon gets away, by where the story goes next. */
function slipLine(number: number, slips: number, words: Decks): string {
  if (slips >= 1) return words.secondSlip();
  if (number >= SAFARI_STOPS) return words.lastSlip();
  return words.firstSlip();
}

function tallyLine(caught: number, words: Decks): string {
  return words.tally[String(caught)]?.() ?? `That's ${numberWords(caught)} in the bag.`;
}

/** Turns a plan into the story map. Pure: the same plan always gives the same story. */
export function buildSafari(plan: SafariPlan): StoryGraph {
  const words = decks(mulberry32((plan.seed ^ 0x5afa21) >>> 0));
  const owner = plan.owner || "trainer";
  const nodes: StoryNode[] = [];
  const stops = plan.stops.length;
  const total = W.ENDING_NAMES.length;
  // Ending 1 after two or more slips, ending 2 after one. A perfect day goes to the secret stop instead.
  const endingAfter = (slips: number) => ID.ending(slips >= MOST_SLIPS ? 1 : 2);

  nodes.push({
    id: "start",
    kind: "choice",
    title: "The Safari Gate",
    icon: { yoto: iconForType("grass") },
    bed: { ambience: "gate", music: "bright" },
    text: join(W.introText(owner, plan.partner)),
    left: { to: "lesson", label: W.LESSON_LABELS.hear },
    right: { to: ID.find(1, 0), label: W.LESSON_LABELS.skip },
  });
  nodes.push({
    id: "lesson",
    kind: "scene",
    title: "Marigold's Lesson",
    icon: { yoto: YOTO_ICONS.book },
    bed: { ambience: "lake", music: "bright" },
    text: join(W.LESSON_TEXT),
    next: ID.find(1, 0),
  });

  plan.stops.forEach((stop, index) => {
    const number = index + 1;
    const stopText = stopWords(stop, number, plan, words);
    const findLeft = stop.kind === "area" ? stop.homeLeft : stop.rareLeft;
    const home = PLACE_SOUND[stop.mon.area];
    // Before an area stop's choice you are still on the path; at a spot stop you are already there.
    const findBed = stop.kind === "area" ? PATH_SOUND : home;
    const missedBed = stop.kind === "area" ? PLACE_SOUND[stop.clue.decoy] : home;
    // How many have got away so far: none, one, or two or more. Every day goes on to the last stop.
    for (let slips = 0; slips <= Math.min(index, MOST_SLIPS); slips += 1) {
      const after = Math.min(slips + 1, MOST_SLIPS);
      const last = number === stops;
      const onWin = last ? (slips === 0 ? GOLD.find : endingAfter(slips)) : ID.find(number + 1, slips);
      const onSlip = last ? endingAfter(after) : ID.find(number + 1, after);
      const title = `Stop ${number}`;
      const warning = slips === 1 ? words.oneSlip() : slips >= MOST_SLIPS ? words.twoSlips() : "";
      const findText = join("[footsteps]", warning, stopText.find);
      const missedText = join(stopText.missed, slipLine(number, slips, words));
      nodes.push({
        id: ID.find(number, slips),
        kind: "choice",
        title,
        bed: underScene(findBed, findText),
        text: findText,
        ...(stopText.findCry ? { dexId: stopText.findCry } : {}),
        icon: stopText.findIcon,
        ...sides(findLeft, stopText.labels, ID.meet(number, slips), ID.missed(number, slips)),
      });
      nodes.push({
        id: ID.missed(number, slips),
        kind: "scene",
        title: `${title}: What Happened`,
        icon: picture(stop.mon.id),
        bed: underScene(missedBed, missedText),
        text: missedText,
        next: onSlip,
      });
      nodes.push({
        id: ID.meet(number, slips),
        kind: "choice",
        title: `${title}: Close Up`,
        dexId: stop.mon.id,
        icon: shadow(stop.mon.id),
        questionIcon: POKEBALL,
        bed: home,
        text: stopText.meet,
        ...throwSides(stop, ID.caught(number, slips), ID.fled(number, slips)),
      });
      // The throw and what came of it share a track: the Yoto screen shows the ball breaking open or clicking shut.
      const fledText = join(stopText.fled, stopText.fledReveal, slipLine(number, slips, words));
      nodes.push({
        id: ID.fled(number, slips),
        kind: "scene",
        title: `${title}: The Throw`,
        icon: BROKE_FREE,
        bed: underScene(home, fledText),
        text: fledText,
        next: onSlip,
      });
      nodes.push({
        id: ID.caught(number, slips),
        kind: "scene",
        title: `${title}: Gotcha`,
        icon: CAUGHT,
        bed: home,
        text: join(
          stopText.caught,
          `[cry:${stop.mon.id}]`,
          stopText.caughtReveal,
          slips >= MOST_SLIPS ? words.moreCaught() : tallyLine(number - slips, words),
        ),
        next: onWin,
      });
    }
  });

  // The secret stop, after five from five.
  const golden = plan.golden;
  const gold = golden.mon;
  const goldNotes = notesOf(gold);
  const goldRight = throwFor(gold);
  const goldGaps = { ...bothPlaceGaps(gold.area, golden.decoy), a: withArticle(gold.name), glimpse: goldNotes.glimpse };
  const masterEnding = ID.ending(total - 1);
  const goldenEnding = ID.ending(total);
  nodes.push({
    id: GOLD.find,
    kind: "choice",
    title: "The Secret Stop",
    dexId: gold.id,
    icon: shadow(gold.id),
    bed: { ambience: "gate", music: "magical" },
    text: join(fill(W.GOLDEN_FIND, goldGaps), golden.sign, W.GOLDEN_WHERE),
    ...sides(golden.homeLeft, [`head for ${goldGaps.home}`, `head for ${goldGaps.decoy}`], GOLD.meet, GOLD.missed),
  });
  nodes.push({
    id: GOLD.missed,
    kind: "scene",
    title: "The Secret Stop: What Happened",
    icon: picture(gold.id),
    bed: { ambience: PLACE_SOUND[golden.decoy].ambience, music: "magical" },
    text: join(words.empty[golden.decoy](), fill(W.GOLDEN_GONE, goldGaps)),
    next: masterEnding,
  });
  nodes.push({
    id: GOLD.meet,
    kind: "choice",
    title: "The Secret Stop: Close Up",
    dexId: gold.id,
    icon: shadow(gold.id),
    bed: { ambience: PLACE_SOUND[gold.area].ambience, music: "magical" },
    text: join(words.arrive[gold.area](), W.GOLDEN_MEET, goldNotes.look, paceLine(gold, words), W.GOLDEN_ASK),
    questionIcon: POKEBALL,
    ...throwSides(golden, GOLD.caught, GOLD.fled),
  });
  const goldBed: StoryBed = { ambience: PLACE_SOUND[gold.area].ambience, music: "magical" };
  nodes.push({
    id: GOLD.fled,
    kind: "scene",
    title: "The Secret Stop: The Throw",
    icon: BROKE_FREE,
    bed: goldBed,
    text: join(
      words.fled[`${golden.wrongThrow}-${goldRight}` as W.WrongThrow](),
      revealed(gold, false),
      words.rightThrow[goldRight](),
      W.GOLDEN_FLED_AFTER,
    ),
    next: masterEnding,
  });
  nodes.push({
    id: GOLD.caught,
    kind: "scene",
    title: "The Secret Stop: The Throw",
    icon: CAUGHT,
    bed: goldBed,
    text: join(words.caught[goldRight](), "[fanfare]"),
    next: goldenEnding,
  });

  for (let number = 1; number <= total; number += 1) {
    const name = W.ENDING_NAMES[number - 1] ?? "Safari Trainer";
    // Back at the gate as the sun goes down: birdsong, and music to match the day.
    const base = {
      id: ID.ending(number),
      kind: "ending" as const,
      title: `Ending ${number}: ${name}`,
      bed: { ambience: "gate", music: number === total ? "magical" : number === 1 ? "calm" : "bright" } satisfies StoryBed,
    };
    if (number === total) {
      nodes.push({
        ...base,
        dexId: gold.id,
        icon: picture(gold.id),
        text: join(
          revealed(gold, true),
          W.goldenText(capital(owner)),
          plan.partner ? `${plan.partner.name} does a little victory dance all round you. [cry:${plan.partner.id}]` : "",
          "[golden]",
        ),
        ending: { number, name, golden: true },
      });
    } else {
      const text = join(
        number === 1 ? join(W.goodDayText(owner), words.tip()) : number === 2 ? W.dayEndText(owner) : W.masterText(owner),
        // Marigold's joke on the way to the gate, never about a Pokémon from today.
        toldBy("Marigold", jokesFor(mulberry32((plan.seed ^ 0x70e) >>> 0), [...plan.stops.map((stop) => stop.mon.id), gold.id])[0]!),
        plan.partner ? `${plan.partner.name} yawns a big yawn, and you walk home together.` : "",
        "[ending]",
      );
      nodes.push({
        ...base,
        icon: { yoto: number >= total - 2 ? YOTO_ICONS.celebrate : number >= 4 ? YOTO_ICONS.star : YOTO_ICONS.music },
        text,
        ending: { number, name },
      });
    }
  }

  return {
    id: `safari-${plan.seed}`,
    title: "Safari Zone Expert Challenge",
    description:
      "Follow Warden Marigold round the Safari Zone, beat Barnaby to the rare ones, and use your Pokémon know-how to pick the right throw.",
    start: "start",
    nodes,
    cast: SAFARI_CAST,
    // The child's name is recorded on its own, so the same adventure for a brother or sister reuses every
    // other line. Pokémon names stay in their lines: the words around them are that Pokémon's own, so
    // cutting them out would mean more recordings, not fewer (measured over thirty sends).
    slots: plan.owner ? [plan.owner] : [],
  };
}

/** Safari Pokémon from a catalogue species list and the habitat rows, with field notes where there are some. */
export function safariPool(
  sheets: readonly MonSheet[],
  rows: ReadonlyArray<{ id: number; habitat: string; captureRate: number; speed: number }>,
  notes: Readonly<Record<number, FieldNotes>> = FIELD_NOTES,
): SafariMon[] {
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  return rows.flatMap((row) => {
    const sheet = byId.get(row.id);
    if (!sheet || !isArea(row.habitat)) return [];
    const note = notes[row.id];
    return [{ ...sheet, area: row.habitat, captureRate: row.captureRate, speed: row.speed, ...(note ? { notes: note } : {}) }];
  });
}

/** Plans and builds one adventure from a species pool. Same pool and seed, same story. */
export function safariFromPool(pool: readonly SafariMon[], input: AdventureInput): StoryGraph {
  return buildSafari(planSafari(pool, input.seed, input.owner ?? "", input.partner));
}

let cachedPool: SafariMon[] | null = null;

/** Safari Pokémon from the catalogue database. */
export function loadSafariPool(): SafariMon[] {
  if (!cachedPool) cachedPool = safariPool(listMonSheets(), listSafariSpecies());
  return cachedPool;
}

/** A fresh Safari Zone adventure for this seed, read from the catalogue. */
export function safariAdventure(input: AdventureInput): StoryGraph {
  return safariFromPool(loadSafariPool(), input);
}
