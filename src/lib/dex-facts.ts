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

function hideName(name: string, sentence: string): string {
  let hidden = sentence;
  for (const form of nameForms(name)) {
    hidden = hidden.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(form)}(?![\\p{L}\\p{N}])`, "giu"),
      "This Pokémon",
    );
  }
  return hidden.replace(/\s+/g, " ").trim();
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

function fallbackClues(name: string, hints?: ClueHints): string[] {
  const generic = [
    "Its type is a clue.",
    "Its size is a clue.",
    "Its home is a clue.",
  ];
  if (!hints) return generic.filter((line) => !mentionsName(name, line));
  const genus = hints.genus.replace(/POK[eé]MON/gi, "Pokémon");
  const weight = `It weighs ${kilogramsSpeech(hints.weightHectograms)}`;
  const height = `It is ${centimetresSpeech(hints.heightDecimetres)} tall`;
  const home = homeFact(hints.habitat);
  const lines = [
    typeSentence(hints.types),
    asSentence(`${weight}, and ${height.charAt(0).toLowerCase()}${height.slice(1)}`),
    home || "It has no usual home.",
    asSentence(`It is the ${genus}`),
    asSentence(weight),
    asSentence(height),
    "Its type, its size, and its home are the three clues.",
    "Picture the Pokémon these clues describe.",
    "Say the name when the count ends.",
    ...generic,
  ];
  return lines.map((line) => asSentence(line)).filter((line) => line && !mentionsName(name, line));
}

/**
 * Three clues that do not say the name.
 * Pokédex sentences come first. If a species does not have three usable
 * sentences, the rest are written from its type, category, size, and home.
 */
export function threeClues(name: string, entries: FlavorSource[], hints?: ClueHints): string[] {
  const clues: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    const hidden = line.replace(/\s+/g, " ").trim();
    if (!hidden || mentionsName(name, hidden) || hidden.length > 220) return;
    const key = hidden.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    clues.push(hidden);
  };

  for (const entry of prepareEntries(entries)) {
    const sentences = entry.text.match(/[^.!?]+[.!?]+/g) ?? [entry.text];
    for (const sentence of sentences) {
      const hidden = hideName(name, sentence);
      if (hidden.length < 40) continue;
      push(hidden);
      if (clues.length === 3) return clues;
    }
  }

  for (const extra of fallbackClues(name, hints)) {
    push(extra);
    if (clues.length === 3) return clues;
  }

  for (let guard = 1; clues.length < 3 && guard <= 6; guard += 1) {
    push(`Clue ${guard}.`);
  }
  while (clues.length < 3) clues.push(`${clues.length + 1}.`);
  return clues.slice(0, 3);
}
