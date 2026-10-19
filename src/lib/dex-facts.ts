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

export type ClueHints = {
  types: string[];
  genus: string;
  heightDecimetres: number;
  weightHectograms: number;
  habitat: string | null;
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

function pluralNoun(noun: string): boolean {
  return /s$/i.test(noun) && !/ss$/i.test(noun);
}

function placedTrait(text: string): string {
  const match = text.match(
    /\b(seed|seeds|flower|flowers|shell|leaf|leaves|flame|flames|horn|horns|spike|spikes|fang|fangs|wing|wings|fin|fins|tail)\b(?:\s+\w+){0,5}\s+on its (back|head|tail|belly|forehead|chest)\b/i,
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

function bodyHint(genus: string, names: string[]): string {
  const cleaned = genus.replace(/POK[eé]MON/gi, "Pokémon").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const line = asSentence(`It is the ${cleaned}`);
  return names.some((name) => mentionsName(name, line)) ? "" : line;
}

function sizeComparison(decimetres: number): string {
  const centimetres = decimetres * 10;
  if (centimetres <= 30) return "It is much smaller than a house cat.";
  if (centimetres <= 60) return "It is about as tall as a house cat.";
  if (centimetres <= 100) return "It is about as tall as a child.";
  if (centimetres <= 160) return "It is about as tall as a grown person.";
  if (centimetres <= 300) return "It is taller than a grown person.";
  return "It is huge, much taller than a person.";
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

/**
 * Exactly three short clue sentences. They never say the species name
 * or an evolution name. A dex line can inspire one of them, cut to a
 * single spoken sentence. The rest come from type, body, home, or size.
 */
export function shortClues(sheet: MonSheet): string[] {
  const names = familyNames(sheet);
  const traits: string[] = [];
  for (const entry of sheet.entries) {
    const sentences = entry.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    for (const sentence of sentences) {
      const line = distillSentence(sentence, names);
      if (!line || traits.includes(line)) continue;
      traits.push(line);
      if (traits.length === 2) break;
    }
    if (traits.length === 2) break;
  }

  const clues: string[] = [];
  const push = (line: string) => {
    const clean = asSentence(line);
    if (!clean || clues.includes(clean) || clean.length > 120) return;
    if (names.some((name) => mentionsName(name, clean))) return;
    clues.push(clean);
  };
  for (const trait of traits.slice(0, 2)) push(trait);
  const home = homeFact(sheet.habitat);
  const body = bodyHint(sheet.genus, names);
  if (clues.length < 2) push(home);
  if (clues.length < 2) push(body);
  push(typeSentence(sheet.types));
  if (clues.length < 3) push(home);
  if (clues.length < 3) push(body);
  if (clues.length < 3 && sheet.heightDecimetres > 0) push(sizeComparison(sheet.heightDecimetres));
  for (const filler of [
    "It has a look you can picture.",
    "Its home is part of the riddle.",
    "Its type is part of the riddle.",
  ]) {
    if (clues.length >= 3) break;
    push(filler);
  }
  return clues.slice(0, 3);
}

/** One new sentence for the answer track. It is not one of the three clues. */
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
 * Three short clues that do not say the name.
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
    entries,
  });
}
