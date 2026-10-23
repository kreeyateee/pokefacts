/**
 * Gym Challenge: an adventure card that teaches the type chart by playing it.
 *
 * Ronnie Rumble commentates as you take a team of six round eight gyms. Each leader sends out two
 * Pokémon. You choose which of your team to send out: get the type right and the battle moves on; get
 * it wrong and you hear why, then try again. Each leader's second Pokémon has two types, and one of your
 * team looks like the answer until you think about its second type. Then the Champion: three rounds,
 * no second chances, and a legendary Pokémon at the end.
 *
 * The words are hand-written in gym-words.ts. This file picks the Pokémon and which side each answer
 * goes. `planGym` does the picking; `buildGym` turns a plan into the story map.
 */
import { listBaseTotals, listMonSheets, listSpecialSpecies } from "@/lib/catalogue-db";
import type { AdventureInput } from "@/lib/story/adventure-route";
import type { MonSheet } from "@/lib/dex-facts";
import { drawSample, mulberry32 } from "@/lib/kid-cards";
import * as W from "@/lib/story/gym-words";
import { cleanOwner } from "@/lib/story/safari";
import type { StoryPixel } from "@/lib/story/pokeball";
import type { StoryBed, StoryAmbience } from "@/lib/story/story-sound";
import type { StoryGraph, StoryIcon, StoryNode } from "@/lib/story/story-graph";
import type { StoryCharacter } from "@/lib/story/story-voices";
import { bestHit, effectiveness, isPokemonType, type PokemonType } from "@/lib/type-chart";
import { YOTO_ICONS } from "@/lib/yoto-icons";

export type BattleMon = { id: number; name: string; types: string[]; total: number };

/** Why a choice goes wrong. A trap is a type that beats the gym's type but not the Pokémon's other one. */
export type Miss = "trap" | "immune" | "resisted" | "blasted";

export type Round = {
  foe: BattleMon;
  right: BattleMon;
  wrong: BattleMon;
  miss: Miss;
  /** The right one is the left button. */
  rightLeft: boolean;
};

export type GymPlan = {
  seed: number;
  owner: string;
  team: BattleMon[];
  gyms: Array<{ gym: W.Gym; first: Round; ace: Round }>;
  champion: Round[];
  legend: BattleMon;
  /** The child's partner Pokémon, on the team. */
  partnerId?: number;
};

const ACE_TOTAL = 450;
const CHAMPION_TOTAL = 500;

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("Nothing to pick from.");
  return item;
}

