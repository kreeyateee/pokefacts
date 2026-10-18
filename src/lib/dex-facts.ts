import {
  cleanFlavor,
  kilogramsSpeech,
  metresSpeech,
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

function typeLine(types: string[]): string {
  const names = types.map((type) => type.charAt(0).toUpperCase() + type.slice(1));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names[0]} and ${names[1]}`;
}

/** One short extra line. A long evolution list stays a short list of names. */
function shortExtra(sheet: MonSheet): string {
  const cleaned = sheet.evolution.replace(/\s*This briefing is for .+$/i, "").trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [];
  if (sentences.length > 3) {
    const names = [...cleaned.matchAll(/becomes ([A-Z][A-Za-z'.-]*)/g)]
      .map((match) => match[1])
      .slice(0, 3);
    if (names.length >= 2) return `It can become ${names.join(", ")}, and others.`;
  }
  const about = sentences.find((sentence) =>
    new RegExp(`\\b${sheet.name}\\b`).test(sentence),
  );
  return (about ?? sentences[0] ?? "").trim();
}

/** Name, type, Pokédex entry, height, weight, and one short extra line. */
export function dexBlurb(sheet: MonSheet, number: string): string {
  const entry = pickDexEntry(sheet.entries);
  const genus = sheet.genus.replace(/POK[eé]MON/gi, "Pokémon");
  return [
    `Number ${number}. ${sheet.name}.`,
    `${typeLine(sheet.types)}.`,
    `The ${genus}.`,
    entry.text,
    `${metresSpeech(sheet.heightDecimetres)}. ${kilogramsSpeech(sheet.weightHectograms)}.`,
    shortExtra(sheet),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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
