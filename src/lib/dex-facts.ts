import { POKE_DESCRIPTIONS } from "@/lib/descriptions";
import {
  centimetresSpeech,
  cleanFlavor,
  kilogramsSpeech,
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

export type DexLine = {
  text: string;
  version: string;
};

export function prepareEntries(entries: FlavorSource[]): DexLine[] {
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
  habitat: string | null;
  /** Coat colour from the catalogue, such as "White". */
  color?: string | null;
  /** Body shape slug from the catalogue, such as "squiggle". */
  shape?: string | null;
  entries: FlavorSource[];
};

/** "It is a Psychic type." or "It is a Grass and Poison type." Never "It is a type." */
function typeSentence(types: string[]): string {
  const names = types
    .map((type) => type.trim())
    .filter((type) => type && !/^(?:special|legendary|mythical|unknown)$/i.test(type))
    .map((type) => `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()}`);
  if (names.length === 0) return "";
  const shown = names.slice(0, 2);
  const label = shown.length === 1 ? shown[0]! : `${shown[0]} and ${shown[1]}`;
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
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

export type ClueHints = {
  types: string[];
  genus: string;
  heightDecimetres: number;
  weightHectograms: number;
  habitat: string | null;
  /** Coat colour, such as "Blue". Omitted when the sheet has none. */
  color?: string | null;
};

const STRONG_VERB =
  /\b(has|have|had|lives|live|stores|store|possesses|possess|harbors|harbours|burns|burn|spits|spit|opens|open|flies|fly|swims|swim|hides|hide|grows|grow|carries|carry|keeps|keep|makes|make|uses|use|looks|look|seems|seem|roasts|roast|locks|lock|hooks|hook|does|do|comes|come|runs|run|shoots|shoot|builds|build|wears|wear|holds|hold|glows|glow|sleeps|sleep|eats|eat|bites|bite|floats|float|dives|dive|leaps|leap|sings|sing|calls|call|changes|change|protects|protect|melts|melt|causes|cause|intimidates|kicks|kick|charges|charge|watches|watch|stands|stand|walks|walk|climbs|climb|shreds|shred|clamps|clamp)\b/i;

const BODY_NOUN =
  /\b(mouth|jaw|jaws|tail|wing|wings|fang|fangs|claw|claws|horn|horns|shell|ear|ears|eye|eyes|paw|paws|fin|fins|head|neck|arm|arms|leg|legs|tooth|teeth|spike|spikes|seed|seeds|flower|flame|flames|fire|leaf|leaves|fur|beak|tongue|mask|sacs|cheek|cheeks|electricity)\b/i;

function familyNames(sheet: MonSheet): string[] {
  const into = sheet.evolvesInto ?? [];
  return [...new Set([sheet.name, sheet.evolvesFrom ?? "", ...into].filter(Boolean))];
}

function verbatimRun(short: string, original: string): number {
  const words = short
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const hay = ` ${original.toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim()} `;
  for (let size = Math.min(12, words.length); size >= 6; size -= 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      if (hay.includes(` ${words.slice(index, index + size).join(" ")} `)) return size;
    }
  }
  return 0;
}

function hideLeadingName(text: string, names: string[]): string {
  let hidden = text;
  const ordered = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    const token = escapeRegExp(name);
    hidden = hidden.replace(new RegExp(`^${token}['’]s(?![\\p{L}\\p{N}])`, "iu"), "Its");
    hidden = hidden.replace(
      new RegExp(`^(Once|When|If|Because|After|Before|While|Although)\\s+${token}(?![\\p{L}\\p{N}])`, "iu"),
      "$1 It",
    );
    hidden = hidden.replace(new RegExp(`^${token}(?![\\p{L}\\p{N}])`, "iu"), "It");
  }
  return hidden.replace(/\bIt It\b/g, "It").replace(/\s+/g, " ").trim();
}

function acceptTrait(value: string, original: string, names: string[]): string {
  const line = asSentence(value);
  const count = wordCount(line);
  if (!line || count < 3 || count > 12) return "";
  if (names.some((name) => mentionsName(name, line))) return "";
  if (verbatimRun(line, original) >= 6) return "";
  if (/^(once|when|if|because|although|though)\b/i.test(line)) return "";
  if (SKIP.test(line)) return "";
  if (!/^(it|its|the|a|an)\b/i.test(line)) return "";
  if (!STRONG_VERB.test(line) && !BODY_NOUN.test(line)) return "";
  return line;
}

