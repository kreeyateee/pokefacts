import { YOTO_ICONS } from "@/lib/yoto-icons";
import type { KidCard, KidChapter } from "@/lib/kid-cards";
import { musicPlaylistTitle } from "@/lib/youtube-playlist";

export type SpeciesName = {
  id: number;
  name: string;
};

const NIDORAN_FEMALE = 29;
const NIDORAN_MALE = 32;

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]s\b/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/ +/g, " ");
}

function nidoranId(text: string): number | null {
  const female = /nidoran\s*♀|nidoran\s*female|nidoran-f\b/i.test(text);
  const male = /nidoran\s*♂|nidoran\s*male|nidoran-m\b/i.test(text);
  if (female === male) return null;
  return female ? NIDORAN_FEMALE : NIDORAN_MALE;
}

function preparedSpecies(species: readonly SpeciesName[]): Array<{ id: number; name: string }> {
  const folded = species
    .map((item) => ({ id: item.id, name: fold(item.name) }))
    .filter((item) => item.name.length >= 3);
  const counts = new Map<string, number>();
  for (const item of folded) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  return folded
    .filter((item) => counts.get(item.name) === 1)
    .sort((a, b) => b.name.length - a.name.length || a.id - b.id);
}

function matchIds(text: string, species: readonly SpeciesName[]): number[] {
  const ids: number[] = [];
  const nidoran = nidoranId(text);
  if (nidoran) ids.push(nidoran);
  const hay = ` ${fold(text)} `;
  for (const item of preparedSpecies(species)) {
    if (hay.includes(` ${item.name} `)) ids.push(item.id);
  }
  return [...new Set(ids)];
}

/**
 * The one Pokémon a song is about, from its title or Bulbapedia page.
 * A title that names two Pokémon, or none, stays unmatched.
 */
export function songPokemonId(
  title: string,
  page: string,
  species: readonly SpeciesName[],
): number | null {
  const fromTitle = matchIds(title, species);
  if (fromTitle.length === 1) return fromTitle[0] ?? null;
  if (fromTitle.length > 1) return null;
  const fromPage = matchIds(page.replace(/_/g, " "), species);
  return fromPage.length === 1 ? (fromPage[0] ?? null) : null;
}

/**
 * Track icon for the Yoto card. A matched Pokémon uses the uploaded 16×16 pixel.
 * Anything else keeps the music icon the playlist already uses.
 */
export function musicTrackIcon(
  dexId: number | null | undefined,
  mediaById: Record<number, string>,
): string {
  const media = dexId ? mediaById[dexId] : undefined;
  if (!media) return YOTO_ICONS.music;
  return media.startsWith("yoto:#") ? media : `yoto:#${media}`;
}

/**
 * Printable sticker card. Chapters are the songs that are about one Pokémon,
 * using the same sprite the other playlist stickers use.
 */
export function musicStickerCard(
  title: string,
  songs: readonly { title: string; dexId: number | null }[],
): KidCard | null {
  const chapters: KidChapter[] = [];
  songs.forEach((song, index) => {
    if (!song.dexId || song.dexId < 1) return;
    const overlay = String(chapters.length + 1);
    const label = song.title.replace(/\s+/g, " ").trim() || "Song";
    chapters.push({
      key: `song-${index + 1}`,
      title: label,
      overlay,
      picture: "this Pokémon",
      mark: overlay,
      icon: `/pixels/${song.dexId}.png`,
      dexId: song.dexId,
      sprite: `/sprites/${song.dexId}.png`,
      tracks: [],
    });
  });
  if (chapters.length === 0) return null;
  const name = musicPlaylistTitle(title, "Pokémon music");
  return {
    id: "music-playlist",
    kind: "meet",
    title: name,
    rangeLabel: name,
    libraryTitle: name,
    blurb: "Songs saved as MP3s.",
    childDoes: "Turn to a picture and press play.",
    chapters,
  };
}
