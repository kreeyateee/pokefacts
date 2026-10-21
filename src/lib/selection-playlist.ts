import type { BiologyBlock } from "@/lib/catalogue-types";
import { heightForUnits, weightForUnits, type MeasureUnits } from "@/lib/format";
import { guessSpoken, type MonSheet } from "@/lib/dex-facts";
import {
  factsPlaylistUpload,
  guessUpload,
  shadowPixelPath,
  YOTO_TRACK_LIMIT,
  type KidCard,
  type KidChapter,
  type KidTrack,
} from "@/lib/kid-cards";
import { pronounce } from "@/lib/pronounce";
import { spokenFact } from "@/lib/spoken-wiki";
import type { PlaylistUpload } from "@/lib/yoto-send";

/** Who's That Pokémon uses two tracks, so 50 species fill the 100-track card. */
export type SelectionKind = "whos-that" | "facts" | "advanced";

export type SelectionSpecies = {
  id: number;
  name: string;
  types: string[];
  genus: string;
  habitat: string | null;
  heightLabel: string;
  weightLabel: string;
  abilities: Array<{ name: string; info: string; hidden?: boolean }>;
  evolvesFrom: string | null;
  evolutions: Array<{ name: string; method: string }>;
  /** Game Pokédex line. Who's That Pokémon clues may use it. It is not read aloud as a citation. */
  info: string;
  /** Older Pokédex line from a different game. */
  info2?: string;
  /** Official colour, such as Yellow. */
  color?: string | null;
  biology: BiologyBlock[];
};

export type SelectionBuild = {
  card: KidCard;
  /** Species ids that do not fit on the card, in the order they were picked. */
  refused: number[];
  title: string;
};

const ADVANCED_AFTER_NAME = 1700;

export function selectionSpeciesLimit(kind: SelectionKind): number {
  return kind === "whos-that" ? Math.floor(YOTO_TRACK_LIMIT / 2) : YOTO_TRACK_LIMIT;
}

/** Yoto content title. A typed title wins. Otherwise the playlist type names the card. */
export function selectionTitle(kind: SelectionKind, custom?: string): string {
  const typed = custom?.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim() ?? "";
  if (typed) return typed.slice(0, 80);
  if (kind === "whos-that") return "Who's That Pokémon Cards";
  if (kind === "advanced") return "Advanced facts";
  return "Fact Cards";
}

function asSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function withoutWikiCredit(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/bulbapedia|creative commons|\bcc\s*by-nc-sa\b/i.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function typeSpeech(types: string[]): string {
  const names = types.map((type) => type.trim()).filter(Boolean).slice(0, 2);
  if (names.length === 0) return "";
  const label = names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
  const article = /^[aeiou]/i.test(label ?? "") ? "an" : "a";
  return `It is ${article} ${label} type.`;
}

function abilitySpeech(species: SelectionSpecies): string {
  const ability = species.abilities.find((item) => !item.hidden) ?? species.abilities[0];
  if (!ability?.name) return "";
  const named = `Its ability is ${ability.name}.`;
  const first = ability.info.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  if (!first) return named;
  const short = first.length > 180 ? `${first.slice(0, 177).replace(/\s+\S*$/, "").trim()}.` : asSentence(first);
  if (!short || short.toLowerCase() === named.toLowerCase()) return named;
  return `${named} ${short}`;
}

function evolutionSpeech(species: SelectionSpecies): string {
  const parts: string[] = [];
  if (species.evolvesFrom) parts.push(`It grows from ${species.evolvesFrom}.`);
  for (const evolution of species.evolutions.slice(0, 3)) {
    const method = evolution.method.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
    parts.push(method ? `It becomes ${evolution.name} ${method}.` : `It becomes ${evolution.name}.`);
  }
  if (parts.length === 0) parts.push("It does not evolve.");
  return parts.join(" ");
}

/** Name, then the first two Biology paragraphs. A missing wiki read uses the Pokédex line. */
export function factsSpeech(species: SelectionSpecies): string {
  return spokenFact(species.name, species.biology, species.info);
}

/** Biology, then height, weight, type, ability, and evolution. Capped so it is not a wiki dump. */
export function advancedSpeech(species: SelectionSpecies, units: MeasureUnits = "metric"): string {
  const name = species.name.replace(/\s+/g, " ").trim();
  const biology = spokenFact(name, species.biology, species.info);
  const weight = weightForUnits(species.weightLabel, units);
  const height = heightForUnits(species.heightLabel, units);
  const extra = [
    weight ? `It weighs ${weight}.` : "",
    height ? `It is ${height} tall.` : "",
    typeSpeech(species.types),
    abilitySpeech(species),
    evolutionSpeech(species),
  ]
    .filter(Boolean)
    .join(" ");
  let text = withoutWikiCredit(`${biology} ${extra}`);
  const prefix = name ? `${name}. ` : "";
  const limit = prefix.length + ADVANCED_AFTER_NAME;
  if (text.startsWith(prefix) && text.length > limit) {
    const clipped = text.slice(0, limit).replace(/\s+\S*$/, "").trim();
    text = clipped.length > prefix.length ? clipped : text.slice(0, limit).trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

function decimetres(label: string): number {
  const centimetres = Number(label.match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(centimetres) || centimetres <= 0) return 0;
  return Math.round(centimetres / 10);
}

function hectograms(label: string): number {
  const kilograms = Number(label.match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(kilograms) || kilograms <= 0) return 0;
  return Math.round(kilograms * 10);
}

function toSheet(species: SelectionSpecies): MonSheet {
  const into = species.evolutions.map((evolution) => evolution.name).filter(Boolean);
  const evolution = evolutionSpeech(species);
  return {
    id: species.id,
    slug: `sel-${species.id}`,
    name: species.name,
    genus: species.genus,
    types: species.types,
    heightDecimetres: decimetres(species.heightLabel),
    weightHectograms: hectograms(species.weightLabel),
    stats: [],
    abilityName: (species.abilities.find((item) => !item.hidden) ?? species.abilities[0])?.name ?? null,
    abilityEffect: null,
    evolution,
    evolvesFrom: species.evolvesFrom,
    evolvesInto: into,
    habitat: species.habitat,
    color: species.color ?? null,
    entries: [
      species.info ? { text: species.info, version: "" } : null,
      species.info2 ? { text: species.info2, version: "" } : null,
    ].filter((entry): entry is { text: string; version: string } => Boolean(entry)),
  };
}

function track(key: string, title: string, text: string, icon: string, overlay: string): KidTrack {
  const readable = text.replace(/[^\S\n]+/g, " ").replace(/ *\n+ */g, "\n").trim();
  return {
    key,
    title,
    text: readable,
    spoken: pronounce(readable),
    icon,
    overlay,
    lead: "cry",
  };
}

function factChapter(species: SelectionSpecies, text: string): KidChapter {
  const icon = `/pixels/${species.id}.png`;
  const overlay = String(species.id);
  return {
    key: `sel-${species.id}`,
    title: species.name,
    overlay,
    picture: "this Pokémon",
    mark: overlay,
    icon,
    dexId: species.id,
    sprite: `/sprites/${species.id}.png`,
    tracks: [track("entry", species.name, text, icon, overlay)],
  };
}

/** Clue then answer. Both lead with the cry. The clue icon is the shadow pixel. */
function riddleChapter(species: SelectionSpecies): KidChapter {
  const script = guessSpoken(toSheet(species));
  const shadow = shadowPixelPath(species.id);
  const real = `/pixels/${species.id}.png`;
  const overlay = String(species.id);
  return {
    key: `sel-${species.id}`,
    title: species.name,
    overlay,
    picture: "a shadow",
    mark: "?",
    icon: shadow,
    dexId: species.id,
    sprite: shadow,
    tracks: [
      track("clues", "Clues", script.clue, shadow, "?"),
      track("answer", "The answer", script.answer, real, "Yes"),
    ],
  };
}

/**
 * One playlist from the picked species, in picked order.
 * Species past the 100-track cap are listed in `refused` and are not on the card.
 */
export function selectionPlaylist(
  species: readonly SelectionSpecies[],
  kind: SelectionKind,
  customTitle?: string,
  units: MeasureUnits = "metric",
): SelectionBuild {
  const limit = selectionSpeciesLimit(kind);
  const accepted = species.slice(0, limit);
  const refused = species.slice(limit).map((item) => item.id);
  const title = selectionTitle(kind, customTitle);
  const chapters = accepted.map((item) =>
    kind === "whos-that" ? riddleChapter(item) : factChapter(item, kind === "advanced" ? advancedSpeech(item, units) : factsSpeech(item)),
  );
  const blurb =
    kind === "whos-that"
      ? "The cry, then the colour and type, two Pokédex lines, and how big it is. The cry again, then the name."
      : kind === "advanced"
        ? "The cry, then the name, a short description, and how big it is."
        : "The cry, then the name and a short description.";
  const card: KidCard = {
    id: kind === "whos-that" ? "selection-whos-that" : kind === "advanced" ? "selection-advanced" : "selection-facts",
    kind: kind === "whos-that" ? "guess" : "meet",
    title,
    rangeLabel: title,
    libraryTitle: title,
    blurb,
    childDoes:
      kind === "whos-that"
        ? "Pick a dark picture and press play. You hear the cry, then the colour and type, two Pokédex lines, and how big it is. The next track plays the cry again, then the name."
        : "Turn to a picture and press play. You hear the cry, then the reading.",
    chapters,
  };
  return { card, refused, title };
}

function namedSpecies(item: { id: number; name: string }): SelectionSpecies {
  return {
    id: item.id,
    name: item.name,
    types: [],
    genus: "",
    habitat: null,
    heightLabel: "",
    weightLabel: "",
    abilities: [],
    evolvesFrom: null,
    evolutions: [],
    info: "",
    biology: [],
  };
}

function pickStamp(ids: readonly number[]): string {
  let hash = 2166136261;
  for (const id of ids) {
    hash ^= id;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * One Yoto card per full playlist in the catalogue pick.
 * A pick longer than one card is split in pick order, so each printed row is a different card.
 * Who's That cards leave the names off the label.
 */
export function selectionStickerCards(
  species: readonly { id: number; name: string }[],
  kind: SelectionKind,
  customTitle?: string,
  units: MeasureUnits = "metric",
): KidCard[] {
  const picked = species.filter((item) => Number.isInteger(item.id) && item.id > 0 && item.name.trim());
  if (picked.length === 0) return [];
  const limit = selectionSpeciesLimit(kind);
  const title = selectionTitle(kind, customTitle);
  const chunks: Array<typeof picked> = [];
  for (let index = 0; index < picked.length; index += limit) chunks.push(picked.slice(index, index + limit));
  return chunks.map((chunk, index) => {
    const label = chunks.length === 1 ? title : `${title} ${index + 1}`;
    const range =
      chunks.length === 1 || kind === "whos-that"
        ? label
        : `${label} (${chunk[0]?.name} to ${chunk[chunk.length - 1]?.name})`;
    const built = selectionPlaylist(chunk.map(namedSpecies), kind, label, units);
    const ids = chunk.map((item) => item.id);
    return {
      ...built.card,
      id: `selection-${kind}-${index + 1}-${pickStamp(ids)}`,
      title: label,
      rangeLabel: range,
      libraryTitle: label,
    };
  });
}

/**
 * Create body for a picked playlist.
 * The title is the content title Yoto accepts. metadata.title is left off.
 * cardId is set only when the caller picked an existing playlist.
 */
export function selectionUpload(
  card: KidCard,
  realById: Record<number, string>,
  options: { title: string; shadowById?: Record<number, string>; cardId?: string; voiceId?: string },
): PlaylistUpload {
  const explicit = options.cardId && /^[A-Za-z0-9]{5}$/.test(options.cardId) ? options.cardId : undefined;
  const base = options.shadowById
    ? guessUpload(card, realById, options.shadowById, explicit, options.voiceId)
    : factsPlaylistUpload(card, realById, explicit, options.voiceId);
  const content = { ...base.content, title: options.title };
  const description = options.shadowById
    ? `${options.title}. Each track starts with the cry. The clue never says the name. The answer says the name. The clue picture is a shadow. The answer picture is the real pixel.`
    : `${options.title}. You hear the cry, then the reading. Written for ages 8 to 12.`;
  const metadata: { description: string; title?: string } = { description };
  content.metadata = metadata as typeof content.metadata;
  if (!explicit) delete content.cardId;
  return { voiceId: base.voiceId, create: !explicit, content };
}