const IRREGULAR_PLURAL = new Set(["teeth", "feet", "geese", "mice", "people", "children"]);

function pluralNoun(noun: string): boolean {
  const word = noun.toLowerCase();
  if (IRREGULAR_PLURAL.has(word)) return true;
  return /s$/i.test(word) && !/ss$/i.test(word);
}

function placedTrait(text: string): string {
  const match = text.match(
    /\b(seed|seeds|flower|flowers|fruit|fruits|shell|leaf|leaves|flame|flames|horn|horns|spike|spikes|fang|fangs|wing|wings|fin|fins|tail)\b(?:\s+\w+){0,6}\s+on its (back|head|tail|belly|forehead|chest|shell)\b/i,
  );
  if (!match?.[1] || !match[2]) return "";
  const noun = match[1].toLowerCase();
  const place = match[2].toLowerCase();
  return pluralNoun(noun) ? `It has ${noun} on its ${place}` : `It has a ${noun} on its ${place}`;
}

function describedTrait(text: string): string {
  const match = text.match(
    /\b(huge|big|long|sharp|small|tiny|large|giant|massive|thick|soft|hard|sawlike|powerful|strong|wide|hot|cold|bright|round)\s+(mouth|jaw|jaws|tail|wing|wings|fang|fangs|claw|claws|horn|horns|shell|ear|ears|eye|eyes|paw|paws|fin|fins|head|arm|arms|leg|legs|tooth|teeth|spike|spikes|seed|seeds|flower|flame|flames|leaf|leaves|beak|tongue|mask|body)\b/i,
  );
  if (!match?.[1] || !match[2]) return "";
  const adjective = match[1].toLowerCase();
  const noun = match[2].toLowerCase();
  if (pluralNoun(noun)) return `It has ${adjective} ${noun}`;
  const article = /^[aeiou]/i.test(adjective) ? "an" : "a";
  return `It has ${article} ${adjective} ${noun}`;
}

