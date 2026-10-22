import { shadowPixelPath, type KidCard, type KidCardKind, type KidChapter } from "@/lib/kid-cards";
import { artworkSrc } from "@/lib/page-artwork";
import {
  freshCover,
  isNumberRun,
  playlistDetail,
  playlistLine,
  type CoverDraft,
} from "@/lib/sticker-layout";
import { rangeLine, type HeroInfo } from "@/lib/sticker-styles";

/** One Pokémon a child can put on a card. */
export type StickerMon = {
  key: string;
  name: string;
  /** Tile picture: the artwork, or the shadow for a riddle. */
  src: string;
  /** Big picture for the Pokédex and trading card fronts. */
  art: string;
  /** 16×16 pixel art, for the pixel toggle. */
  pixel: string;
  dexId?: number;
};

export function nounFor(kind: KidCardKind): string {
  if (kind === "guess") return "riddles";
  if (kind === "mega" || kind === "gmax" || kind === "alola" || kind === "hisui") return "forms";
  return "Pokémon";
}

export function hidesNames(card: Pick<KidCard, "kind">): boolean {
  return card.kind === "guess";
}

function artFor(chapter: KidChapter): string {
  if (chapter.sprite?.includes("/artwork/")) return chapter.sprite;
  if (chapter.dexId) return artworkSrc(chapter.dexId);
  return chapter.sprite ?? "";
}

export function monsFor(card: KidCard): StickerMon[] {
  const guess = hidesNames(card);
  return card.chapters.flatMap((chapter) => {
    if (!chapter.dexId) return [];
    const art = artFor(chapter);
    return [
      {
        key: chapter.key,
        name: guess ? `Riddle ${chapter.overlay}` : chapter.title,
        src: guess ? shadowPixelPath(chapter.dexId) : art,
        art,
        pixel: `/pixels/${chapter.dexId}.png`,
        dexId: chapter.dexId,
      },
    ];
  });
}

export function linesFor(card: KidCard): string[] {
  if (hidesNames(card)) return [];
  return card.chapters.flatMap((chapter) => (chapter.dexId ? [playlistLine(chapter.overlay, chapter.title)] : []));
}

export function countLabel(count: number, noun: string): string {
  if (count === 1) return `1 ${noun === "Pokémon" ? "Pokémon" : noun.replace(/s$/, "")}`;
  return `${count} ${noun}`;
}

export function cardCountLabel(card: KidCard): string {
  return countLabel(monsFor(card).length, nounFor(card.kind));
}

export function cardRangeText(card: KidCard): string {
  const ids = card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.dexId] : []));
  return rangeLine({ ids, rangeLabel: card.rangeLabel, hidden: hidesNames(card) });
}

function detailFor(card: KidCard, count: number): string {
  const guess = hidesNames(card);
  const names = guess ? [] : card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.title] : []));
  const ids = card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.dexId] : []));
  return playlistDetail({ count, noun: nounFor(card.kind), names, hideNames: guess, ordered: isNumberRun(ids) });
}

export function suggestedCover(card: KidCard): CoverDraft {
  const mons = monsFor(card);
  return freshCover({
    libraryTitle: card.libraryTitle,
    rangeLabel: card.rangeLabel,
    blurb: card.blurb,
    childDoes: card.childDoes,
    detail: detailFor(card, mons.length),
    keys: mons.map((mon) => mon.key),
  });
}

export function heroMon(mons: readonly StickerMon[], cover: Pick<CoverDraft, "hero">): StickerMon | undefined {
  return mons.find((mon) => mon.key === cover.hero) ?? mons[0];
}

/** What the fronts say about the star. Types and kind arrive from the Pokédex once they load. */
export function heroInfo(
  mon: StickerMon,
  hidden: boolean,
  entry?: { types: readonly string[]; genus: string } | null,
): HeroInfo {
  return { name: mon.name, number: mon.dexId, types: entry?.types ?? [], genus: entry?.genus ?? "", hidden };
}

/** "Make it for me": a new star from the card. Style, crowd, title, back, and owner stay as they are. */
export function autoCover(card: KidCard, current: CoverDraft, random: () => number = Math.random): CoverDraft {
  const others = monsFor(card).filter((mon) => mon.key !== current.hero);
  const hero = others[Math.floor(random() * others.length)]?.key;
  return hero ? { ...current, hero } : current;
}

/** The picture a front draws for a Pokémon: pixel art or the full artwork. */
export function pictureFor(mon: StickerMon, pixels: boolean): string {
  return pixels ? mon.pixel : mon.art;
}

/** Everyone in the group photo, in the card's own order. */
export function crowdFor(mons: readonly StickerMon[], cover: Pick<CoverDraft, "crowd">): StickerMon[] {
  if (!cover.crowd) return mons.slice();
  const chosen = new Set(cover.crowd);
  return mons.filter((mon) => chosen.has(mon.key));
}
