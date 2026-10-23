"use client";

import { BRAND_FILES, canvasFonts } from "@/components/sticker/print-kit";
import { LAST_SPECIES_ID } from "@/lib/catalogue-picks";
import { artworkSrc as formArtworkSrc } from "@/lib/artwork-path";
import { artworkSrc } from "@/lib/page-artwork";
import { cardPixelSize, PRINT_DPI } from "@/lib/sticker-layout";
import { paintCover } from "@/lib/sticker-paint";
import type { Scene } from "@/lib/sticker-scenes";

/** What a playlist's cover shows: its first Pokémon (or nobody), a scene, and the playlist's name. */
export type CoverPlan = {
  title: string;
  /** National dex number or form id of the Pokémon in front, if any. */
  pictureId?: number;
  /** Draw the Pokémon as a silhouette, for Who's That cards. */
  hidden?: boolean;
  scene?: Scene;
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function pictureSrc(id: number): string {
  return id > LAST_SPECIES_ID ? formArtworkSrc("form", id) : artworkSrc(id);
}

/** The cover as a PNG, drawn in this page with its own fonts, or null if the picture would not load. */
export async function coverPng(plan: CoverPlan): Promise<Blob | null> {
  await document.fonts.ready;
  const images = new Map<string, CanvasImageSource | null>();
  const wanted: Array<readonly [string, string]> = [...BRAND_FILES];
  if (plan.pictureId) wanted.push(["picture", pictureSrc(plan.pictureId)]);
  await Promise.all(wanted.map(async ([key, src]) => images.set(key, await loadImage(src))));
  if (plan.pictureId && !images.get("picture")) return null;

  const size = cardPixelSize(PRINT_DPI);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paintCover(ctx, {
    title: plan.title.trim() || "Pokefacts",
    hidden: plan.hidden ?? false,
    crowd: plan.pictureId ? [{ image: "picture", heightDm: 0 }] : [],
    pixelated: false,
    pileSeed: 0,
    images,
    fonts: canvasFonts(),
    painting: null,
    drawLayer: "behind",
    scene: plan.scene ?? "sky",
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}