/** A name the narrator can say and the dialogue splitter can read: letters, spaces, hyphens, an apostrophe. */
function sayable(name: string): boolean {
  return /^[\p{L}][\p{L}' -]*$/u.test(name) && !/[♀♂]/.test(name);
}

function battleMon(sheet: MonSheet, totals: ReadonlyMap<number, number>): BattleMon {
  return {
    id: sheet.id,
    name: sheet.name,
    // The catalogue writes types in lower case: "rock".
    types: sheet.types.map((type) => type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()).filter(isPokemonType),
    total: totals.get(sheet.id) ?? sheet.stats.reduce((sum, stat) => sum + stat.value, 0),
  };
}

function typeOf(mon: BattleMon): PokemonType {
  return mon.types[0] as PokemonType;
}

/** How one of your team does against a foe: right, or the reason it goes wrong, or neither. */
export function judge(mine: BattleMon, foe: BattleMon, gymType?: PokemonType): "right" | Miss | null {
  const attack = typeOf(mine);
  const hit = effectiveness(attack, foe.types);
  if (hit >= 2) return "right";
  if (gymType && foe.types.length > 1 && hit <= 1 && effectiveness(attack, [gymType]) >= 2) return "trap";
  if (hit === 0) return "immune";
  if (hit <= 0.5) return "resisted";
  if (bestHit(foe.types, mine.types) >= 2) return "blasted";
  return null;
}

/** A round against this foe, or null when your team has no clear right answer and no clear wrong one. */
function roundFor(
  foe: BattleMon,
  team: readonly BattleMon[],
  random: () => number,
  gymType?: PokemonType,
  preferTrap = false,
): Round | null {
  const verdicts = team.map((mine) => ({ mine, verdict: judge(mine, foe, gymType) }));
  const rights = verdicts.filter((row) => row.verdict === "right").map((row) => row.mine);
  const traps = verdicts.filter((row) => row.verdict === "trap");
  const wrongs = verdicts.filter((row) => row.verdict && row.verdict !== "right");
  const wrongPool = preferTrap && traps.length > 0 ? traps : wrongs;
  if (rights.length === 0 || wrongPool.length === 0) return null;
  const wrong = pick(wrongPool, random);
  return {
    foe,
    right: pick(rights, random),
    wrong: wrong.mine,
    miss: wrong.verdict as Miss,
    rightLeft: random() < 0.5,
  };
}

/** Chooses the team, the leaders' Pokémon, the Champion's team and the legend. Same pool and seed, same plan. */
export function planGym(pool: readonly BattleMon[], seed: number, owner = "", partner?: BattleMon): GymPlan {
  const random = mulberry32(seed);
  const byId = new Map(pool.map((mon) => [mon.id, mon]));
  const team = W.TEAM_TYPES.map((type) => {
    const choices = W.TEAM_CHOICES[type].map((id) => byId.get(id)).filter((mon): mon is BattleMon => Boolean(mon));
    if (choices.length === 0) throw new Error(`There is no ${type} Pokémon for your team.`);
    return pick(choices, random);
  });
  // The child's partner joins the team: in place of the one of its type, or as a seventh.
  if (partner && partner.types.length > 0) {
    const same = team.findIndex((mon) => typeOf(mon) === typeOf(partner));
    if (same >= 0) team[same] = partner;
    else team.push(partner);
  }
  // Nobody battles the legends: they are kept for the end.
  const used = new Set([...team.map((mon) => mon.id), ...Object.keys(W.LEGENDS).map(Number)]);
  const fresh = (mon: BattleMon) => !used.has(mon.id) && sayable(mon.name);

  const gyms = W.GYMS.map((gym) => {
    const singles = pool.filter((mon) => fresh(mon) && mon.types.length === 1 && mon.types[0] === gym.type);
    const firsts = drawSample(singles, singles.length, random);
    let first: Round | null = null;
    for (const foe of firsts) {
      first = roundFor(foe, team, random);
      if (first) break;
    }
    if (!first) throw new Error(`There is no first Pokémon for the ${gym.type} gym.`);
    used.add(first.foe.id);
    const duals = pool.filter(
      (mon) => fresh(mon) && mon.types.length === 2 && mon.types.includes(gym.type) && mon.total >= ACE_TOTAL,
    );
    // An ace with a trap if there is one: that is the round worth thinking about.
    const aces = drawSample(duals, duals.length, random);
    let ace: Round | null = null;
    for (const preferTrap of [true, false]) {
      for (const foe of aces) {
        const round = roundFor(foe, team, random, gym.type, true);
        if (round && (!preferTrap || round.miss === "trap")) {
          ace = round;
          break;
        }
      }
      if (ace) break;
    }
    if (!ace) throw new Error(`There is no ace for the ${gym.type} gym.`);
    used.add(ace.foe.id);
    return { gym, first, ace };
  });

  const strong = drawSample(
    pool.filter((mon) => fresh(mon) && mon.types.length === 2 && mon.total >= CHAMPION_TOTAL),
    pool.length,
    random,
  );
  const champion: Round[] = [];
  const championTypes = new Set<string>();
  for (const foe of strong) {
    if (champion.length === 3) break;
    if (used.has(foe.id) || foe.types.some((type) => championTypes.has(type))) continue;
    const round = roundFor(foe, team, random);
    if (!round) continue;
    champion.push(round);
    used.add(foe.id);
    for (const type of foe.types) championTypes.add(type);
  }
  if (champion.length < 3) throw new Error("The Champion has no team.");

  const legends = Object.keys(W.LEGENDS)
    .map((id) => byId.get(Number(id)))
    .filter((mon): mon is BattleMon => Boolean(mon));
  const legend = pick(legends, random);
  return { seed, owner: cleanOwner(owner), team, gyms, champion, legend, partnerId: partner?.id };
}

// ---------------------------------------------------------------------------
// Building the story map

/** Draws lines from a pool without repeating one until the pool runs out. */
function deck(items: readonly string[], random: () => number): () => string {
  let left: string[] = [];
  return () => {
    if (left.length === 0) left = drawSample(items, items.length, random);
    return left.pop() as string;
  };
}

/** Fills {gaps} in a hand-written line. A gap with no value is a bug, so it throws. */
function fill(template: string, gaps: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = gaps[key];
    if (value === undefined) throw new Error(`The Gym line "${template}" needs {${key}}.`);
    return value;
  });
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function typesPhrase(mon: BattleMon): string {
  return mon.types.join(" and ");
}

/** "an Ice", "a Rock". */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

const picture = (mon: BattleMon): StoryIcon => ({ dexId: mon.id });
const POKEBALL: StoryIcon = { pixel: "pokeball" };
const TROPHY: StoryIcon = { pixel: "trophy" };

