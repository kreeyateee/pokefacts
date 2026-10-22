import { BRAND_IMAGE_KEY, paintBrandLogo } from "@/lib/brand-logo";
import {
  BACK_FOOTER_MM,
  BACK_HEADER_MM,
  BACK_PAD_MM,
  CARD_MM,
  CROP_GAP_MM,
  CROP_MARK_MM,
  LIST_LEADING,
  mmToPx,
  nameListPlan,
  sheetCaption,
  sheetSlots,
  type PlacedSticker,
  type PaperId,
  type StickerShape,
} from "@/lib/sticker-layout";

export type CardPaint = {
  title: string;
  kicker: string;
  description: string;
  backText: string;
  countLabel: string;
  lines: readonly string[];
  showNames: boolean;
  stickers: readonly PlacedSticker[];
  images: ReadonlyMap<string, CanvasImageSource | null>;
  fonts: { display: string; body: string };
  selectedId?: string | null;
  painting?: CanvasImageSource | null;
};

function pxPerMm(width: number): number {
  return width / CARD_MM.width;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0] ?? "";
    for (const word of words.slice(1)) {
      const next = `${current} ${word}`;
      if (ctx.measureText(next).width <= maxWidth) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

function paintParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; width: number; height: number },
  options: {
    family: string;
    weight: number;
    color: string;
    startPx: number;
    minPx: number;
    align: CanvasTextAlign;
    leading?: number;
  },
): void {
  if (!text.trim() || box.width <= 0 || box.height <= 0) return;
  const leading = options.leading ?? 1.25;
  let size = options.startPx;
  let lines: string[] = [];
  while (size >= options.minPx) {
    ctx.font = `${options.weight} ${size}px ${options.family}`;
    lines = wrapLines(ctx, text, box.width);
    if (lines.length * size * leading <= box.height) break;
    size -= 1;
  }
  ctx.font = `${options.weight} ${Math.max(size, options.minPx)}px ${options.family}`;
  if (size < options.minPx) {
    ctx.font = `${options.weight} ${options.minPx}px ${options.family}`;
    lines = wrapLines(ctx, text, box.width);
    size = options.minPx;
  }
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align;
  ctx.textBaseline = "top";
  const x = options.align === "center" ? box.x + box.width / 2 : box.x;
  const lineHeight = size * leading;
  const maxLines = Math.max(1, Math.floor(box.height / lineHeight));
  for (const [index, line] of lines.slice(0, maxLines).entries()) {
    if (!line) continue;
    ctx.fillText(line, x, box.y + index * lineHeight);
  }
}

function traceShape(ctx: CanvasRenderingContext2D, shape: StickerShape, cx: number, cy: number, radius: number) {
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    return;
  }
  if (shape === "round") {
    const side = radius * 1.7;
    const curve = radius * 0.38;
    const left = cx - side / 2;
    const top = cy - side / 2;
    if (typeof ctx.roundRect === "function") ctx.roundRect(left, top, side, side, curve);
    else ctx.rect(left, top, side, side);
    return;
  }
  if (shape === "diamond") {
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius * 0.86, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius * 0.86, cy);
    ctx.closePath();
    return;
  }
  if (shape === "hex") {
    for (let point = 0; point < 6; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 3;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const reach = point % 2 === 0 ? radius : radius * 0.46;
    const px = cx + Math.cos(angle) * reach;
    const py = cy + Math.sin(angle) * reach;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function imageBox(image: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) return { width, height };
  }
  if ("width" in image && "height" in image) {
    const width = Number(image.width);
    const height = Number(image.height);
    if (width > 0 && height > 0) return { width, height };
  }
  return { width: 1, height: 1 };
}

function imageUrl(image: CanvasImageSource): string {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) return image.src;
  return "";
}

function crispPicture(url: string): boolean {
  return url.includes("/pixels/") || url.includes("/sprites/");
}

/** Who's That shadows fade from grey to black for the Yoto LEDs. On paper they print as a solid silhouette. */
export const PAPER_SHADOW_INK = "#1c1c20";

