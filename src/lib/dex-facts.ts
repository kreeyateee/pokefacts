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

const SKIP =
  /\b(kill|killing|death|dead|dying)\b|\blives\b|life would end/i;
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
  const entry = prepareEntries(entries)[0];
  if (!entry) {
    throw new Error("PokéAPI returned no usable English Pokédex entry.");
  }
  return entry;
}

function hideName(name: string, sentence: string): string {
  return sentence
    .replace(new RegExp(`\\b${name}\\b`, "gi"), "This Pokémon")
    .replace(/\s+/g, " ")
    .trim();
}

export type MonSheet = {
  id: number;
  name: string;
  genus: string;
  types: string[];
  heightDecimetres: number;
  weightHectograms: number;
  stats: Array<{ name: string; value: number }>;
  abilityName: string | null;
  abilityEffect: string | null;
  evolution: string;
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
      if (new RegExp(`^${name}\\b`).test(line) || !BARE_VERBS.has(first)) return line;
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
  return asSentence(line.replace(new RegExp(`^${sheet.name} becomes\\b`), "It becomes"));
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
  const sentence = /^(it|this)\b/i.test(body)
    ? asSentence(body)
    : asSentence(`It ${body.charAt(0).toLowerCase()}${body.slice(1)}`);
  return `Its ability is ${name}. ${sentence}`;
}

/** A second Pokédex sentence, when a later game wrote a different short line. */
function anotherEntry(entries: FlavorSource[], name: string): string {
  const next = prepareEntries(entries)[1];
  if (!next) return "";
  const sentence = next.text.match(/^[^.!?]+[.!?]/)?.[0]?.trim() ?? "";
  if (sentence.length < 40 || sentence.length > 180) return "";
  return withSubject(sentence, name);
}

/**
 * One spoken entry: name, type, Pokédex text, weight, height, then a few facts.
 * Kept short enough to finish in under a minute.
 */
export function dexBlurb(sheet: MonSheet, number: string): string {
  const entry = pickDexEntry(sheet.entries);
  const genus = sheet.genus.replace(/POK[eé]MON/gi, "Pokémon");
  const parts = [
    `This is ${sheet.name}. It is number ${number}.`,
    typeSentence(sheet.types),
    `It is the ${genus}.`,
    withSubject(entry.text, sheet.name),
    `It weighs ${kilogramsSpeech(sheet.weightHectograms)}. It is ${centimetresSpeech(sheet.heightDecimetres)} tall.`,
    abilityFact(sheet.abilityName, sheet.abilityEffect),
    evolutionFact(sheet),
    anotherEntry(sheet.entries, sheet.name),
    homeFact(sheet.habitat),
  ].filter(Boolean);
  const extra = anotherEntry(sheet.entries, sheet.name);
  let text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (text.length > 950 && extra) {
    text = parts
      .filter((part) => part !== extra)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return text;
}

export function threeClues(name: string, entries: FlavorSource[]): string[] {
  const clues: string[] = [];
  const seen = new Set<string>();
  for (const entry of prepareEntries(entries)) {
    const sentences = entry.text.match(/[^.!?]+[.!?]+/g) ?? [entry.text];
    for (const sentence of sentences) {
      const hidden = hideName(name, sentence);
      if (hidden.length < 40 || hidden.length > 220) continue;
      if (new RegExp(`\\b${name}\\b`, "i").test(hidden)) continue;
      const key = hidden.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      clues.push(hidden);
      if (clues.length === 3) return clues;
    }
  }
  if (clues.length < 3) {
    throw new Error(`PokéAPI did not yield three clues for ${name}.`);
  }
  return clues;
}
