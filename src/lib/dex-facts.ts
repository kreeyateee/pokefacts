import { POKE_DESCRIPTIONS } from "@/lib/descriptions";
import {
  centimetresSpeech,
  cleanFlavor,
  imperialHeightSpeech,
  imperialWeightSpeech,
  kilogramsSpeech,
  type MeasureUnits,
  versionName,
  versionRank,
} from "@/lib/format";

export type FlavorSource = {
  text: string;
  /** PokéAPI version slug, such as "shield" or "ultra-moon". */
  version: string;
};

/** Death wording stays off the card. "Lives in a forest" is a home, so it stays. */
const SKIP =
  /\b(kill|killing|death|dead|dying|deceased)\b|life would end|afterlife|victims['’] lives|drains? (?:people['’]s |their )?lives/i;
const IMPERIAL = /\b(feet|foot|pounds|pound|inches|inch|fahrenheit)\b/i;

type DexLine = {
  text: string;
  version: string;
};

function prepareEntries(entries: FlavorSource[]): DexLine[] {
  const cleaned = entries
    .map((entry) => ({
      text: cleanFlavor(entry.text),
      version: versionName(entry.version),
      rank: versionRank(entry.version),
    }))
    .filter((entry) => entry.text.length >= 40 && entry.text.length <= 500)
    .filter((entry) => !SKIP.test(entry.text))
    .sort((a, b) => b.rank - a.rank);

  const unique: DexLine[] = [];
  for (const entry of cleaned) {
    if (!unique.some((kept) => kept.text === entry.text)) {
      unique.push({ text: entry.text, version: entry.version });
    }
  }
  const metric = unique.filter((entry) => !IMPERIAL.test(entry.text));
  return metric.length > 0 ? metric : unique;
}