function clipClause(clause: string): string {
  let text = clause.replace(/\s+/g, " ").trim();
  text = text.replace(/^(once|when|if|because|after|before|while|although|though|and|but|so|from)\s+/i, "");
  text = text.replace(/\bat the tip of its\b/gi, "on its");
  text = text.replace(/\bin order to\b/gi, "to");
  text = text.replace(/\b(absolutely|completely|entirely|very|really|quite|extremely)\b/gi, "");
  text = text.replace(/^(this pokémon|this pokemon)\s+/i, "It ");
  text = text.replace(/\s+/g, " ").trim();
  if (/^(possesses|harbors|harbours|stores|lives|uses|makes|has|keeps|seems|appears|looks)\b/i.test(text)) {
    text = `It ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  const cut = text.split(/\s+\b(?:in which|that|which|before|after|when|with|by)\b/i)[0] ?? text;
  return cut.replace(/\s+/g, " ").trim();
}

/** One short spoken sentence inspired by a dex line, or nothing if it would be a paste. */
function distillSentence(sentence: string, names: string[]): string {
  if (SKIP.test(sentence)) return "";
  const hidden = hideLeadingName(sentence, names);
  if (!hidden || names.some((name) => mentionsName(name, hidden))) return "";
  const early = [
    /\b(?:has|have) clamped its jaws\b|\bclamps its jaws\b/i.test(hidden) && /\bnot let go\b/i.test(hidden)
      ? "Its jaws lock shut and do not let go"
      : "",
    /\bfangs?\b/i.test(hidden) && /\bfishhooks?\b/i.test(hidden) ? "The fangs hook backward like fishhooks" : "",
    /\bflame burns\b/i.test(hidden) && /\btail\b/i.test(hidden) ? "A flame burns on its tail" : "",
    placedTrait(hidden),
    describedTrait(hidden),
  ];
  for (const candidate of early) {
    const line = candidate ? acceptTrait(candidate, sentence, names) : "";
    if (line) return line;
  }
  const clauses = hidden.split(/[,;:—–]/).map((part) => part.trim()).filter(Boolean);
  for (const clause of clauses) {
    const line = acceptTrait(clipClause(clause), sentence, names);
    if (line) return line;
  }
  return "";
}

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

/**
 * One comparison from the real height and weight.
 * The two halves never lean on the same object, and they never say "a grown person" twice.
 */
function sizeComparison(decimetres: number, hectograms = 0): string {
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

function traitLines(sheet: MonSheet): string[] {
  const names = familyNames(sheet);
  const traits: string[] = [];
  for (const entry of sheet.entries) {
    const sentences = entry.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    for (const sentence of sentences) {
      const line = distillSentence(sentence, names);
      if (!line || traits.includes(line)) continue;
      traits.push(line);
    }
  }
  return traits;
}

function bodyScore(line: string): number {
  if (/fang|horn|spike|flame|seed|claw|tongue|beak|shell|wing|tail/i.test(line)) return 2;
  if (BODY_NOUN.test(line)) return 1;
  return 0;
}

const JUNK_CLUE =
  /nobody is watching|quiet habit|body of (?:a|an|the)\b|body part that stands out|size is hard to picture|strange habit all day/i;

/** Genus tails that are moods, not body parts. Never used as "the body of a placid". */
const TEMPERAMENT: Record<string, string> = {
  placid: "It stays calm",
  calm: "It stays calm",
  serene: "It stays calm",
  silent: "It stays quiet",
  playful: "It likes to play",
  jolly: "It is cheerful",
  lazy: "It likes to take things easy",
  sleeping: "It spends a lot of time asleep",
  dopey: "It seems a bit dopey",
};

const BODY_PARTS = new Set(
  "jaw jaws seed flame tail wing wings horn horns claw claws fang fangs shell beak fin fins tongue whiskers tusk tusks thorn spikes spike quill leaf flower nose eye eyes head face wool balloon ball sword blade drill shield bell egg".split(
    " ",
  ),
);

const CREATURES = new Set(
  "mouse bird snake fish fox dragon monkey cat mushroom lizard puppy horse fossil star rabbit coal dog spirit cocoon fairy bat moth duck tadpole scorpion pig whale fruit croc turtle worm weed mole rock crab lion penguin tree gear nut bloom olive butterfly bee jellyfish pincer vine beetle owl gecko swallow cactus doll chimp cricket weasel slug skunk pigeon kelp jewel pumpkin larva fly bubble raven sheep hog eel dolphin bug cobra insect coconut mantis bull herb bear swine cow chick fowl raccoon panda ferret lily shrimp puppet hat beaver bud shark hippo otter snail buffalo vulture ant torch colt robin cub poodle apple wolf donkey kite pin".split(
    " ",
  ),
);

const MATERIALS = new Set(["gas", "snow", "lava", "sludge", "steam", "iron", "bronze"]);

const SHAPE_LINE: Record<string, string> = {
  ball: "It is round",
  squiggle: "Its body is long and bendy",
  fish: "It is shaped like a fish",
  arms: "It has a pair of arms",
  blob: "Its body is one big mass",
  upright: "It stands on two legs",
  legs: "It has many legs",
  quadruped: "It walks on four legs",
  wings: "It has wings",
  tentacles: "It has tentacles",
  heads: "It has more than one head",
  humanoid: "It stands like a person",
  "bug-wings": "It has thin insect wings",
  armor: "It is covered in armor",
};

const HABIT_VERB =
  /\b(stirs|spits|stores|sings|roasts|wears|locks|lock|lives|eats|sleeps|flies|hides|grows|makes|roams|floats|dives|suffers|emits|appears|devours|crosses|changes|waits|watches|runs|calls|glows|builds|keeps|uses|plays|likes|stays|says|spends)\b/i;

/** A clipped dex line: dangling word, plural verb, or a filler species label. */
function brokenClue(clean: string): boolean {
  if (/\b(?:from|by|of|to|with|for|into|about|than|as|like|and|or|but|a|an|the)\.$/i.test(clean)) return true;
  if (/^The (?:way|longer|more|less)\b/.test(clean)) return true;
  if (/^It was [a-z]+(?:ed|en)\.$/i.test(clean)) return true;
  if (/\b(?:different|new) species\b/i.test(clean)) return true;
  if (/\bIt (?:are|were|have|live|do)\b/.test(clean)) return true;
  if (/\bit['’]s\s+(?!unknown\b)/i.test(clean)) return true;
  if (/\ba\s+its\b/i.test(clean)) return true;
  if (/\b(?:its|it)\.$/i.test(clean)) return true;
  if (/\ba(?:n)?\s+(?:[a-z]+\s+){0,2}(?:teeth|feet|geese|mice|people|children)\b/i.test(clean)) return true;
  if (/\b(?:a|an)\s+(?:strange|crackling|massive|tiny|huge|different|powerful|actual|real|special)\.$/i.test(clean)) {
    return true;
  }
  return false;
}

function acceptClue(line: string, names: string[], original = ""): string {
  const clean = asSentence(line)
    .replace(/\bMr\./g, "Mister")
    .replace(/\bMrs\./g, "Missus")
    .replace(/\bJr\./g, "Junior");
  if (!clean || clean.length > 140) return "";
  if (JUNK_CLUE.test(clean) || SKIP.test(clean) || brokenClue(clean)) return "";
  if (/\bpok[eé]mon\b/i.test(clean) || /\btype\b/i.test(clean)) return "";
  if (!/^(It|Its|The|A|An|Experts|People)\b/.test(clean)) return "";
  if (/^It\s+(?:without|and|the|a|an|its|of|in|on|to|for|from|with)\b/.test(clean)) return "";
  if (!/\b(is|are|was|were|has|have|had|lives|live|appears|stirs|spits|stores|sings|roasts|wears|locks|lock|eats|sleeps|flies|hides|grows|makes|suffers|emits|devours|shakes|repairs|swims|stands|walks|looks|keeps|uses|plays|likes|stays|says|spends|shows|can|will|does|comes|runs|calls|glows|builds|floats|dives|roams|waits|watches|hooks|hook|burns|carries|holds|opens|bites|leaps|climbs|protects|melts|causes|kicks|charges|changes|possesses|harbors|harbours|gathers|generates)\b/i.test(clean)) {
    return "";
  }
  const count = wordCount(clean);
  if (count < 3 || count > 18) return "";
  if (names.some((name) => mentionsName(name, clean))) return "";
  if (original && verbatimRun(clean, original) >= 8) return "";
  if (/\b(?:a|an)\s+(?:placid|atrocious|wily|brutal|devious|hostile|mysterious|legendary|synthetic|artificial|virtual|patient)\b/i.test(clean)) {
    return "";
  }
  return clean;
}

function genusWords(genus: string): string[] {
  return genus
    .replace(/POK[eé]MON/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !/^(the|a|an)$/i.test(word));
}

/** A real noun from the genus, or nothing when the genus is only a mood word. */
function genusLook(genus: string, names: string[]): string {
  const words = genusWords(genus);
  const tail = words.at(-1)?.toLowerCase() ?? "";
  if (!tail || tail.length < 3 || TEMPERAMENT[tail]) return "";
  const adjective = words
    .slice(0, -1)
    .map((word) => word.toLowerCase())
    .filter((word) => /^(big|little|tiny|huge|long|small|giant|great|sharp|soft)$/.test(word));
  const label = [...adjective, tail].join(" ");
  let line = "";
  if (BODY_PARTS.has(tail)) {
    const article = /^[aeiou]/i.test(label) ? "an" : "a";
    line = pluralNoun(tail) ? `It has ${label}` : `It has ${article} ${label}`;
  } else if (CREATURES.has(tail)) {
    const article = /^[aeiou]/i.test(tail) ? "an" : "a";
    line = `It looks like ${article} ${tail}`;
  } else if (MATERIALS.has(tail)) {
    line = `It is made of ${tail}`;
  }
  return line ? acceptClue(line, names) : "";
}

function temperament(genus: string, names: string[]): string {
  const tail = genusWords(genus).at(-1)?.toLowerCase() ?? "";
  const line = TEMPERAMENT[tail];
  return line ? acceptClue(line, names) : "";
}

/** Colour plus shape, both from the catalogue. Empty when neither is on the sheet. */
function lookLine(sheet: MonSheet, names: string[]): string {
  const shade = sheet.color?.trim().toLowerCase() ?? "";
  const shapeLine = SHAPE_LINE[sheet.shape ?? ""] ?? "";
  if (shade && shapeLine) {
    if (shapeLine.startsWith("It is ")) return acceptClue(`It is ${shade} and ${shapeLine.slice(6)}`, names);
    const rest = `${shapeLine.charAt(0).toLowerCase()}${shapeLine.slice(1)}`;
    return acceptClue(`It is ${shade}, and ${rest}`, names);
  }
  if (shapeLine) return acceptClue(shapeLine, names);
  if (shade) return acceptClue(`It is ${shade} all over`, names);
  return "";
}

/** Rewrites a dex line into a short habit. A long paste is dropped. */
function inspiredHabits(text: string, names: string[]): string[] {
  const ideas: string[] = [];
  const offer = (line: string) => {
    const clean = acceptClue(line, names, text);
    if (clean && !ideas.includes(clean)) ideas.push(clean);
  };
  if (/anger|angered|angry/i.test(text) && /gale|wind|storm/i.test(text)) {
    offer("It stirs up a gale when it gets angry");
  }
  if (/spits fire/i.test(text) && /melt/i.test(text)) offer("It spits fire hot enough to melt rock");
  if (/cheek/i.test(text) && /electric/i.test(text)) offer("It stores electricity in its cheeks");
  if (/sings/i.test(text) && /sleep/i.test(text)) offer("Its song makes a listener sleepy");
  if (/headache/i.test(text)) offer("It suffers from a lasting headache");
  if (/costume/i.test(text)) offer("It wears a costume so it looks less scary");
  if (/mirage/i.test(text)) offer("Experts still say it is a mirage");
  if (/thin air/i.test(text)) offer("It can make walls out of thin air");
  if (/roasts/i.test(text) && /berr/i.test(text)) offer("It roasts berries before it eats them");
  if (/seed on its back/i.test(text) && /grow/i.test(text)) offer("It grows by using the seed on its back");
  if (/cloak/i.test(text) && /repair/i.test(text)) offer("It repairs its cloak when the cloak gets torn");
  if (/shakes its body/i.test(text) && /electric/i.test(text)) offer("It shakes its body to make electricity");
  if (/spring water/i.test(text)) offer("It shows up where the spring water is clean");
  return ideas;
}

const THIRD_PERSON: Record<string, string> = {
  are: "is",
  have: "has",
  live: "lives",
  gather: "gathers",
  do: "does",
  fly: "flies",
};

/** "Cryogonal are" and "Morelull live" become "It is" and "It lives". */
function asItSubject(line: string): string {
  let text = line.replace(/^(?:and|but|so)\s+/i, "");
  if (/^its\b/i.test(text)) text = `Its${text.slice(3)}`;
  else if (/^it\b/i.test(text)) text = `It${text.slice(2)}`;
  return text.replace(/^It\s+([A-Za-z]+)/, (full, verb: string) => {
    const next = THIRD_PERSON[verb.toLowerCase()];
    return next ? `It ${next}` : full;
  });
}

/** A short clause from the dex line. Paragraphs and name drops are refused. */
function plainLines(text: string, names: string[]): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const lines: string[] = [];
  for (const sentence of sentences) {
    if (SKIP.test(sentence)) continue;
    let line = hideLeadingName(sentence, names);
    const ordered = [...names].filter(Boolean).sort((left, right) => right.length - left.length);
    for (const name of ordered) {
      const token = escapeRegExp(name);
      line = line.replace(new RegExp(`\\ba\\s+${token}['’]s(?![\\p{L}\\p{N}])`, "giu"), "its");
      line = line.replace(new RegExp(`${token}['’]s(?![\\p{L}\\p{N}])`, "giu"), "its");
      line = line.replace(new RegExp(`\\b${token}(?![\\p{L}\\p{N}])`, "giu"), "it");
    }
    line = line.replace(/[—–]/g, ", ").replace(/\s+/g, " ").trim();
    line = line.replace(/^(?:once|when|if|because|after|before|while|although|though)\b[^,]{0,90},\s*/i, "");
    line = line.replace(/^they\s+(\w+)/i, (_, verb: string) => {
      const next = THIRD_PERSON[verb.toLowerCase()] ?? (verb.endsWith("s") ? verb : `${verb}s`);
      return `It ${next}`;
    });
    line = line.replace(/\btheir\b/gi, "its");
    line = line.replace(/^this\s+(?:[a-z'-]+\s+){1,3}(?=(?:appears|lives|roasts|sings|eats|flies|hides|waits|makes|uses|has|keeps|spits|stores|wears|grows|sleeps|swims|devours|shakes|seems)\b)/i, "It ");
    if (/^(appears|shakes|suffers|possesses|harbors|harbours|stores|lives|uses|makes|has|keeps|seems|swims|flies|hides|roams|spits|sings|wears|grows|floats|dives|emits|runs|eats|sleeps)\b/i.test(line)) {
      line = `It ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
    }
    line = asItSubject(line);
    const cut = line.split(/\s+\b(?:in which|that|which|before|after|when|because)\b/i)[0] ?? line;
    const clause = (cut.split(/[,;]/)[0] ?? cut).replace(/\s+/g, " ").trim();
    const clean = acceptClue(clause, names, text);
    if (clean && !lines.includes(clean)) lines.push(clean);
  }
  return lines;
}

function sameIdea(left: string, right: string): boolean {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .replace(/s\b/g, "")
      .split(/\W+/)
      .filter((word) => word.length > 3);
  const rightWords = new Set(norm(right));
  const shared = norm(left).filter((word) => rightWords.has(word));
  if (shared.length >= 2) return true;
  const nouns = ["cheek", "seed", "fang", "jaw", "wing", "flame", "fire", "shell", "cloak", "fin", "tail", "horn", "fruit"];
  const blob = `${left} ${right}`.toLowerCase();
  return nouns.some((noun) => left.toLowerCase().includes(noun) && right.toLowerCase().includes(noun) && blob.includes(noun));
}

function prefersHabit(line: string): boolean {
  if (/\bhas (?:a|an|the|many|big|thin)\b/i.test(line) && bodyScore(line) > 0 && !/\b(lock|locks|stirs|spits|stores|grows|wears)\b/i.test(line)) {
    return false;
  }
  return HABIT_VERB.test(line);
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
  const key = extra.toLowerCase().replace(/[.!?]$/, "");
  return clues.some((clue) => {
    const other = clue.toLowerCase().replace(/[.!?]$/, "");
    return other === key || other.includes(key) || key.includes(other);
  });
}

const DEX_JUNK =
  /nobody is watching|quiet habit|body of (?:a|an|the)\b|body part that stands out|size is hard to picture|strange habit all day/i;

const DANGLING_END =
  /\b(?:from|by|of|to|with|for|into|about|than|as|like|and|or|but|a|an|the)\.$/i;

const CLIPPED_ADJECTIVE =
  /\b(?:a|an|the)\s+(?:strange|crackling|massive|tiny|huge|different|powerful|actual|real|special|fierce)\.$/i;

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

/** "Cryogonal are" and "this Pokémon" become "It is" and "It". */
function withoutPokemonName(sentence: string, names: string[]): string {
  let line = sentence.replace(/[—–]/g, ", ").replace(/\s+/g, " ").trim();
  line = line.replace(/\bthis\s+(?:[a-z'-]+\s+){0,4}pok[eé]mon['’]s\b/gi, "its");
  line = line.replace(/\bthis\s+(?:[a-z'-]+\s+){0,4}pok[eé]mon\b/gi, "it");
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
  line = line.replace(/\ba\s+its\b/gi, "its").replace(/\s+/g, " ").trim();
  line = line.replace(
    /^This\s+[a-z'-]+\s+(?=appears|is|has|can|will|lives|keeps|makes|shares|roasts|grows|comes|flies|swims|eats|sleeps|seems|looks|uses|gives|takes|gets|does)\b/i,
    "It ",
  );
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

function spokenDexLine(line: string, names: string[]): string {
  if (/^[a-z]/.test(line)) line = `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
  if (/^it\b/.test(line)) line = `It${line.slice(2)}`;
  if (!line || DEX_JUNK.test(line) || SKIP.test(line) || DANGLING_END.test(line) || CLIPPED_ADJECTIVE.test(line)) {
    return "";
  }
  if (/\bIt (?:are|were|have|live|do)\b/.test(line) || /^The (?:way|longer|more|less)\b/.test(line)) return "";
  if (/^It was [a-z]+(?:ed|en)\.$/i.test(line)) return "";
  if (/^(?:although|though|if|because|before|after|while|unless)\b/i.test(line) && !/,/.test(line)) return "";
  if (names.some((name) => mentionsName(name, line))) return "";
  const count = wordCount(line);
  if (count < 4 || count > 24) return "";
  if (/^It is an? (?:[A-Za-z-]+(?: and [A-Za-z-]+)? )?type\.$/i.test(line)) return "";
  return line;
}

/** A long dex sentence becomes the first clause a child can say in one breath. */
function fitDexSentence(line: string, names: string[]): string {
  const whole = spokenDexLine(line, names);
  if (whole) return whole;
  const pieces = line
    .replace(/[.!?]+$/, "")
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (pieces.length > 1 && /^(?:once|when|if|because|after|before|while|although|though)\b/i.test(pieces[0] ?? "")) {
    const joined = spokenDexLine(asSentence(`${pieces[0]}, ${pieces[1]}`), names);
    if (joined) return joined;
  }
  for (const piece of pieces) {
    const clause = piece.replace(/^(?:and|but|so)\s+/i, "");
    const spoken = spokenDexLine(asSentence(clause), names);
    if (spoken) return spoken;
  }
  const softened = line.split(/\s+\b(?:and|but|which|that|once|how)\b/i);
  for (const piece of softened) {
    const spoken = spokenDexLine(asSentence(piece.trim()), names);
    if (spoken) return spoken;
  }
  return "";
}

/**
 * One sentence from a real Pokédex line, with the species name taken out.
 * A line that is only the name is skipped for the next sentence or version.
 */
function dexHint(entries: FlavorSource[], names: string[]): string {
  const prepared = prepareEntries(entries);
  const pool = prepared.length > 0 ? prepared : entries;
  for (const entry of pool) {
    const sentences = entry.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    for (const sentence of sentences) {
      const bare = sentence.replace(/[.!?]+$/, "").trim();
      if (!bare || names.some((name) => bare.toLowerCase() === name.toLowerCase())) continue;
      const spoken = withoutPokemonName(sentence, names);
      const fitted = fitDexSentence(spoken, names);
      if (fitted) return fitted;
    }
  }
  return "";
}

function colorSentence(color: string | null | undefined): string {
  const shade = color?.trim().toLowerCase() ?? "";
  if (!shade) return "";
  return `It is ${shade}.`;
}

/**
 * Four clues: a Pokédex sentence, the type, the colour, and a size picture.
 * Colour is skipped only when the species has no colour stored.
 */
export function shortClues(sheet: MonSheet): string[] {
  const dex = dexHint(sheet.entries, [sheet.name]);
  const type = sheet.types.length > 0 ? typeSentence(sheet.types) : "";
  const color = colorSentence(sheet.color);
  const size = sizeComparison(sheet.heightDecimetres, sheet.weightHectograms);
  return [dex, type, color, size].filter((line) => line.length > 0);
}

/** Splits a spoken riddle so the countdown stays one line, not three orphan words. */
export function riddleParts(script: string): { numberLabel: string; clues: string[]; countdown: string } {
  const countdown = "Shout your guess. One. Two. Three.";
  const hasCount = script.endsWith(countdown);
  const body = (hasCount ? script.slice(0, -countdown.length) : script).trim();
  const number = body.match(/^Number (\d+)\./);
  const rest = (number ? body.slice(number[0].length) : body).trim();
  const clues = rest
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    numberLabel: number?.[1] ? `Number ${number[1]}` : "",
    clues,
    countdown: hasCount ? countdown : "",
  };
}

/** One new sentence for the answer track. It does not repeat a clue. */
export function answerExtra(sheet: MonSheet, clues: string[]): string {
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

/** Spoken Guess Who scripts. The cry is joined in front of each track later. */
export function guessSpoken(sheet: MonSheet): { clue: string; answer: string } {
  const clues = shortClues(sheet);
  const clue = `Number ${sheet.id}. ${clues.join(" ")} Shout your guess. One. Two. Three.`;
  const answer = `It is ${sheet.name}. ${answerExtra(sheet, clues)}`;
  return {
    clue: clue.replace(/\s+/g, " ").trim(),
    answer: answer.replace(/\s+/g, " ").trim(),
  };
}

/**
 * Clues that do not say the name.
 * Kept for callers that only have a dex line and a few hints.
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
