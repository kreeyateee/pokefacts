import { cleanFlavor, versionName, versionRank } from "@/lib/format";

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
