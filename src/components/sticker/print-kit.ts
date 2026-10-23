"use client";

import type { ImageEntry } from "@/components/sticker/use-image-cache";
import { BRAND_IMAGE_KEY, BRAND_LOGO } from "@/lib/brand-logo";

/** What the sticker studio and the poster maker share: the logos, the fonts, and saving a PDF. */

export const JPEG_QUALITY = 0.93;

export const BRAND_FILES = [
  [BRAND_IMAGE_KEY.compact, BRAND_LOGO.compact],
  [BRAND_IMAGE_KEY.vertical, BRAND_LOGO.vertical],
  [BRAND_IMAGE_KEY.horizontal, BRAND_LOGO.horizontal],
] as const satisfies readonly ImageEntry[];

function canvasFamily(variable: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const first = raw.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || fallback;
}

/** The page's own fonts, by the names a canvas knows them by. */
export function canvasFonts() {
  return {
    display: canvasFamily("--font-fredoka", "Fredoka, sans-serif"),
    body: canvasFamily("--font-nunito", "Nunito, sans-serif"),
  };
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function releaseCanvas(canvas: HTMLCanvasElement) {
  // iPad Safari runs out of canvas memory on a long PDF unless finished canvases are emptied.
  canvas.width = 0;
  canvas.height = 0;
}

/** One finished page for jpegPagesPdf. The canvas is emptied afterwards. */
export async function jpegPage(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  const pixelWidth = canvas.width;
  const pixelHeight = canvas.height;
  releaseCanvas(canvas);
  if (!blob) throw new Error("The page could not be turned into a picture.");
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), pixelWidth, pixelHeight };
}