export function isShadowPicture(url: string): boolean {
  return /-shadow\.png(?:[?#]|$)/.test(url);
}

const paperSilhouettes = new WeakMap<CanvasImageSource, HTMLCanvasElement>();

function paperSilhouette(image: CanvasImageSource): CanvasImageSource {
  const cached = paperSilhouettes.get(image);
  if (cached) return cached;
  const { width, height } = imageBox(image);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ink = canvas.getContext("2d");
  if (!ink) return image;
  ink.drawImage(image, 0, 0, width, height);
  ink.globalCompositeOperation = "source-in";
  ink.fillStyle = PAPER_SHADOW_INK;
  ink.fillRect(0, 0, width, height);
  paperSilhouettes.set(image, canvas);
  return canvas;
}

function paintStickers(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  for (const sticker of spec.stickers) {
    const size = sticker.scale * width;
    const centerX = sticker.x * width;
    const centerY = sticker.y * height;
    const radius = size * 0.48;
    const shape = sticker.shape ?? "circle";
    const clear = !sticker.color || sticker.color === "transparent";
    const image = spec.images.get(sticker.key);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(sticker.rotation ?? 0);
    ctx.translate(-centerX, -centerY);
    ctx.shadowColor = "rgba(22, 50, 79, 0.35)";
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.04;
    traceShape(ctx, shape, centerX, centerY, radius);
    ctx.lineWidth = Math.max(1.5, size * 0.03);
    if (!clear) {
      ctx.fillStyle = sticker.color;
      ctx.fill();
      ctx.strokeStyle = sticker.color;
    } else {
      ctx.strokeStyle = "rgba(22, 50, 79, 0.28)";
    }
    ctx.stroke();
    ctx.shadowColor = "transparent";
    if (image) {
      const url = imageUrl(image);
      const deco = sticker.key.startsWith("deco:");
      const crisp = crispPicture(url);
      const boundsW = shape === "hex" ? Math.sqrt(3) * radius : radius * 2;
      const boundsH = radius * 2;
      const cover = deco || crisp ? 0.92 : 1.28;
      const targetW = boundsW * cover;
      const targetH = boundsH * cover;
      const box = imageBox(image);
      const imageAspect = box.width / box.height;
      const targetAspect = targetW / targetH;
      const drawW = imageAspect > targetAspect ? targetH * imageAspect : targetW;
      const drawH = imageAspect > targetAspect ? targetH : targetW / imageAspect;
      ctx.save();
      traceShape(ctx, shape, centerX, centerY, clear ? radius : radius * 0.9);
      ctx.clip();
      ctx.imageSmoothingEnabled = !crisp;
      const picture = isShadowPicture(url) ? paperSilhouette(image) : image;
      ctx.drawImage(picture, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
      ctx.restore();
    }
    traceShape(ctx, shape, centerX, centerY, radius);
    ctx.lineWidth = Math.max(1, size * (clear ? 0.016 : 0.02));
    ctx.strokeStyle = clear ? "rgba(22, 50, 79, 0.55)" : "#16324f";
    ctx.stroke();
    if (spec.selectedId === sticker.id) {
      traceShape(ctx, shape, centerX, centerY, radius);
      ctx.setLineDash([size * 0.08, size * 0.06]);
      ctx.strokeStyle = "#ffcb05";
      ctx.lineWidth = Math.max(2, size * 0.045);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function paintSignBar(
  ctx: CanvasRenderingContext2D,
  spec: CardPaint,
  width: number,
  mm: number,
): number {
  const edge = 1.15 * mm;
  const signH = 11.4 * mm;
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(edge, edge, width - edge * 2, signH);
  ctx.fillStyle = "#16324f";
  ctx.fillRect(edge, edge + signH - 0.45 * mm, width - edge * 2, 0.45 * mm);
  paintBrandLogo(ctx, spec.images.get(BRAND_IMAGE_KEY.compact), {
    x: edge + 1.4 * mm,
    y: edge + 0.7 * mm,
    width: width - edge * 2 - 2.8 * mm,
    height: signH - 1.6 * mm,
  });
  return edge + signH;
}

function paintFront(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  const mm = pxPerMm(width);
  ctx.fillStyle = "#fff7dc";
  ctx.fillRect(0, 0, width, height);
  if (spec.painting) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(spec.painting, 0, 0, width, height);
  }

  const edge = 1.15 * mm;
  ctx.strokeStyle = "#16324f";
  ctx.lineWidth = 0.7 * mm;
  ctx.strokeRect(edge, edge, width - edge * 2, height - edge * 2);

  paintStickers(ctx, spec, width, height);

  const signBottom = paintSignBar(ctx, spec, width, mm);
  const title = spec.title.trim();
  if (title) {
    const barH = 6.6 * mm;
    ctx.fillStyle = "rgba(22, 50, 79, 0.92)";
    ctx.fillRect(edge, signBottom, width - edge * 2, barH);
    paintParagraph(ctx, title, {
      x: 2.2 * mm,
      y: signBottom + 0.8 * mm,
      width: width - 4.4 * mm,
      height: 5 * mm,
    }, {
      family: spec.fonts.display,
      weight: 700,
      color: "#fffdf6",
      startPx: 4.2 * mm,
      minPx: 2.6 * mm,
      align: "center",
      leading: 1,
    });
  }
}

function splitLine(line: string): { mark: string; name: string } {
  const space = line.indexOf(" ");
  if (space <= 0) return { mark: "", name: line };
  return { mark: line.slice(0, space), name: line.slice(space + 1) };
}

function paintBack(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  const mm = pxPerMm(width);
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, width, height);

  const headerH = BACK_HEADER_MM * mm;
  const footerH = BACK_FOOTER_MM * mm;
  ctx.fillStyle = "#16324f";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#ffcb05";
  ctx.fillRect(0, headerH - 1.15 * mm, width, 1.15 * mm);
  ctx.fillStyle = "#e10600";
  ctx.fillRect(0, height - footerH, width, footerH);
  ctx.fillStyle = "#ffcb05";
  ctx.fillRect(0, height - footerH - 1.05 * mm, width, 1.05 * mm);

  const pad = BACK_PAD_MM * mm;
  paintBrandLogo(ctx, spec.images.get(BRAND_IMAGE_KEY.compact), {
    x: pad,
    y: 1.2 * mm,
    width: width - pad * 2,
    height: 6.2 * mm,
  });
  paintParagraph(ctx, spec.title, {
    x: pad,
    y: 8 * mm,
    width: width - pad * 2,
    height: 7.4 * mm,
  }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#fffdf6",
    startPx: 5.6 * mm,
    minPx: 3.4 * mm,
    align: "left",
    leading: 1.05,
  });
  paintParagraph(ctx, spec.countLabel, {
    x: pad,
    y: 16.2 * mm,
    width: width - pad * 2,
    height: 4 * mm,
  }, {
    family: spec.fonts.body,
    weight: 700,
    color: "#ffcb05",
    startPx: 3 * mm,
    minPx: 2.2 * mm,
    align: "left",
  });

  const box = {
    x: pad,
    y: headerH + 1.6 * mm,
    width: width - pad * 2,
    height: height - headerH - footerH - 2.8 * mm,
  };
  const plan = spec.showNames ? nameListPlan(spec.lines) : null;
  if (!plan) {
    paintParagraph(ctx, spec.backText, box, {
      family: spec.fonts.body,
      weight: 700,
      color: "#16324f",
      startPx: 3.4 * mm,
      minPx: 2.3 * mm,
      align: "left",
      leading: 1.3,
    });
    return;
  }

  const fontPx = plan.fontPt * (25.4 / 72) * mm;
  const linePx = fontPx * LIST_LEADING;
  const colW = box.width / plan.columns;
  const rows = Math.ceil(spec.lines.length / plan.columns);
  ctx.textBaseline = "top";
  for (let column = 0; column < plan.columns; column += 1) {
    const slice = spec.lines.slice(column * rows, (column + 1) * rows);
    const left = box.x + column * colW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, box.y, colW - 0.6 * mm, box.height);
    ctx.clip();
    slice.forEach((line, index) => {
      const parts = splitLine(line);
      const y = box.y + index * linePx;
      let cursor = left;
      if (parts.mark) {
        ctx.font = `700 ${fontPx}px ${spec.fonts.display}`;
        ctx.fillStyle = "#e10600";
        ctx.textAlign = "left";
        ctx.fillText(parts.mark, cursor, y);
        cursor += ctx.measureText(`${parts.mark} `).width;
      }
      ctx.font = `700 ${fontPx}px ${spec.fonts.body}`;
      ctx.fillStyle = "#16324f";
      ctx.fillText(parts.name, cursor, y);
    });
    ctx.restore();
  }
}

export function paintCard(ctx: CanvasRenderingContext2D, face: "front" | "back", spec: CardPaint) {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.shadowColor = "transparent";
  if (face === "front") paintFront(ctx, spec, width, height);
  else paintBack(ctx, spec, width, height);
}

function cropMarks(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, dpi: number) {
  const gap = mmToPx(CROP_GAP_MM, dpi);
  const mark = mmToPx(CROP_MARK_MM, dpi);
  ctx.strokeStyle = "#16324f";
  ctx.lineWidth = Math.max(1, mmToPx(0.25, dpi));
  ctx.beginPath();
  const corners = [
    [x, y, -1, -1],
    [x + width, y, 1, -1],
    [x, y + height, -1, 1],
    [x + width, y + height, 1, 1],
  ] as const;
  for (const [cx, cy, sx, sy] of corners) {
    ctx.moveTo(cx + sx * gap, cy);
    ctx.lineTo(cx + sx * (gap + mark), cy);
    ctx.moveTo(cx, cy + sy * gap);
    ctx.lineTo(cx, cy + sy * (gap + mark));
  }
  ctx.stroke();
}

export function paintSheet(
  ctx: CanvasRenderingContext2D,
  options: {
    paper: PaperId;
    dpi: number;
    images: readonly CanvasImageSource[];
    fonts: { display: string; body: string };
    brand: string;
    logo?: CanvasImageSource | null;
  },
) {
  const pairs = Math.max(1, Math.ceil(options.images.length / 2));
  const layout = sheetSlots(options.paper, pairs);
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const cardW = mmToPx(CARD_MM.width, options.dpi);
  const cardH = mmToPx(CARD_MM.height, options.dpi);
  const filled = Math.min(layout.slots.length, options.images.length);
  for (let index = 0; index < filled; index += 1) {
    const slot = layout.slots[index];
    const image = options.images[index];
    if (!slot || !image) continue;
    ctx.drawImage(image, mmToPx(slot.x, options.dpi), mmToPx(slot.y, options.dpi), cardW, cardH);
  }
  for (let index = 0; index < filled; index += 1) {
    const slot = layout.slots[index];
    if (!slot) continue;
    cropMarks(ctx, mmToPx(slot.x, options.dpi), mmToPx(slot.y, options.dpi), cardW, cardH, options.dpi);
  }

  const caption = sheetCaption();
  const fontPx = (7.5 * options.dpi) / 72;
  const indexPx = (11 * options.dpi) / 72;
  const total = filled;
  ctx.fillStyle = "#16324f";
  ctx.textBaseline = "top";
  layout.slots.slice(0, filled).forEach((slot, index) => {
    const x = mmToPx(slot.x, options.dpi);
    const y = mmToPx(slot.y, options.dpi);
    const labelX = slot.face === "front" ? x - mmToPx(3, options.dpi) : x + cardW + mmToPx(3, options.dpi);
    ctx.textAlign = slot.face === "front" ? "right" : "left";
    ctx.font = `700 ${indexPx}px ${options.fonts.body}`;
    ctx.fillText(`${index + 1} of ${total}`, labelX, y + mmToPx(2, options.dpi));
    ctx.font = `600 ${indexPx * 0.82}px ${options.fonts.body}`;
    ctx.fillText(slot.face === "front" ? "Front" : "Back", labelX, y + mmToPx(2, options.dpi) + indexPx * 1.2);
  });
  const markReach = mmToPx(CROP_GAP_MM + CROP_MARK_MM, options.dpi);
  ctx.font = `700 ${fontPx}px ${options.fonts.body}`;
  ctx.fillStyle = "#16324f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const first = layout.slots[0];
  if (first) {
    const cardTop = mmToPx(first.y, options.dpi);
    const bannerH = Math.max(fontPx * 2.2, (cardTop - markReach) * 0.72);
    if (options.logo) {
      paintBrandLogo(ctx, options.logo, {
        x: mmToPx(16, options.dpi),
        y: Math.max(mmToPx(2, options.dpi), (cardTop - markReach - bannerH) / 2),
        width: width - mmToPx(32, options.dpi),
        height: bannerH,
      });
    } else {
      ctx.fillText(options.brand, width / 2, Math.max(fontPx, (cardTop - markReach) / 2));
    }
  }
  const last = layout.slots[layout.slots.length - 1];
  if (last) {
    const cardBottom = mmToPx(last.y + CARD_MM.height, options.dpi);
    const areaTop = cardBottom + markReach;
    const areaBottom = height - mmToPx(2, options.dpi);
    const maxWidth = width - mmToPx(16, options.dpi);
    const lines = wrapLines(ctx, caption, maxWidth);
    const lineHeight = fontPx * 1.25;
    const block = lines.length * lineHeight;
    const start = areaTop + Math.max(0, areaBottom - areaTop - block) / 2 + lineHeight / 2;
    for (const [index, line] of lines.entries()) {
      ctx.fillText(line, width / 2, start + index * lineHeight);
    }
  }
}