const GYM_AMBIENCE: Record<string, StoryAmbience> = {
  Rock: "canyon",
  Water: "lake",
  Grass: "grass",
  Electric: "stadium",
  Flying: "mountain",
  Fire: "stadium",
  Ground: "canyon",
  Dragon: "cave",
};

/** Your team, as the question says it: "send out Squirtle, your Water type". */
function sendOut(mon: BattleMon): string {
  return `send out ${mon.name}, your ${typeOf(mon)} type`;
}

/** The left and right buttons for a round, pointing the right answer at `win`. */
function sides(round: Round, win: string, lose: string) {
  const right = { to: win, label: sendOut(round.right) };
  const wrong = { to: lose, label: sendOut(round.wrong) };
  return round.rightLeft ? { left: right, right: wrong } : { left: wrong, right: right };
}

type Decks = ReturnType<typeof decks>;

function decks(random: () => number) {
  return {
    travel: deck(W.TRAVEL_LINES, random),
    sendOut: deck(W.SEND_OUT_LINES, random),
    which: deck(W.WHICH_LINES, random),
    win: deck(W.WIN_LINES, random),
    bigWin: deck(W.BIG_WIN_LINES, random),
    ronnieWin: deck(W.RONNIE_WINS, random),
    immune: deck(W.IMMUNE_LINES, random),
    resisted: deck(W.RESISTED_LINES, random),
    blasted: deck(W.BLASTED_LINES, random),
    trap: deck(W.TRAP_LINES, random),
    backIn: deck(W.BACK_IN_LINES, random),
    ronnieMiss: deck(W.RONNIE_MISSES, random),
    badge: deck(W.BADGE_LINES, random),
  };
}

/** A foe coming out: its cry, its name, its types, and Ronnie asking who you will send. */
function sendOutText(foe: BattleMon, words: Decks): string {
  const gaps = {
    cry: `[cry:${foe.id}]`,
    theirs: foe.name,
    aTheirTypes: withArticle(typesPhrase(foe)),
  };
  return join(fill(words.sendOut(), gaps), words.which());
}

/** You sent out the right one. */
function winText(round: Round, words: Decks): string {
  const attack = typeOf(round.right);
  const hit = effectiveness(attack, round.foe.types);
  const strongTypes = round.foe.types.filter((type) => effectiveness(attack, [type]) >= 2);
  const why = strongTypes.map((type) => W.strongReason(attack, type)).join(" ");
  const gaps = { mine: round.right.name, myType: attack, aMyType: withArticle(attack), theirs: round.foe.name, why };
  return join(fill(hit >= 4 ? words.bigWin() : words.win(), gaps), words.ronnieWin());
}

/** You sent out the wrong one, and why. */
function missText(round: Round, gymType: PokemonType | undefined, words: Decks): string {
  const attack = typeOf(round.wrong);
  const foeTypes = round.foe.types as PokemonType[];
  const other = foeTypes.find((type) => type !== gymType) ?? foeTypes[0] ?? "Normal";
  const theirType =
    foeTypes.find((type) => effectiveness(type, round.wrong.types) >= 2) ?? foeTypes[0] ?? "Normal";
  const weakAgainst = foeTypes.find((type) => effectiveness(attack, [type]) <= 0.5) ?? foeTypes[0] ?? "Normal";
  const why =
    round.miss === "blasted"
      ? W.strongReason(theirType, attack)
      : round.miss === "trap"
        ? W.weakReason(attack, other)
        : W.weakReason(attack, weakAgainst);
  const gaps = {
    mine: round.wrong.name,
    myType: attack,
    aMyType: withArticle(attack),
    theirs: round.foe.name,
    theirType,
    aTheirType: withArticle(theirType),
    gymType: gymType ?? "",
    aGymType: gymType ? withArticle(gymType) : "",
    other,
    why,
  };
  const line =
    round.miss === "trap"
      ? words.trap()
      : round.miss === "immune"
        ? words.immune()
        : round.miss === "resisted"
          ? words.resisted()
          : words.blasted();
  return join(fill(line, gaps), fill(words.backIn(), gaps));
}

/** Everyone who speaks: Ronnie first, so a line no one else claims is his. */
function cast(): StoryCharacter[] {
  return [
    { id: W.RONNIE.id, name: W.RONNIE.name, voices: W.RONNIE.voices, tempo: 1.05, piper: { pitch: 2, tempo: 1.1 } },
    ...W.GYMS.map((gym, index) => ({
      id: gym.leader.toLowerCase(),
      name: gym.leader,
      voices: gym.voices,
      piper: { pitch: [-3, 2, -1, 3, 2.5, -2, -2.5, -4][index] ?? 0, tempo: [0.9, 1.05, 0.95, 1.15, 1.08, 1, 0.9, 0.95][index] ?? 1 },
    })),
    { id: W.AURELIA.id, name: W.AURELIA.name, voices: W.AURELIA.voices, tempo: 0.97, piper: { pitch: -1.5, tempo: 0.94 } },
  ];
}

