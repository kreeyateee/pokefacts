import {
  cardCountLabel,
  cardRangeText,
  crowdFor,
  heroInfo,
  heroMon,
  hidesNames,
  linesFor,
  monsFor,
  pictureFor,
  type StickerCard,
  type StickerMon,
} from "@/lib/sticker-cover";
import { showsNameList, type CoverDraft, type CoverStyle } from "@/lib/sticker-layout";
import type { CardPaint } from "@/lib/sticker-paint";
import { pileSeed } from "@/lib/sticker-pile";

/**
 * What the sticker studio and the playlist cover share: who is on a card's front, which pictures that
 * needs, and the CardPaint the painters draw from. The studio draws it on paper; the cover sends it to Yoto.
 */

/** A picture to load for the canvas: its key in the image map, and where it comes from. */
export type ImageEntry = readonly [key: string, src: string];

/** Pokédex height and colour, for the group photo and the pile. */
export type SpeciesSize = { heightDm: number; color: string };

/** Types and kind for the star Pokémon on the Pokédex and trading card fronts. */
export type HeroEntry = { types: string[]; genus: string };

export function pictureKey(mon: StickerMon, sprites: boolean): string {
  return `picture:${pictureFor(mon, sprites)}`;
}

export function usesCrowd(style: CoverStyle): boolean {
  return style === "photo" || style === "pile";
}

/** Who appears on a card's front: its crowd, or its star. */
export function frontMons(card: StickerCard, cover: CoverDraft): StickerMon[] {
  const mons = monsFor(card);
  if (usesCrowd(cover.style)) return crowdFor(mons, cover);
  const star = heroMon(mons, cover);
  return star ? [star] : [];
}

/** Every picture a card's faces need: everyone on the front, and the drawing. */
export function picturesFor(card: StickerCard, cover: CoverDraft): ImageEntry[] {
  const entries: ImageEntry[] = frontMons(card, cover).map((mon) => [pictureKey(mon, cover.sprites), pictureFor(mon, cover.sprites)]);
  if (cover.painting) entries.push([cover.painting, cover.painting]);
  return entries;
}

export function dexIds(mons: readonly StickerMon[]): number[] {
  return mons.flatMap((mon) => (mon.dexId ? [mon.dexId] : []));
}

/** The star whose types and kind the front shows, or none for a riddle, which keeps them secret. */
export function heroDexId(card: StickerCard, cover: CoverDraft): number | undefined {
  if (hidesNames(card)) return undefined;
  return heroMon(monsFor(card), cover)?.dexId;
}

/** One card's faces, from the card, its cover, and the pictures, sizes, and star details loaded so far. */
export function cardPaintFor(input: {
  card: StickerCard;
  cover: CoverDraft;
  images: ReadonlyMap<string, CanvasImageSource | null>;
  sizes: Readonly<Record<number, SpeciesSize | undefined>>;
  heroes: Readonly<Record<number, HeroEntry | null | undefined>>;
  fonts: CardPaint["fonts"];
  /** The drawing as the child is making it, in place of the saved one. */
  live?: CanvasImageSource | null;
}): CardPaint {
  const { card, cover, images, sizes, heroes } = input;
  const mons = monsFor(card);
  const hidden = hidesNames(card);
  const lines = linesFor(card);
  const star = heroMon(mons, cover);
  return {
    style: cover.style,
    kind: card.kind,
    title: cover.title,
    countLabel: cardCountLabel(card),
    rangeText: cardRangeText(card),
    backText: cover.backText,
    backMode: cover.backMode,
    showNames: showsNameList(lines, cover.backMode, hidden),
    lines,
    owner: cover.owner,
    hidden,
    crowd: crowdFor(mons, cover).map((mon) => ({
      image: pictureKey(mon, cover.sprites),
      heightDm: mon.dexId ? (sizes[mon.dexId]?.heightDm ?? 0) : 0,
      color: mon.dexId ? sizes[mon.dexId]?.color : undefined,
    })),
    pixelated: cover.sprites,
    scene: cover.scene ?? undefined,
    pileSeed: pileSeed(card.id) + cover.pileSeed,
    images,
    fonts: input.fonts,
    painting: input.live ?? (cover.painting ? (images.get(cover.painting) ?? null) : null),
    drawLayer: cover.drawLayer,
    hero: star
      ? {
          image: images.get(pictureKey(star, cover.sprites)) ?? null,
          // A riddle's star keeps its types to itself, as well as its name.
          info: heroInfo(star, hidden, star.dexId && !hidden ? heroes[star.dexId] : null),
        }
      : null,
  };
}
