const SPECIAL_NAMES: Record<string, string> = {
  "mr-mime": "Mr. Mime",
  "mime-jr": "Mime Jr.",
  "mr-rime": "Mr. Rime",
  "nidoran-f": "Nidoran♀",
  "nidoran-m": "Nidoran♂",
  "ho-oh": "Ho-Oh",
  "porygon-z": "Porygon-Z",
  "type-null": "Type: Null",
  "jangmo-o": "Jangmo-o",
  "hakamo-o": "Hakamo-o",
  "kommo-o": "Kommo-o",
  farfetchd: "Farfetch'd",
  sirfetchd: "Sirfetch'd",
  flabebe: "Flabébé",
  "wo-chien": "Wo-Chien",
  "chien-pao": "Chien-Pao",
  "ting-lu": "Ting-Lu",
  "chi-yu": "Chi-Yu",
};

const VERSION_NAMES: Record<string, string> = {
  red: "Red",
  blue: "Blue",
  yellow: "Yellow",
  gold: "Gold",
  silver: "Silver",
  crystal: "Crystal",
  ruby: "Ruby",
  sapphire: "Sapphire",
  emerald: "Emerald",
  firered: "FireRed",
  leafgreen: "LeafGreen",
  diamond: "Diamond",
  pearl: "Pearl",
  platinum: "Platinum",
  heartgold: "HeartGold",
  soulsilver: "SoulSilver",
  black: "Black",
  white: "White",
  "black-2": "Black 2",
  "white-2": "White 2",
  x: "X",
  y: "Y",
  "omega-ruby": "Omega Ruby",
  "alpha-sapphire": "Alpha Sapphire",
  sun: "Sun",
  moon: "Moon",
  "ultra-sun": "Ultra Sun",
  "ultra-moon": "Ultra Moon",
  "lets-go-pikachu": "Let's Go, Pikachu",
  "lets-go-eevee": "Let's Go, Eevee",
  sword: "Sword",
  shield: "Shield",
  "legends-arceus": "Legends: Arceus",
  scarlet: "Scarlet",
  violet: "Violet",
};

const VERSION_RANK = Object.keys(VERSION_NAMES);

export function titleCaseName(slug: string): string {
  const key = slug.toLowerCase();
  if (SPECIAL_NAMES[key]) return SPECIAL_NAMES[key];
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function versionName(slug: string): string {
  return VERSION_NAMES[slug] ?? titleCaseName(slug);
}

export function versionRank(slug: string): number {
  const index = VERSION_RANK.indexOf(slug);
  return index === -1 ? VERSION_RANK.length : index;
}

export function cleanFlavor(text: string): string {
  return text
    .replace(/\f/g, " ")
    .replace(/\n/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/POK[eé]MON/gi, "Pokémon")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingZero(value: string): string {
  return value.replace(/\.0$/, "");
}

/** PokéAPI stores height in decimetres. One decimetre is ten centimetres. */
export function centimetresSpeech(decimetres: number): string {
  return `${decimetres * 10} centimetres`;
}

export function kilogramsSpeech(hectograms: number): string {
  const kilograms = hectograms / 10;
  return `${stripTrailingZero(kilograms.toFixed(1))} kilograms`;
}

function poundsSpeech(hectograms: number): string {
  const kilograms = hectograms / 10;
  const pounds = Math.max(1, Math.round(kilograms * 2.20462));
  return `${pounds} ${pounds === 1 ? "pound" : "pounds"}`;
}

/** Feet and inches from PokéAPI decimetres. A whole foot leaves the inches off. */
function feetInchesSpeech(decimetres: number): string {
  const meters = decimetres / 10;
  const totalInches = Math.round(meters * 39.3701);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const feetLabel = `${feet} ${feet === 1 ? "foot" : "feet"}`;
  if (inches === 0) return feetLabel;
  return `${feetLabel} ${inches} ${inches === 1 ? "inch" : "inches"}`;
}

export function heightSpeech(decimeters: number): string {
  const meters = decimeters / 10;
  const totalInches = Math.round(meters * 39.3701);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const metric = `${stripTrailingZero(meters.toFixed(1))} meters`;
  const imperial =
    inches === 0
      ? `${feet} ${feet === 1 ? "foot" : "feet"}`
      : `${feet} ${feet === 1 ? "foot" : "feet"} ${inches} ${inches === 1 ? "inch" : "inches"}`;
  return `${metric}, about ${imperial}`;
}

export function weightSpeech(hectograms: number): string {
  const metric = kilogramsSpeech(hectograms);
  return `${metric}, about ${poundsSpeech(hectograms)}`;
}

export type MeasureUnits = "metric" | "imperial";

/** Catalogue labels are kilograms. Imperial speech and the page use pounds only. */
export function weightForUnits(label: string, units: MeasureUnits = "metric"): string {
  if (units !== "imperial") return label;
  const kilograms = Number(label.match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(kilograms) || kilograms <= 0) return label;
  return poundsSpeech(Math.round(kilograms * 10));
}

/** Catalogue labels are centimetres. Imperial speech and the page use feet and inches. */
export function heightForUnits(label: string, units: MeasureUnits = "metric"): string {
  if (units !== "imperial") return label;
  const centimetres = Number(label.match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(centimetres) || centimetres <= 0) return label;
  return feetInchesSpeech(centimetres / 10);
}

export function growthSpeech(slug: string): string {
  return slug.replace(/-/g, " ");
}

export function habitatSpeech(slug: string | null): string {
  if (!slug) return "It has no settled habitat on file. Search the unusual places.";
  return `Look for it in ${slug.replace(/-/g, " ")}.`;
}

export function catchSpeech(rate: number): string {
  if (rate >= 200) return "Meeting it is usually enough. It is an easy catch.";
  if (rate >= 120) return "It is a fair catch for a patient trainer.";
  if (rate >= 75) return "It will slip the ball if you rush the throw.";
  if (rate >= 45) return "Catching it is a real test. Bring your best ball.";
  if (rate >= 10)
    return "It rarely stays in the ball. A champion plans the encounter.";
  return "It almost never stays caught. This is endgame quarry.";
}

export function statSpeech(slug: string): string {
  if (slug === "hp") return "hit points";
  return slug.replace(/-/g, " ");
}