/** Turns a plan into the story map. Pure: the same plan always gives the same story. */
export function buildGym(plan: GymPlan): StoryGraph {
  const words = decks(mulberry32((plan.seed ^ 0x6a4d21) >>> 0));
  const owner = plan.owner;
  const nodes: StoryNode[] = [];
  const team = plan.team.map((mon) =>
    mon.id === plan.partnerId ? `your partner ${mon.name}, the ${typeOf(mon)} type` : `${mon.name} the ${typeOf(mon)} type`,
  );
  const teamList = `${team.slice(0, -1).join(", ")} and ${team.at(-1)}`;

  nodes.push({
    id: "start",
    kind: "choice",
    title: "The Gym Challenge",
    icon: { yoto: YOTO_ICONS.star },
    bed: { ambience: "stadium", music: "bright" },
    text: join(W.introText(owner, [teamList], plan.team.length === 7 ? "seven" : "six")),
    left: { to: "lesson", label: W.LESSON_LABELS.hear },
    right: { to: "g1a", label: W.LESSON_LABELS.skip },
  });
  nodes.push({
    id: "lesson",
    kind: "scene",
    title: "Ronnie's Lesson",
    icon: { yoto: YOTO_ICONS.book },
    bed: { ambience: "stadium", music: "bright" },
    text: join(W.LESSON_TEXT),
    next: "g1a",
  });

  plan.gyms.forEach(({ gym, first, ace }, index) => {
    const number = index + 1;
    const id = (part: string) => `g${number}${part}`;
    const bed: StoryBed = { ambience: GYM_AMBIENCE[gym.type] ?? "stadium", music: "battle" };
    const next = number < plan.gyms.length ? `g${number + 1}a` : "champ";
    const title = `Gym ${number}: ${gym.leader}`;
    nodes.push({
      id: id("a"),
      kind: "choice",
      title,
      icon: picture(first.foe),
      questionIcon: POKEBALL,
      bed,
      text: join(number > 1 ? words.travel() : "", gym.intro, sendOutText(first.foe, words)),
      ...sides(first, id("b"), id("m")),
    });
    nodes.push({
      id: id("m"),
      kind: "choice",
      title: `${title}: Try Again`,
      icon: picture(first.foe),
      questionIcon: POKEBALL,
      bed,
      text: join(missText(first, undefined, words), gym.tease, words.ronnieMiss()),
      ...sides(first, id("b"), id("m")),
    });
    nodes.push({
      id: id("b"),
      kind: "choice",
      title: `${title}: The Ace`,
      icon: picture(ace.foe),
      questionIcon: POKEBALL,
      bed: { ...bed, music: "tense" },
      text: join(winText(first, words), gym.ace, sendOutText(ace.foe, words)),
      ...sides(ace, id("c"), id("n")),
    });
    nodes.push({
      id: id("n"),
      kind: "choice",
      title: `${title}: Try Again`,
      icon: picture(ace.foe),
      questionIcon: POKEBALL,
      bed: { ...bed, music: "tense" },
      text: join(missText(ace, gym.type, words), gym.tease, words.ronnieMiss()),
      ...sides(ace, id("c"), id("n")),
    });
    nodes.push({
      id: id("c"),
      kind: "scene",
      title: `${gym.badge} Badge`,
      icon: { pixel: `badge-${gym.type.toLowerCase()}` as StoryPixel },
      bed: { ambience: "stadium", music: "bright" },
      text: join(winText(ace, words), gym.farewell, fill(words.badge(), { count: W.badgeCount(number) })),
      next,
    });
  });

  // The Champion: three rounds, and a wrong choice ends the battle.
  const [round1, round2, round3] = plan.champion as [Round, Round, Round];
  const championBed: StoryBed = { ambience: "stadium", music: "champion" };
  nodes.push({
    id: "champ",
    kind: "scene",
    title: "The Champion",
    icon: TROPHY,
    bed: championBed,
    text: join(W.CHAMPION_INTRO),
    next: "c1",
  });
  const rounds: Array<[string, Round, string, string]> = [
    ["c1", round1, "c2", "end1"],
    ["c2", round2, "c3", "end2"],
    ["c3", round3, "win", "end3"],
  ];
  rounds.forEach(([nodeId, round, win, lose], index) => {
    const before = index > 0 ? winText(rounds[index - 1]?.[1] as Round, words) : "";
    nodes.push({
      id: nodeId,
      kind: "choice",
      title: `The Champion: Round ${index + 1}`,
      icon: picture(round.foe),
      questionIcon: POKEBALL,
      bed: championBed,
      text: join(before, W.CHAMPION_SEND_OUTS[index] ?? "", sendOutText(round.foe, words)),
      ...sides(round, win, lose),
    });
  });
  nodes.push({
    id: "win",
    kind: "scene",
    title: "Champion",
    icon: TROPHY,
    bed: championBed,
    text: join(winText(round3, words), W.CHAMPION_WIN),
    next: "legend",
  });
  const legendInfo = W.LEGENDS[plan.legend.id] ?? { name: plan.legend.name, about: "" };
  nodes.push({
    id: "legend",
    kind: "choice",
    title: "A Visitor",
    icon: { dexId: plan.legend.id, shadow: true },
    bed: { ambience: "stadium", music: "magical" },
    text: fill(W.LEGEND_ARRIVES, { about: legendInfo.about, cry: `[cry:${plan.legend.id}]` }),
    left: { to: "end4", label: W.LEGEND_LABELS.throwBall },
    right: { to: "end5", label: W.LEGEND_LABELS.letRest },
  });

  W.CHAMPION_LOSSES.forEach((loss, index) => {
    const round = plan.champion[index] as Round;
    nodes.push({
      id: `end${index + 1}`,
      kind: "ending",
      title: `Ending ${index + 1}: ${W.ENDING_NAMES[index]}`,
      icon: picture(round.foe),
      bed: { ambience: "stadium", music: "calm" },
      text: join(missText(round, undefined, words), loss, "[ending]"),
      ending: { number: index + 1, name: W.ENDING_NAMES[index] ?? "The End" },
    });
  });
  nodes.push({
    id: "end4",
    kind: "ending",
    title: `Ending 4: ${W.ENDING_NAMES[3]}`,
    icon: TROPHY,
    bed: { ambience: "stadium", music: "magical" },
    text: join(W.throwEnding(legendInfo.name, owner), "[ending]"),
    ending: { number: 4, name: W.ENDING_NAMES[3] ?? "Champion" },
  });
  nodes.push({
    id: "end5",
    kind: "ending",
    title: `Ending 5: ${W.ENDING_NAMES[4]}`,
    icon: picture(plan.legend),
    bed: { ambience: "stadium", music: "magical" },
    text: join(W.restEnding(legendInfo.name, owner), "[golden]"),
    ending: { number: 5, name: W.ENDING_NAMES[4] ?? "Friend of Legends", golden: true },
  });

  return {
    id: `gym-${plan.seed}`,
    title: "Gym Challenge",
    description:
      "Take a team of six round eight gyms and the Champion. Pick the Pokémon whose type wins, with Ronnie Rumble commentating every battle.",
    start: "start",
    nodes,
    cast: cast(),
    slots: plan.owner ? [plan.owner] : [],
  };
}