export function pickDexEntry(entries: FlavorSource[]): DexLine {
  return prepareEntries(entries)[0] ?? { text: "", version: "" };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Straight and curly apostrophes both appear in official names. */
function nameForms(name: string): string[] {
  return [...new Set([name, name.replace(/’/g, "'"), name.replace(/'/g, "’")])];
}

function mentionsName(name: string, text: string): boolean {
  const hay = text.toLowerCase();
  return nameForms(name).some((form) => form.length > 0 && hay.includes(form.toLowerCase()));
}

export type MonSheet = {
  id: number;
  /** National-dex slug, used as the chapter key. */
  slug: string;
  name: string;
  genus: string;
  types: string[];
  heightDecimetres: number;
  weightHectograms: number;
  stats: Array<{ name: string; value: number }>;
  abilityName: string | null;
  abilityEffect: string | null;
  evolution: string;
  /** Species it grows from, when the catalogue has one. */
  evolvesFrom?: string | null;
  /** Species it can become. Names only, not the method. */
  evolvesInto?: string[];
  /** How it becomes each of those: "at level 16", "with a Thunder Stone". */
  evolvesIntoHow?: Array<{ name: string; method: string }>;
  /** How it grows from its pre-evolution: "at level 16". */
  evolvesFromHow?: string | null;
  habitat: string | null;
  /** Official colour, such as Green. */
  color?: string | null;
  entries: FlavorSource[];
};

function typeSentence(types: string[]): string {
  const names = types.map((type) => type.charAt(0).toUpperCase() + type.slice(1));
  const label =
    names.length === 0 ? "Pokémon" : names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
  const article = /^[aeiou]/i.test(label ?? "") ? "an" : "a";
  return `It is ${article} ${label} type.`;
}

function asSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const BARE_VERBS = new Set([
  "possesses",
  "harbors",
  "harbours",
  "stores",
  "lives",
  "uses",
  "makes",
  "has",
  "keeps",
  "seems",
  "appears",
  "looks",
  "flies",
  "swims",
  "hides",
  "builds",
  "creates",
  "releases",
  "absorbs",
  "generates",
  "emits",
  "shoots",
  "carries",
  "holds",
  "spreads",
  "changes",
  "evolves",
  "protects",
  "prevents",
  "restores",
  "glows",
  "roams",
  "wanders",
  "prefers",
  "conceals",
  "radiates",
  "floats",
  "dives",
  "leaps",
  "sings",
  "burrows",
  "mimics",
]);

/** Some Pokédex lines drop the subject: "Possesses cheek sacs…" */
function withSubject(text: string, name: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  return sentences
    .map((sentence) => {
      const line = asSentence(sentence);
      const first = line.match(/^[A-Za-z']+/)?.[0]?.toLowerCase() ?? "";
      if (new RegExp(`^${escapeRegExp(name)}\\b`).test(line) || !BARE_VERBS.has(first)) return line;
      const body = line.charAt(0).toLowerCase() + line.slice(1).replace(/[.!?]$/, "");
      return asSentence(`It ${body}`);
    })
    .join(" ");
}

/** One evolution sentence. A long chain stays a short list of names. */
function evolutionFact(sheet: MonSheet): string {
  const cleaned = sheet.evolution.replace(/\s*This briefing is for .+$/i, "").trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [];
  if (sentences.length > 3) {
    const names = [...cleaned.matchAll(/becomes ([A-Z][A-Za-z'.-]*)/g)]
      .map((match) => match[1])
      .slice(0, 3);
    if (names.length >= 2) return `It can become ${names.join(", ")}, and others.`;
  }
  const about = sentences.find((sentence) => new RegExp(`\\b${sheet.name}\\b`).test(sentence));
  const line = (about ?? sentences[0] ?? "").trim();
  if (!line) return "";
  return asSentence(
    line.replace(new RegExp(`^${escapeRegExp(sheet.name)} becomes\\b`), "It becomes"),
  );
}

const HOMES: Record<string, string> = {
  sea: "the sea",
  "waters edge": "the water's edge",
  cave: "caves",
  forest: "forests",
  grassland: "grassland",
  mountain: "the mountains",
  rare: "rare places",
  "rough terrain": "rough terrain",
  urban: "towns",
};

function homeFact(habitat: string | null): string {
  if (!habitat) return "";
  const place = habitat.match(/^Look for it in (.+?)\.?$/i)?.[1]?.toLowerCase();
  if (place === "waters edge") return "It lives at the water's edge.";
  if (place) return `It lives in ${HOMES[place] ?? place}.`;
  if (/no settled habitat/i.test(habitat)) return "It has no usual home.";
  return "";
}

function openingSentence(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts[0]?.trim() ?? "";
}

function speakableEffect(raw: string): string {
  return raw
    .replace(
      /to inflict 1\.5× damage at 1\/3 max HP or less/gi,
      "so they do one and a half times the damage when a third of its hit points are left, or fewer",
    )
    .replace(/(\d+(?:\.\d+)?)%/g, "$1 percent")
    .replace(/attacking Pokémon on contact/gi, "a Pokémon that attacks it")
    .replace(/any move that hits the Pokémon/gi, "a move that hits it")
    .replace(/Ensures success fleeing from wild battles/gi, "can always get away from a wild battle")
    .replace(/\bDisabling\b/g, "disabling")
    .replace(/the Pokémon's HP is low/gi, "its hit points are low")
    .replace(/the Pokémon's/gi, "its")
    .replace(/\bHP is low\b/g, "hit points are low")
    .replace(/\bmax HP\b/g, "its hit points")
    .replace(/\bHP\b/g, "hit points")
    .replace(/\bhit points is\b/g, "hit points are");
}

function abilityFact(name: string | null, effect: string | null): string {
  if (!name) return "";
  const first = effect ? openingSentence(effect) : "";
  if (!first || first.length > 220) return `Its ability is ${name}.`;
  const body = speakableEffect(first).replace(/[.!?]$/, "").trim();
  if (!body) return `Its ability is ${name}.`;
  const sentence = /^(it|this|the)\b/i.test(body)
    ? asSentence(body)
    : asSentence(`It ${body.charAt(0).toLowerCase()}${body.slice(1)}`);
  return `Its ability is ${name}. ${sentence}`;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function repeats(next: string, soFar: string): boolean {
  const words = next.toLowerCase().split(/\W+/).filter((word) => word.length > 4);
  if (words.length === 0) return false;
  const hay = ` ${soFar.toLowerCase()} `;
  const hits = words.filter((word) => hay.includes(` ${word} `)).length;
  return hits / words.length > 0.62;
}

/**
 * Distinct Pokédex entries, newest first, until the reading is about a minute.
 * The cry is joined in front of this script when the track is recorded.
 */
function dexPassage(entries: FlavorSource[], name: string, room: number): string {
  const parts: string[] = [];
  let words = 0;
  for (const entry of prepareEntries(entries)) {
    const text = withSubject(entry.text, name);
    if (repeats(text, parts.join(" "))) continue;
    const count = wordCount(text);
    if (parts.length > 0 && words + count > room) break;
    parts.push(text);
    words += count;
    if (words >= room) break;
  }
  return parts.join(" ");
}

/** Name, then the Pokédex lines, then weight, height, and a few plain facts. */
export function dexBlurb(sheet: MonSheet, number: string): string {
  const genus = sheet.genus.replace(/POK[eé]MON/gi, "Pokémon");
  const opening = [
    `${sheet.name}. It is number ${number}.`,
    typeSentence(sheet.types),
    `It is the ${genus}.`,
  ].join(" ");
  const closing = [
    `It weighs ${kilogramsSpeech(sheet.weightHectograms)}. It is ${centimetresSpeech(sheet.heightDecimetres)} tall.`,
    evolutionFact(sheet),
    abilityFact(sheet.abilityName, sheet.abilityEffect),
    homeFact(sheet.habitat),
  ]
    .filter(Boolean)
    .join(" ");
  const fromDex = dexPassage(
    sheet.entries,
    sheet.name,
    Math.max(80, 250 - wordCount(opening) - wordCount(closing)),
  );
  const passage = fromDex || POKE_DESCRIPTIONS[sheet.id] || "";
  return [opening, passage, closing].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

type ClueHints = {
  types: string[];
  genus: string;
  heightDecimetres: number;
  weightHectograms: number;
  habitat: string | null;
  color?: string | null;
};

type Picture = { max: number; phrase: string; token: string };

/** Heights a child can picture. The token stops the weight line using the same object. */
const HEIGHTS: Picture[] = [
  { max: 20, phrase: "shorter than a ruler", token: "ruler" },
  { max: 45, phrase: "about as tall as a cat", token: "cat" },
  { max: 80, phrase: "about as tall as a desk", token: "desk" },
  { max: 105, phrase: "about as tall as a door handle", token: "handle" },
  { max: 140, phrase: "taller than a door handle", token: "handle" },
  { max: 170, phrase: "shorter than a grown-up", token: "person" },
  { max: 205, phrase: "about as tall as a doorway", token: "door" },
  { max: 260, phrase: "taller than a doorway", token: "door" },
  { max: 340, phrase: "as tall as a basketball hoop", token: "hoop" },
  { max: 520, phrase: "taller than a giraffe", token: "giraffe" },
  { max: 900, phrase: "taller than a house", token: "house" },
  { max: Number.POSITIVE_INFINITY, phrase: "much taller than a house", token: "house" },
];

const WEIGHTS: Picture[] = [
  { max: 0.2, phrase: "lighter than an apple", token: "apple" },
  { max: 1, phrase: "about as heavy as a bag of sugar", token: "sugar" },
  { max: 3, phrase: "about as heavy as a brick", token: "brick" },
  { max: 5, phrase: "about as heavy as a house cat", token: "cat" },
  { max: 8, phrase: "about as heavy as a bowling ball", token: "ball" },
  { max: 14, phrase: "about as heavy as a bicycle", token: "bike" },
  { max: 28, phrase: "heavier than a bicycle", token: "bike" },
  { max: 45, phrase: "about as heavy as a large dog", token: "dog" },
  { max: 80, phrase: "about as heavy as a grown-up", token: "person" },
  { max: 120, phrase: "heavier than a grown-up", token: "person" },
  { max: 240, phrase: "about as heavy as a motorbike", token: "motorbike" },
  { max: 550, phrase: "about as heavy as a horse", token: "horse" },
  { max: 1400, phrase: "about as heavy as a small car", token: "car" },
  { max: Number.POSITIVE_INFINITY, phrase: "heavier than a car", token: "car" },
];

function pickPicture(table: Picture[], value: number): Picture {
  return table.find((row) => value <= row.max) ?? table[table.length - 1]!;
}

/** Nearest picture that does not reuse the height object. */
function weightPicture(kilograms: number, usedToken: string): Picture {
  const exact = pickPicture(WEIGHTS, kilograms);
  if (exact.token !== usedToken) return exact;
  let best = exact;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of WEIGHTS) {
    if (row.token === usedToken) continue;
    const distance = Math.abs(Math.log(Math.max(row.max, 0.05)) - Math.log(Math.max(kilograms, 0.05)));
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}

/** One comparison from the real height and weight. It never quotes the Pokédex numbers. */
export function sizeComparison(decimetres: number, hectograms = 0): string {
  const centimetres = decimetres * 10;
  const kilograms = hectograms / 10;
  if (centimetres > 0 && kilograms > 0) {
    const height = pickPicture(HEIGHTS, centimetres);
    const weight = weightPicture(kilograms, height.token);
    return `It is ${height.phrase} and ${weight.phrase}.`;
  }
  if (centimetres > 0) return `It is ${pickPicture(HEIGHTS, centimetres).phrase}.`;
  if (kilograms > 0) return `It is ${pickPicture(WEIGHTS, kilograms).phrase}.`;
  return "";
}

function intoNames(sheet: MonSheet): string[] {
  const listed = (sheet.evolvesInto ?? []).filter((name) => name && name !== sheet.name);
  if (listed.length > 0) return [...new Set(listed)];
  const found: string[] = [];
  const pattern =
    /becomes\s+(.+?)\s+(?:at|with|by|when|once|after|while|during|using|holding|from|if)\b/gi;
  for (const match of sheet.evolution.matchAll(pattern)) {
    const name = match[1]?.trim() ?? "";
    if (name && name !== sheet.name && !found.includes(name)) found.push(name);
  }
  return found;
}

function evolutionSentence(from: string | null, into: string[]): string {
  const targets = [...new Set(into.filter(Boolean))];
  if (from && targets.length === 1) return `It grows from ${from} and becomes ${targets[0]}.`;
  if (from && targets.length === 2) {
    return `It grows from ${from} and can become ${targets[0]} or ${targets[1]}.`;
  }
  if (from && targets.length > 2) return `It grows from ${from} and can become many different Pokémon.`;
  if (targets.length === 1) return `It becomes ${targets[0]} as it grows up.`;
  if (targets.length === 2) return `It can become ${targets[0]} or ${targets[1]} as it grows up.`;
  if (targets.length > 2) return `It can become many different Pokémon as it grows up.`;
  if (from) return `It grows from ${from} as it gets older.`;
  return "";
}

function abilitySentence(name: string | null): string {
  const cleaned = name?.replace(/\s+/g, " ").trim() ?? "";
  if (!cleaned) return "";
  return `Its special ability is called ${cleaned}.`;
}

function repeatsClue(extra: string, clues: string[]): boolean {
  const key = extra.toLowerCase();
  return clues.some((clue) => {
    const other = clue.toLowerCase();
    return other === key || other.includes(key) || key.includes(other);
  });
}

const IT_VERB: Record<string, string> = {
  are: "is",
  have: "has",
  live: "lives",
  gather: "gathers",
  do: "does",
  fly: "flies",
  were: "was",
};

const BARE_DEX_VERB =
  /^(possesses|wields|harbors|harbours|stores|lives|uses|makes|has|keeps|seems|appears|looks|flies|swims|hides|builds|creates|releases|absorbs|generates|emits|shoots|carries|holds|spreads|changes|protects|glows|roams|wanders|floats|dives|leaps|sings|burrows|mimics|roasts|spits|wears|sleeps|eats|tends|can)\b/i;

/** "Pineco are" becomes "it is". "if it were" and "by it have" stay as they are. */
function agreeIt(line: string): string {
  let text = line.replace(/\bit (are|live|do)\b/gi, (_, verb: string) => `it ${IT_VERB[verb.toLowerCase()] ?? verb}`);
  text = text.replace(/\bit have\b/gi, (match, offset, full) => {
    const before = full.slice(Math.max(0, offset - 6), offset);
    if (/\b(?:by|of|with|for|to|from|as|than)\s+$/i.test(before)) return match;
    return "it has";
  });
  text = text.replace(/\bit were\b/gi, (match, offset, full) => {
    const before = full.slice(Math.max(0, offset - 8), offset);
    if (/\b(?:if|as)\s+$/i.test(before)) return match;
    return "it was";
  });
  return text.replace(/^(?:elderly|young|old)\s+it\s+is\b/i, "It is");
}

/** The species name, and "this Pokémon", become "it". The rest of the sentence stays. */
function withoutPokemonName(sentence: string, names: string[]): string {
  let line = sentence.replace(/[—–]/g, ", ").replace(/\s+/g, " ").trim();
  line = line.replace(/\bthis\s+(?:[a-z'-]+\s+){0,4}pok[eé]mon['’]s\b/gi, "its");
  line = line.replace(/\bof\s+this\s+(?:[a-z'-]+\s+){0,4}pok[eé]mon\b/gi, "of it");
  line = line.replace(/\bthis\s+(?:[a-z'-]+\s+){0,4}pok[eé]mon\b/gi, "it");
  line = line.replace(/\bof\s+these\s+(?:[a-z'-]+\s+){0,4}pok[eé]mon\b/gi, "of them");
  line = line.replace(/\bthese\s+(?:[a-z'-]+\s+){0,4}pok[eé]mon\b/gi, "they");
  const ordered = [...names].filter(Boolean).sort((left, right) => right.length - left.length);
  for (const name of ordered) {
    const token = escapeRegExp(name);
    line = line.replace(new RegExp(`\\ba\\s+${token}['’]s(?![\\p{L}\\p{N}])`, "giu"), "its");
    line = line.replace(new RegExp(`${token}['’]s(?![\\p{L}\\p{N}])`, "giu"), "its");
    line = line.replace(
      new RegExp(`\\b(?:a|an|the)\\s+(?:[a-z'-]+\\s+){0,3}${token}(?![\\p{L}\\p{N}])`, "giu"),
      "it",
    );
    line = line.replace(new RegExp(`(?:^|(?<=\\s))${token}(?![\\p{L}\\p{N}])`, "giu"), "it");
  }
  line = line
    .replace(/\ba\s+its\b/gi, "its")
    .replace(/\b(of|to|with|for|from|by|on|in|at)\s+they\b/gi, "$1 them")
    .replace(/\s+/g, " ")
    .trim();
  line = agreeIt(line);
  line = line.replace(/^they\s+(\w+)/i, (full, verb: string) => {
    const next = IT_VERB[verb.toLowerCase()];
    if (!next) return `${full.charAt(0).toUpperCase()}${full.slice(1)}`;
    return `It ${next}`;
  });
  if (BARE_DEX_VERB.test(line)) line = `It ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
  if (/^its\b/i.test(line)) line = `Its${line.slice(3)}`;
  else if (/^it\b/i.test(line)) line = `It${line.slice(2)}`;
  line = line.replace(/^It\s+([A-Za-z]+)/, (full, verb: string) => {
    const next = IT_VERB[verb.toLowerCase()];
    return next ? `It ${next}` : full;
  });
  if (/^[a-z]/.test(line)) line = `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
  return asSentence(line);
}

function nameStillPresent(name: string, text: string): boolean {
  return nameForms(name).some((form) => {
    const token = escapeRegExp(form);
    return new RegExp(`(?:^|(?<=\\s))${token}(?![\\p{L}\\p{N}])`, "iu").test(text);
  });
}

/** "Mr. Mime" is one name. A plain period split would leave the name in two pieces. */
function dexSentences(text: string): string[] {
  const shielded = text.replace(/\b(Mr|Mrs|Ms|Jr|Sr|Dr|Prof|St)\./g, "$1\u0000");
  const parts = shielded.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return parts.map((part) => part.replace(/\u0000/g, ".").replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** The whole Pokédex entry, with the species name taken out. Harsh sentences are dropped. */
function namelessEntry(text: string, names: string[]): string {
  const sentences = dexSentences(text);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (SKIP.test(sentence)) continue;
    const bare = sentence.replace(/[.!?]+$/, "").trim();
    if (!bare || names.some((name) => bare.toLowerCase() === name.toLowerCase())) continue;
    const spoken = withoutPokemonName(sentence, names);
    if (!spoken || names.some((name) => nameStillPresent(name, spoken))) continue;
    kept.push(spoken);
  }
  return kept.join(" ");
}

/** Colour and type in one clue. Either half is left out when the sheet has no value. */
function lookSentence(color: string | null | undefined, types: string[]): string {
  const shade = color?.trim().toLowerCase() ?? "";
  const typed = types.length > 0 ? typeSentence(types) : "";
  if (shade && typed) {
    const rest = typed.replace(/^It is\s+/i, "").replace(/\.$/, "");
    return `It is ${shade}, and it is ${rest}.`;
  }
  if (shade) return `It is ${shade}.`;
  return typed;
}

/**
 * Four clues: colour and type, the stored Pokédex entry, a second entry from
 * another game, then a size picture. A missing piece is left out.
 * The species name is taken out of both Pokédex lines.
 */
function shortClues(sheet: MonSheet): string[] {
  const names = [
    ...nameForms(sheet.name),
    ...(sheet.evolvesFrom ? nameForms(sheet.evolvesFrom) : []),
    ...(sheet.evolvesInto ?? []).flatMap((name) => nameForms(name)),
  ];
  const look = lookSentence(sheet.color, sheet.types);
  const first = sheet.entries[0] ? namelessEntry(sheet.entries[0].text, names) : "";
  const secondRaw = sheet.entries[1] ? namelessEntry(sheet.entries[1].text, names) : "";
  const second = secondRaw && secondRaw !== first ? secondRaw : "";
  const size =
    sheet.heightDecimetres > 0 || sheet.weightHectograms > 0
      ? sizeComparison(sheet.heightDecimetres, sheet.weightHectograms)
      : "";
  return [look, first, second, size].filter((line) => line.length > 0);
}

/** One new sentence for the answer track. It is not one of the clues. */
function answerExtra(sheet: MonSheet, clues: string[]): string {
  const from = sheet.evolvesFrom && sheet.evolvesFrom !== sheet.name ? sheet.evolvesFrom : null;
  const options = [
    evolutionSentence(from, intoNames(sheet)),
    abilitySentence(sheet.abilityName),
    sheet.heightDecimetres > 0 ? sizeComparison(sheet.heightDecimetres) : "",
    "It stands alone, with no further evolution.",
  ];
  for (const option of options) {
    if (!option || mentionsName(sheet.name, option) || repeatsClue(option, clues)) continue;
    return option;
  }
  return "It stands alone, with no further evolution.";
}

const GUESS_COUNTDOWN = "Shout your guess. One. Two. Three.";

/** Splits a spoken riddle so each clue stays one item and the countdown stays one line. */
export function riddleParts(script: string): { numberLabel: string; clues: string[]; countdown: string } {
  const trimmed = script.trim();
  const hasCount = trimmed.endsWith(GUESS_COUNTDOWN);
  const body = (hasCount ? trimmed.slice(0, -GUESS_COUNTDOWN.length) : trimmed).trim();
  const number = body.match(/^Number (\d+)\./);
  const rest = (number ? body.slice(number[0].length) : body).trim();
  const clues = (rest.includes("\n") ? rest.split(/\n+/) : rest.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    numberLabel: number?.[1] ? `Number ${number[1]}` : "",
    clues,
    countdown: hasCount ? GUESS_COUNTDOWN : "",
  };
}

/** A height a child can picture: centimetres under a metre, metres from there. */
export function quickHeight(decimetres: number): string {
  if (decimetres < 10) return centimetresSpeech(decimetres);
  const metres = (decimetres / 10).toFixed(1).replace(/\.0$/, "");
  return `${metres} ${metres === "1" ? "metre" : "metres"}`;
}

/** A weight a child can picture: grams under a kilogram, kilograms from there. */
export function quickWeight(hectograms: number): string {
  if (hectograms < 10) return `${hectograms * 100} grams`;
  return kilogramsSpeech(hectograms).replace(/^1 kilograms$/, "1 kilogram");
}

/** The shortest whole Pokédex sentence that says something on its own: one line, quick to hear. */
export function shortDexLine(sheet: MonSheet): string {
  const sentences = prepareEntries(sheet.entries).flatMap(
    (entry) => withSubject(entry.text, sheet.name).match(/[^.!?]+[.!?]+/g) ?? [],
  );
  // Older games print the name in capitals: "WAILORD is the largest…".
  const shouted = new RegExp(`\\b${escapeRegExp(sheet.name.toUpperCase())}\\b`, "g");
  const usable = sentences
    .map((sentence) => sentence.trim().replace(shouted, sheet.name))
    // Five words or more, so it stands alone.
    .filter((sentence) => wordCount(sentence) >= 5 && sentence.length <= 160);
  // A sentence that starts the way a sentence on its own does, not "Said to appear…" or "This is why…".
  const opener = new RegExp(
    `^(?:${escapeRegExp(sheet.name)}|It|When|If|The|A|An|In|On|At|After|Although|Because|By|From|Once|Even|Some|Many|Its)\\b`,
  );
  const standalone = usable.filter((sentence) => opener.test(sentence) && !/^Its\b.*\bit\b/.test(sentence));
  const pool = standalone.length > 0 ? standalone : usable;
  return pool.sort((a, b) => a.length - b.length)[0] ?? "";
}

/** A list read aloud: "A", "A or B", "A, B or C", then "and 2 more". */
function spokenChoices(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length <= 3) return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
  return `${items.slice(0, 3).join(", ")}, and ${items.length - 3} more`;
}

/**
 * How it evolves, with the level or the item, because children playing the games ask that most:
 * "Evolves from Charmander at level 16. Evolves into Charizard at level 36." Up to three, then how many more.
 */
function quickEvolution(sheet: MonSheet): string {
  const from = sheet.evolvesFrom?.trim();
  const fromHow = sheet.evolvesFromHow?.trim();
  const ways = new Map<string, string[]>();
  for (const step of sheet.evolvesIntoHow ?? []) {
    if (!step.name) continue;
    ways.set(step.name, [...(ways.get(step.name) ?? []), step.method.trim()].filter(Boolean));
  }
  // Without the methods, the names alone.
  for (const name of sheet.evolvesInto ?? []) if (name && !ways.has(name)) ways.set(name, []);
  // Some have many ways to one Pokémon (Milcery's Alcremie): the first, then "or another way".
  const how = (methods: string[]) => (methods.length > 2 ? `${methods[0]} or another way` : methods.join(" or "));
  const into = [...ways].map(([name, methods]) => (methods.length > 0 ? `${name} ${how([...new Set(methods)])}` : name));
  const sentences = [
    from ? `Evolves from ${from}${fromHow ? ` ${fromHow}` : ""}.` : "",
    into.length > 0 ? `Evolves into ${spokenChoices(into)}.` : "",
  ].filter(Boolean);
  return sentences.length > 0 ? sentences.join(" ") : "Does not evolve.";
}

/**
 * Quick facts, always in the same order so a child learns where to listen: name, kind, type,
 * one short Pokédex line, height and weight, ability, evolution. Calm full stops, no exclamations.
 */
export function quickFacts(sheet: MonSheet): string {
  const name = sheet.name.replace(/\.$/, "");
  const genus = sheet.genus.replace(/POK[eé]MON/gi, "Pokémon").trim();
  const types = sheet.types.map((type) => type.charAt(0).toUpperCase() + type.slice(1));
  const dex = shortDexLine(sheet);
  return [
    `${name}.`,
    genus ? `The ${genus}.` : "",
    types.length > 0 ? `${types.join(" and ")} type.` : "",
    dex ? `The Pokédex says: ${dex.replace(/!$/, ".")}` : "",
    `${quickHeight(sheet.heightDecimetres)} tall, ${quickWeight(sheet.weightHectograms)}.`,
    sheet.abilityName ? `Ability: ${sheet.abilityName}.` : "",
    quickEvolution(sheet),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A fact line's own measurements ("40 centimetres tall, 6 kilograms") in the units picked for the card.
 * Only for lines this file writes: a Bulbapedia reading is left as it is.
 */
export function measuresInUnits(text: string, units: MeasureUnits): string {
  if (units !== "imperial") return text;
  return text
    .replace(/\b(\d+(?:\.\d+)?) (centimetres|metres|metre)\b/g, (_, amount: string, unit: string) =>
      imperialHeightSpeech(unit === "centimetres" ? Number(amount) / 10 : Number(amount) * 10),
    )
    .replace(/\b(\d+(?:\.\d+)?) (grams|kilograms|kilogram)\b/g, (_, amount: string, unit: string) =>
      imperialWeightSpeech(unit === "grams" ? Number(amount) / 100 : Number(amount) * 10),
    );
}

/** Spoken Who's That Pokémon scripts. The cry is joined in front of each track later. */
export function guessSpoken(sheet: MonSheet): { clue: string; answer: string } {
  const clues = shortClues(sheet);
  const clue = [`Number ${sheet.id}.`, ...clues, GUESS_COUNTDOWN].join("\n");
  // "It's Pikachu!" is the reveal. A name that ends in a full stop, like Mime Jr., keeps just the "!".
  const answer = `It's ${sheet.name.replace(/\.$/, "")}! ${answerExtra(sheet, clues)}`.replace(/\s+/g, " ").trim();
  return { clue, answer };
}

/**
 * Clues for a caller that only has a dex line and a few hints.
 * The species name is taken out.
 */
export function threeClues(name: string, entries: FlavorSource[], hints?: ClueHints): string[] {
  return shortClues({
    id: 0,
    slug: "riddle",
    name,
    genus: hints?.genus ?? "",
    types: hints?.types ?? [],
    heightDecimetres: hints?.heightDecimetres ?? 0,
    weightHectograms: hints?.weightHectograms ?? 0,
    stats: [],
    abilityName: null,
    abilityEffect: null,
    evolution: "",
    habitat: hints?.habitat ?? null,
    color: hints?.color ?? null,
    entries,
  });
}
