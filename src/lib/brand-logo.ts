/** Files cut from the supplied Pokefacts lockup. */
export const BRAND_LOGO = {
  vertical: "/brand/logo-vertical.png",
  horizontal: "/brand/logo-horizontal.png",
  compact: "/brand/logo-compact.png",
  mark: "/brand/logo-mark.png",
} as const;

export const BRAND_IMAGE_KEY = {
  vertical: "brand:vertical",
  horizontal: "brand:horizontal",
  compact: "brand:compact",
} as const;

export type BrandLayout = keyof typeof BRAND_LOGO;

function sourceSize(image: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) return { width, height };
  }
  if (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas) {
    return { width: image.width, height: image.height };
  }
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }
  return { width: 0, height: 0 };
}

/** Draw a logo inside a box without stretching it. */
export function paintBrandLogo(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource | null | undefined,
  box: { x: number; y: number; width: number; height: number },
): void {
  if (!image || box.width <= 0 || box.height <= 0) return;
  const { width, height } = sourceSize(image);
  if (width <= 0 || height <= 0) return;
  const scale = Math.min(box.width / width, box.height / height);
  const drawW = width * scale;
  const drawH = height * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    box.x + (box.width - drawW) / 2,
    box.y + (box.height - drawH) / 2,
    drawW,
    drawH,
  );
  ctx.restore();
}

export function brandImage(images: ReadonlyMap<string, CanvasImageSource | null>, layout: keyof typeof BRAND_IMAGE_KEY) {
  return images.get(BRAND_IMAGE_KEY[layout]) ?? null;
}
