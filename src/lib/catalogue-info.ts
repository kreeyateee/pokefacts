import { cleanFlavor } from "@/lib/format";

/**
 * Game order for an English Pokédex line.
 * Version ids in the PokéAPI tables are not release order: the original
 * Japanese cartridges were added long after Scarlet and Violet.
 */
const CATALOGUE_VERSION_ORDER = [
  "red-japan",
  "green-japan",
  "blue-japan",
  "red",
  "blue",
  "yellow",
  "gold",
  "silver",
  "crystal",
  "ruby",
  "sapphire",
  "emerald",
  "firered",
  "leafgreen",
  "colosseum",
  "xd",
  "diamond",
  "pearl",
  "platinum",
  "heartgold",
  "soulsilver",
  "black",
  "white",
  "black-2",
  "white-2",
  "x",
  "y",
  "omega-ruby",
  "alpha-sapphire",
  "sun",
  "moon",
  "ultra-sun",
  "ultra-moon",
  "lets-go-pikachu",
  "lets-go-eevee",
  "sword",
  "shield",
  "the-isle-of-armor-sword",
  "the-isle-of-armor-shield",
  "the-crown-tundra-sword",
  "the-crown-tundra-shield",
  "brilliant-diamond",
  "shining-pearl",
  "legends-arceus",
  "scarlet",
  "violet",
  "the-teal-mask-scarlet",
  "the-teal-mask-violet",
  "the-indigo-disk-scarlet",
  "the-indigo-disk-violet",
  "legends-za",
  "mega-dimension",
  "champions",
] as const;

const HARSH =
  /\b(kill|kills|killed|killing|death|dead|dying|dies|died|deceased)\b/i;

/** Units of feet, pounds, or Fahrenheit. Body-part "feet" does not count. */
const IMPERIAL =
  /\b(pounds|pound|fahrenheit)\b|\b\d[\d,]*(?:\.\d+)?\s*-?\s*(?:feet|foot|inches|inch)\b/i;

export type DexCandidate = {
  text: string;
  /** Higher means a newer game. */
  rank: number;
  version: string;
};

export function catalogueVersionRank(identifier: string): number {
  const index = CATALOGUE_VERSION_ORDER.indexOf(
    identifier as (typeof CATALOGUE_VERSION_ORDER)[number],
  );
  return index;
}

/**
 * Newest useful English Pokédex line.
 * Lines that talk about killing or death are skipped.
 * When one line uses feet or pounds and another does not, the metric line wins.
 */
function usableDexLines(entries: DexCandidate[]) {
  const cleaned = entries
    .map((entry) => ({
      text: cleanFlavor(entry.text),
      rank: entry.rank,
      version: entry.version,
    }))
    .filter((entry) => entry.text.length >= 12 && entry.rank >= 0 && !HARSH.test(entry.text))
    .sort((a, b) => b.rank - a.rank || a.version.localeCompare(b.version));

  const unique: typeof cleaned = [];
  for (const entry of cleaned) {
    if (!unique.some((kept) => kept.text === entry.text)) unique.push(entry);
  }
  const metric = unique.filter((entry) => !IMPERIAL.test(entry.text));
  return metric.length > 0 ? metric : unique;
}

export function pickCatalogueInfo(
  entries: DexCandidate[],
): { text: string; version: string } | null {
  const chosen = usableDexLines(entries)[0];
  return chosen ? { text: chosen.text, version: chosen.version } : null;
}

/**
 * Newest useful English line, plus the oldest line whose wording and game differ.
 * The second line is the other Pokédex source for Who's That Pokémon.
 */
export function pickCataloguePair(entries: DexCandidate[]): {
  primary: { text: string; version: string } | null;
  secondary: { text: string; version: string } | null;
} {
  const pool = usableDexLines(entries);
  const primary = pool[0] ?? null;
  if (!primary) return { primary: null, secondary: null };
  const secondary =
    [...pool].reverse().find((entry) => entry.text !== primary.text && entry.version !== primary.version) ??
    null;
  return {
    primary: { text: primary.text, version: primary.version },
    secondary: secondary ? { text: secondary.text, version: secondary.version } : null,
  };
}
