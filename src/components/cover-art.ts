"use client";

import { BRAND_FILES, canvasFonts } from "@/components/sticker/print-kit";
import { fetchHeroEntry } from "@/components/sticker/use-hero-entries";
import { fetchSpeciesLooks } from "@/components/sticker/use-species-sizes";
import { artworkSrc as formArtworkSrc } from "@/lib/artwork-path";
import { LAST_SPECIES_ID } from "@/lib/catalogue-picks";
import type { PendingPlaylist } from "@/lib/pending-send";
import { MAX_COVER_BYTES, playlistCover, type MonLook } from "@/lib/playlist-cover";
import { stickerCardId } from "@/lib/selection-playlist";
import { monsFor, type StickerCard } from "@/lib/sticker-cover";
import { cardPixelSize, PRINT_DPI, stickerStorageKey } from "@/lib/sticker-layout";
import { paintCover } from "@/lib/sticker-paint";
import { cardPaintFor, dexIds, heroDexId, picturesFor, type ImageEntry } from "@/lib/sticker-spec";

/** Yoto's cover art is the card's own shape: 638 × 1011 at print resolution. A huge crowd steps down if it must. */
const COVER_DPIS = [PRINT_DPI, 240, 180] as const;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadAll(entries: readonly ImageEntry[]): Promise<Map<string, CanvasImageSource | null>> {
  const images = new Map<string, CanvasImageSource | null>();
  await Promise.all(entries.map(async ([key, src]) => images.set(key, await loadImage(src))));
  return images;
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** The card a send's cover is drawn from. A send saved before covers kept their card shows its first Pokémon. */
export function coverCardFor(current: PendingPlaylist): StickerCard {
  if (current.coverCard) return current.coverCard;
  const id = current.coverId;
  return {
    id: current.playlistId,
    kind: current.coverHidden ? "guess" : "story",
    rangeLabel: current.rangeLabel,
    libraryTitle: current.libraryTitle,
    blurb: "",
    childDoes: "",
    chapters: id
      ? [{ key: "cover", title: "", overlay: "1", dexId: id, ...(id > LAST_SPECIES_ID ? { sprite: formArtworkSrc("form", id) } : {}) }]
      : [],
  };
}

/** The design the child saved for this card in the sticker studio, if this browser has one. */
function savedDesign(card: StickerCard): string | null {
  try {
    return localStorage.getItem(stickerStorageKey(stickerCardId(card)));
  } catch {
    return null;
  }
}

/**
 * The playlist's cover as a PNG: the card's sticker front, as the child designed it in this browser or as
 * made for it, with the playlist's name on it. Null when it cannot be drawn, so the send falls back.
 */
export async function playlistCoverPng(current: PendingPlaylist): Promise<Blob | null> {
  await document.fonts.ready;
  const card = coverCardFor(current);
  const mons = monsFor(card);
  // One request gives the heights for the group photo and the habitats and types for its background.
  const looks = await fetchSpeciesLooks(dexIds(mons));
  const { cover } = playlistCover({
    card,
    saved: savedDesign(card),
    title: current.libraryTitle,
    looks: mons.flatMap((mon): MonLook[] => {
      const look = mon.dexId ? looks[mon.dexId] : undefined;
      return look ? [look] : [];
    }),
    scene: current.coverScene,
  });
  const pictures = picturesFor(card, cover);
  const star = heroDexId(card, cover);
  const [images, hero] = await Promise.all([
    loadAll([...BRAND_FILES, ...pictures]),
    star ? fetchHeroEntry(star) : Promise.resolve(null),
  ]);
  // A crowd can do without one picture that did not load, but a front with nobody on it falls back.
  const people = pictures.filter(([key]) => key !== cover.painting);
  if (people.length > 0 && people.every(([key]) => !images.get(key))) return null;

  const spec = cardPaintFor({
    card,
    cover,
    images,
    sizes: looks,
    heroes: star ? { [star]: hero } : {},
    fonts: canvasFonts(),
  });
  for (const dpi of COVER_DPIS) {
    const size = cardPixelSize(dpi);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    paintCover(ctx, spec);
    const blob = await toPng(canvas);
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return null;
    if (blob.size <= MAX_COVER_BYTES) return blob;
  }
  return null;
}