/** Battle Pokémon from the catalogue: no legendary, mythical or baby Pokémon. */
export function battlePool(
  sheets: readonly MonSheet[],
  special: ReadonlySet<number>,
  totals: ReadonlyMap<number, number> = new Map(),
): BattleMon[] {
  return sheets
    .filter((sheet) => !special.has(sheet.id) || Object.hasOwn(W.LEGENDS, sheet.id))
    .map((sheet) => battleMon(sheet, totals));
}

let cachedPool: BattleMon[] | null = null;

export function loadBattlePool(): BattleMon[] {
  if (!cachedPool) cachedPool = battlePool(listMonSheets(), listSpecialSpecies(), listBaseTotals());
  return cachedPool;
}

/** Plans and builds one Gym Challenge from a pool. Same pool and seed, same story. */
export function gymFromPool(pool: readonly BattleMon[], input: AdventureInput, partner?: BattleMon): StoryGraph {
  return buildGym(planGym(pool, input.seed, input.owner ?? "", partner));
}

/** The partner as a battler, from the whole catalogue: a legend or a baby can be a partner too. */
function partnerMon(input: AdventureInput): BattleMon | undefined {
  if (!input.partner) return undefined;
  const sheet = listMonSheets().find((item) => item.id === input.partner?.id);
  return sheet ? { ...battleMon(sheet, listBaseTotals()), name: input.partner.name } : undefined;
}

export function gymAdventure(input: AdventureInput): StoryGraph {
  return gymFromPool(loadBattlePool(), input, partnerMon(input));
}
