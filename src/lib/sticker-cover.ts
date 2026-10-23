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

/**
 * The parts of a card its stickers and its playlist cover are made from. A KidCard is one; a send in
 * progress keeps just these, so a resumed send can still draw its cover.
 */
export type StickerCard = Pick<KidCard, "id" | "kind" | "rangeLabel" | "libraryTitle" | "blurb" | "childDoes"> & {
  chapters: ReadonlyArray<Pick<KidChapter, "key" | "title" | "overlay" | "dexId" | "formId" | "sprite">>;
};

/** A card cut down to what its stickers need, without the spoken text. */
export function stickerCard(card: StickerCard): StickerCard {
  return {
    id: card.id,
    kind: card.kind,
    rangeLabel: card.rangeLabel,
    libraryTitle: card.libraryTitle,
    blurb: card.blurb,
    childDoes: card.childDoes,
    chapters: card.chapters.map((chapter) => ({
      key: chapter.key,
      title: chapter.title,
      overlay: chapter.overlay,
      ...(chapter.dexId ? { dexId: chapter.dexId } : {}),
      ...(chapter.formId ? { formId: chapter.formId } : {}),
      ...(chapter.sprite ? { sprite: chapter.sprite } : {}),
    })),
  };
}

/** One Pokémon a child can put on a card. */
export type StickerMon = {
  key: string;
  name: string;
  /** Tile picture: the artwork, or the shadow for a riddle. */
  src: string;
  /** Big picture for the Pokédex and trading card fronts. */
  art: string;
  /** The game sprite, for the Game sprites toggle. */
  sprite: string;
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

function artFor(chapter: StickerCard["chapters"][number]): string {
  if (chapter.sprite?.includes("/artwork/")) return chapter.sprite;
  if (chapter.dexId) return artworkSrc(chapter.dexId);
  return chapter.sprite ?? "";
}

export function monsFor(card: Pick<StickerCard, "kind" | "chapters">): StickerMon[] {
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
        sprite: `/sprites/${chapter.dexId}.png`,
        dexId: chapter.dexId,
      },
    ];
  });
}

export function linesFor(card: Pick<StickerCard, "kind" | "chapters">): string[] {
  if (hidesNames(card)) return [];
  return card.chapters.flatMap((chapter) => (chapter.dexId ? [playlistLine(chapter.overlay, chapter.title)] : []));
}

export function countLabel(count: number, noun: string): string {
  if (count === 1) return `1 ${noun === "Pokémon" ? "Pokémon" : noun.replace(/s$/, "")}`;
  return `${count} ${noun}`;
}

export function cardCountLabel(card: Pick<StickerCard, "kind" | "chapters">): string {
  return countLabel(monsFor(card).length, nounFor(card.kind));
}

export function cardRangeText(card: Pick<StickerCard, "kind" | "chapters" | "rangeLabel">): string {
  const ids = card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.dexId] : []));
  return rangeLine({ ids, rangeLabel: card.rangeLabel, hidden: hidesNames(card) });
}

function detailFor(card: StickerCard, count: number): string {
  const guess = hidesNames(card);
  const names = guess ? [] : card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.title] : []));
  const ids = card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.dexId] : []));
  return playlistDetail({ count, noun: nounFor(card.kind), names, hideNames: guess, ordered: isNumberRun(ids) });
}

export function suggestedCover(card: StickerCard): CoverDraft {
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
export function autoCover(card: StickerCard, current: CoverDraft, random: () => number = Math.random): CoverDraft {
  const others = monsFor(card).filter((mon) => mon.key !== current.hero);
  const hero = others[Math.floor(random() * others.length)]?.key;
  return hero ? { ...current, hero } : current;
}

/** The picture a front draws for a Pokémon: its game sprite or the full artwork. */
export function pictureFor(mon: StickerMon, sprites: boolean): string {
  return sprites ? mon.sprite : mon.art;
}

/** Everyone in the group photo, in the card's own order. */
export function crowdFor(mons: readonly StickerMon[], cover: Pick<CoverDraft, "crowd">): StickerMon[] {
  if (!cover.crowd) return mons.slice();
  const chosen = new Set(cover.crowd);
  return mons.filter((mon) => chosen.has(mon.key));
}
