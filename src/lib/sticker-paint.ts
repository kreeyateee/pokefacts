import { BRAND_IMAGE_KEY, paintBrandLogo } from "@/lib/brand-logo";
import type { KidCardKind } from "@/lib/kid-cards";
import {
  BACK_BODY_TOP_MM,
  BACK_FOOTER_MM,
  BACK_PAD_MM,
  CARD_MM,
  CHECK_RULER_MM,
  LIST_LEADING,
  PRINT_STEPS,
  mmToPx,
  nameListPlan,
  sheetSlots,
  type BackMode,
  type CoverStyle,
  type DrawLayer,
  type PaperId,
} from "@/lib/sticker-layout";
import { maskFromAlpha, pilePhoto, type PileMask } from "@/lib/sticker-pile";
import { groupPhoto } from "@/lib/sticker-photo";
import { paintScene, type Scene } from "@/lib/sticker-scenes";
import {
  BACK_FACE,
  PHOTO_FRONT,
  PILE_FRONT,
  POKEDEX_FRONT,
  POSTER_PHOTO,
  POSTER_PILE,
  TRADING_FRONT,
  heroKindLine,
  heroName,
  heroNumber,
  lighten,
  playSteps,
  typeColor,
  type HeroInfo,
  type PosterStyle,
  type Rect,
} from "@/lib/sticker-styles";

const INK = "#16324f";
const CREAM = "#fffdf6";
const YELLOW = "#ffcb05";
const RED = "#e10600";

export type CardPaint = {
  style: CoverStyle;
  kind: KidCardKind;
  title: string;
  countLabel: string;
  rangeText: string;
  backText: string;
  backMode: BackMode;
  showNames: boolean;
  lines: readonly string[];
  owner: string;
  /** Who's That cards draw every Pokémon as a silhouette and keep the star's name hidden. */
  hidden: boolean;
  /** Everyone in the group photo or pile. `image` is the key of their picture in `images`. */
  crowd: ReadonlyArray<{ image: string; heightDm: number; color?: string }>;
  /** Pixel art is drawn with hard edges at any size. */
  pixelated: boolean;
  /** Which arrangement of the pile to draw. */
  pileSeed: number;
  images: ReadonlyMap<string, CanvasImageSource | null>;
  fonts: { display: string; body: string };
  painting?: CanvasImageSource | null;
  /** Where the drawing goes. Each front paints it at one of two points. */
  drawLayer: DrawLayer;
  hero: { image: CanvasImageSource | null; info: HeroInfo } | null;
  /** Behind the group photo or the pile. The photo starts on the blue sky, the pile on plain white. */
  scene?: Scene;
};

/**
 * What a group photo or a pile needs, on a card front or across an A4 poster: the crowd, the title on
 * its ribbon, and a drawing if there is one.
 */
export type CrowdPaint = Pick<
  CardPaint,
  "title" | "hidden" | "crowd" | "pixelated" | "pileSeed" | "images" | "fonts" | "painting" | "drawLayer" | "scene"
>;

type Fonts = CardPaint["fonts"];

/** Draw in card millimetres: every helper takes mm and scales by the canvas width. */
function scaleFor(ctx: CanvasRenderingContext2D): number {
  return ctx.canvas.width / CARD_MM.width;
}

function box(rect: Rect, mm: number) {
  return { x: rect.x * mm, y: rect.y * mm, w: rect.w * mm, h: rect.h * mm };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
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

type TextStyle = {
  family: string;
  weight: number | string;
  color: string;
  startPx: number;
  minPx: number;
  align: CanvasTextAlign;
  leading?: number;
};

/** Wrap text into a box, shrinking it until it fits. Lines that still do not fit are left off. */
function paintParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  area: { x: number; y: number; w: number; h: number },
  style: TextStyle,
): void {
  if (!text.trim() || area.w <= 0 || area.h <= 0) return;
  const leading = style.leading ?? 1.25;
  let size = style.startPx;
  let lines: string[] = [];
  for (; size >= style.minPx; size -= Math.max(0.5, style.startPx * 0.04)) {
    ctx.font = `${style.weight} ${size}px ${style.family}`;
    lines = wrapLines(ctx, text, area.w);
    if (lines.length * size * leading <= area.h) break;
  }
  size = Math.max(size, style.minPx);
  ctx.font = `${style.weight} ${size}px ${style.family}`;
  lines = wrapLines(ctx, text, area.w);
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = "top";
  const x = style.align === "center" ? area.x + area.w / 2 : style.align === "right" ? area.x + area.w : area.x;
  const lineHeight = size * leading;
  const shown = lines.slice(0, Math.max(1, Math.floor(area.h / lineHeight)));
  const top = area.y + Math.max(0, (area.h - shown.length * lineHeight) / 2);
  shown.forEach((line, index) => {
    if (line) ctx.fillText(line, x, top + index * lineHeight);
  });
}

/** One line, shrunk to fit its width, then trimmed with an ellipsis if it still does not. */
function paintLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  area: { x: number; y: number; w: number; h: number },
  style: TextStyle,
): void {
  if (!text.trim()) return;
  let size = Math.min(style.startPx, area.h);
  ctx.font = `${style.weight} ${size}px ${style.family}`;
  while (size > style.minPx && ctx.measureText(text).width > area.w) {
    size -= Math.max(0.5, size * 0.05);
    ctx.font = `${style.weight} ${size}px ${style.family}`;
  }
  let shown = text;
  while (shown.length > 1 && ctx.measureText(shown).width > area.w) shown = `${shown.slice(0, -2).trimEnd()}…`;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = "middle";
  const x = style.align === "center" ? area.x + area.w / 2 : style.align === "right" ? area.x + area.w : area.x;
  ctx.fillText(shown, x, area.y + area.h / 2);
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

export function crispPicture(url: string): boolean {
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

/** Fit a picture inside a box without cropping it. */
function paintPicture(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  area: { x: number; y: number; w: number; h: number },
  options: { silhouette?: boolean; shadow?: boolean } = {},
) {
  const source = imageBox(image);
  const scale = Math.min(area.w / source.width, area.h / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  const url = imageUrl(image);
  ctx.save();
  ctx.imageSmoothingEnabled = !crispPicture(url);
  if (options.shadow) {
    ctx.shadowColor = "rgba(22, 50, 79, 0.35)";
    ctx.shadowBlur = Math.min(w, h) * 0.04;
    ctx.shadowOffsetY = Math.min(w, h) * 0.025;
  }
  const picture = options.silhouette || isShadowPicture(url) ? paperSilhouette(image) : image;
  ctx.drawImage(picture, area.x + (area.w - w) / 2, area.y + (area.h - h) / 2, w, h);
  ctx.restore();
}

function paintLogoPill(ctx: CanvasRenderingContext2D, spec: CrowdPaint, rect: Rect, mm: number) {
  const area = box(rect, mm);
  ctx.fillStyle = CREAM;
  roundRect(ctx, area.x, area.y, area.w, area.h, area.h / 2);
  ctx.fill();
  paintBrandLogo(ctx, spec.images.get(BRAND_IMAGE_KEY.compact), {
    x: area.x + 1.6 * mm,
    y: area.y + 0.8 * mm,
    width: area.w - 3.2 * mm,
    height: area.h - 1.6 * mm,
  });
}

function paintDrawing(ctx: CanvasRenderingContext2D, spec: CrowdPaint, width: number, height: number, layer: DrawLayer) {
  if (!spec.painting || spec.drawLayer !== layer) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(spec.painting, 0, 0, width, height);
  ctx.restore();
}

type TrimmedPicture = { picture: CanvasImageSource; aspect: number; mask?: PileMask };

const trimmedPictures = new WeakMap<CanvasImageSource, TrimmedPicture>();
const TRIM_SIDE = 512;
const TRIM_ALPHA = 16;

/** The picture without its empty margin, so heights compare bodies and not image boxes. */
function trimmedPicture(image: CanvasImageSource): TrimmedPicture {
  const cached = trimmedPictures.get(image);
  if (cached) return cached;
  const source = imageBox(image);
  const scale = Math.min(1, TRIM_SIDE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  let result: TrimmedPicture = { picture: image, aspect: source.width / source.height };
  if (ctx) {
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    let top = height;
    let left = width;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((data[(y * width + x) * 4 + 3] ?? 0) < TRIM_ALPHA) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right >= left && bottom >= top) {
      const crop = document.createElement("canvas");
      crop.width = right - left + 1;
      crop.height = bottom - top + 1;
      const cropCtx = crop.getContext("2d", { willReadFrequently: true });
      cropCtx?.drawImage(work, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const pixels = cropCtx?.getImageData(0, 0, crop.width, crop.height).data;
      // The pile packs by this outline, so small Pokémon can tuck into the gaps between big ones.
      result = {
        picture: crop,
        aspect: crop.width / crop.height,
        mask: pixels ? maskFromAlpha(pixels, crop.width, crop.height) : undefined,
      };
    } else {
      result = { ...result, mask: maskFromAlpha(data, width, height) };
    }
  }
  trimmedPictures.set(image, result);
  return result;
}

type PhotoLayout = { logo: Rect; crowd: Rect; ribbon: Rect };
type PileLayout = { crowd: Rect; ribbon: Rect };

function paintPhotoFront(
  ctx: CanvasRenderingContext2D,
  spec: CrowdPaint,
  width: number,
  height: number,
  layout: PhotoLayout = PHOTO_FRONT,
) {
  const mm = scaleFor(ctx);
  const scene = spec.scene ?? "sky";
  paintScene(ctx, scene, width, height);
  paintDrawing(ctx, spec, width, height, "behind");

  const area = box(layout.crowd, mm);
  const members = crowdPictures(spec);
  const byKey = new Map(members.map((member) => [member.key, member]));
  const photo = groupPhoto(members, area.w / mm, area.h / mm);

  // Risers: one step under each row, back to front. A scene has its own ground, so they stand on that.
  const rows = scene === "sky" ? [...new Set(photo.map((item) => item.row))] : [];
  for (const row of rows) {
    const baseline = photo.find((item) => item.row === row)?.baseline ?? 0;
    ctx.fillStyle = row % 2 === 0 ? "rgba(201, 164, 58, 0.28)" : "rgba(201, 164, 58, 0.18)";
    ctx.fillRect(0, area.y + (baseline - 1.4) * mm, width, 2.2 * mm);
  }

  for (const item of photo) {
    const member = byKey.get(item.key);
    if (!member) continue;
    const x = area.x + (item.x - item.width / 2) * mm;
    const y = area.y + (item.baseline - item.height) * mm;
    ctx.fillStyle = "rgba(22, 50, 79, 0.16)";
    ctx.beginPath();
    ctx.ellipse(area.x + item.x * mm, area.y + item.baseline * mm, item.width * 0.36 * mm, 0.7 * mm, 0, 0, Math.PI * 2);
    ctx.fill();
    drawMember(ctx, spec, member.trimmed.picture, x, y, item.width * mm, item.height * mm);
  }

  paintLogoPill(ctx, spec, layout.logo, mm);
  paintTitleRibbon(ctx, spec, layout.ribbon, mm, 5.2);
  paintDrawing(ctx, spec, width, height, "front");
}

function drawMember(
  ctx: CanvasRenderingContext2D,
  spec: CrowdPaint,
  picture: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.imageSmoothingEnabled = !spec.pixelated;
  ctx.drawImage(spec.hidden ? paperSilhouette(picture) : picture, x, y, width, height);
  ctx.restore();
}

function crowdPictures(spec: CrowdPaint) {
  return spec.crowd.flatMap((member) => {
    const image = spec.images.get(member.image);
    if (!image) return [];
    const trimmed = trimmedPicture(image);
    return [
      { key: member.image, heightDm: member.heightDm, color: member.color, aspect: trimmed.aspect, mask: trimmed.mask, trimmed },
    ];
  });
}

function paintPileFront(
  ctx: CanvasRenderingContext2D,
  spec: CrowdPaint,
  width: number,
  height: number,
  layout: PileLayout = PILE_FRONT,
) {
  const mm = scaleFor(ctx);
  paintScene(ctx, spec.scene ?? "plain", width, height);
  paintDrawing(ctx, spec, width, height, "behind");
  const area = box(layout.crowd, mm);
  const members = crowdPictures(spec);
  const byKey = new Map(members.map((member) => [member.key, member]));
  for (const item of pilePhoto(members, area.w / mm, area.h / mm, spec.pileSeed)) {
    const member = byKey.get(item.key);
    if (!member) continue;
    ctx.save();
    ctx.translate(area.x + item.cx * mm, area.y + item.cy * mm);
    ctx.rotate(item.rotation);
    drawMember(ctx, spec, member.trimmed.picture, (-item.width / 2) * mm, (-item.height / 2) * mm, item.width * mm, item.height * mm);
    ctx.restore();
  }
  paintTitleRibbon(ctx, spec, layout.ribbon, mm, 4.6);
  paintDrawing(ctx, spec, width, height, "front");
}

function paintTitleRibbon(ctx: CanvasRenderingContext2D, spec: CrowdPaint, rect: Rect, mm: number, startMm: number) {
  const ribbon = box(rect, mm);
  ctx.fillStyle = YELLOW;
  roundRect(ctx, ribbon.x, ribbon.y, ribbon.w, ribbon.h, 2 * mm);
  ctx.fill();
  ctx.lineWidth = 0.5 * mm;
  ctx.strokeStyle = INK;
  ctx.stroke();
  paintLine(ctx, spec.title, { x: ribbon.x + 2 * mm, y: ribbon.y, w: ribbon.w - 4 * mm, h: ribbon.h }, {
    family: spec.fonts.display,
    weight: 700,
    color: INK,
    startPx: startMm * mm,
    minPx: 2.6 * mm,
    align: "center",
  });
}

function heroColor(spec: CardPaint): string {
  if (!spec.hero || spec.hero.info.hidden) return "#9aa5b1";
  return typeColor(spec.hero.info.types[0]);
}

function paintHeroArt(ctx: CanvasRenderingContext2D, spec: CardPaint, area: { x: number; y: number; w: number; h: number }) {
  const image = spec.hero?.image;
  if (image) {
    paintPicture(ctx, image, area, { silhouette: spec.hero?.info.hidden, shadow: true });
    return;
  }
  // No star picked yet, or the picture is still loading: a Poké Ball keeps the window from looking empty.
  const r = Math.min(area.w, area.h) * 0.32;
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  ctx.save();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = INK;
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function paintTypePills(ctx: CanvasRenderingContext2D, spec: CardPaint, right: number, bottom: number, mm: number) {
  const info = spec.hero?.info;
  if (!info || info.hidden) return;
  ctx.font = `700 ${2.2 * mm}px ${spec.fonts.body}`;
  let x = right;
  for (const type of [...info.types].reverse()) {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const w = ctx.measureText(label).width + 2.4 * mm;
    x -= w;
    ctx.fillStyle = typeColor(type);
    roundRect(ctx, x, bottom - 3.4 * mm, w, 3.4 * mm, 1.7 * mm);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, bottom - 1.7 * mm);
    x -= 0.8 * mm;
  }
}

function paintPokedexFront(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  const mm = scaleFor(ctx);
  const f = POKEDEX_FRONT;
  ctx.fillStyle = "#dc0a2d";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#a8001c";
  ctx.fillRect(0, 13.4 * mm, width, 0.6 * mm);

  const lens = box(f.lens, mm);
  const r = lens.w / 2;
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(lens.x + r, lens.y + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d9bf0";
  ctx.beginPath();
  ctx.arc(lens.x + r, lens.y + r, r * 0.76, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.beginPath();
  ctx.arc(lens.x + r * 0.72, lens.y + r * 0.72, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  for (const light of f.lights) {
    const dot = box(light, mm);
    ctx.fillStyle = light.color;
    ctx.strokeStyle = "#4a0010";
    ctx.lineWidth = 0.3 * mm;
    ctx.beginPath();
    ctx.arc(dot.x + dot.w / 2, dot.y + dot.h / 2, dot.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  paintLogoPill(ctx, spec, f.logo, mm);

  const bezel = box(f.bezel, mm);
  const cut = 5 * mm;
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.moveTo(bezel.x + 1.6 * mm, bezel.y);
  ctx.lineTo(bezel.x + bezel.w - 1.6 * mm, bezel.y);
  ctx.quadraticCurveTo(bezel.x + bezel.w, bezel.y, bezel.x + bezel.w, bezel.y + 1.6 * mm);
  ctx.lineTo(bezel.x + bezel.w, bezel.y + bezel.h - 1.6 * mm);
  ctx.quadraticCurveTo(bezel.x + bezel.w, bezel.y + bezel.h, bezel.x + bezel.w - 1.6 * mm, bezel.y + bezel.h);
  ctx.lineTo(bezel.x + cut, bezel.y + bezel.h);
  ctx.lineTo(bezel.x, bezel.y + bezel.h - cut);
  ctx.lineTo(bezel.x, bezel.y + 1.6 * mm);
  ctx.quadraticCurveTo(bezel.x, bezel.y, bezel.x + 1.6 * mm, bezel.y);
  ctx.fill();
  for (const offset of [-2.2, 2.2]) {
    ctx.fillStyle = "#dc0a2d";
    ctx.beginPath();
    ctx.arc(bezel.x + bezel.w / 2 + offset * mm, bezel.y + 1.6 * mm, 0.7 * mm, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#dc0a2d";
  ctx.beginPath();
  ctx.arc(bezel.x + 6 * mm, bezel.y + bezel.h - 3.2 * mm, 1.1 * mm, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 0.45 * mm;
  for (let line = 0; line < 4; line += 1) {
    const y = bezel.y + bezel.h - 4.6 * mm + line * 0.9 * mm;
    ctx.beginPath();
    ctx.moveTo(bezel.x + bezel.w - 10 * mm, y);
    ctx.lineTo(bezel.x + bezel.w - 3 * mm, y);
    ctx.stroke();
  }

  const screen = box(f.screen, mm);
  ctx.save();
  roundRect(ctx, screen.x, screen.y, screen.w, screen.h, 1.2 * mm);
  ctx.fillStyle = lighten(heroColor(spec), 0.72);
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = "rgba(22, 50, 79, 0.08)";
  ctx.lineWidth = 0.25 * mm;
  for (let x = screen.x; x < screen.x + screen.w; x += 2.4 * mm) {
    ctx.beginPath();
    ctx.moveTo(x, screen.y);
    ctx.lineTo(x, screen.y + screen.h);
    ctx.stroke();
  }
  for (let y = screen.y; y < screen.y + screen.h; y += 2.4 * mm) {
    ctx.beginPath();
    ctx.moveTo(screen.x, y);
    ctx.lineTo(screen.x + screen.w, y);
    ctx.stroke();
  }
  paintDrawing(ctx, spec, width, height, "behind");
  paintHeroArt(ctx, spec, {
    x: screen.x + 2 * mm,
    y: screen.y + 4.2 * mm,
    w: screen.w - 4 * mm,
    h: screen.h - 8.6 * mm,
  });
  if (spec.hero) {
    paintLine(ctx, heroNumber(spec.hero.info), { x: screen.x + 1.4 * mm, y: screen.y + 0.8 * mm, w: 18 * mm, h: 3 * mm }, {
      family: spec.fonts.body,
      weight: 800,
      color: INK,
      startPx: 2.6 * mm,
      minPx: 1.8 * mm,
      align: "left",
    });
    paintLine(ctx, heroName(spec.hero.info), { x: screen.x + 1.4 * mm, y: screen.y + screen.h - 4 * mm, w: screen.w / 2, h: 3.4 * mm }, {
      family: spec.fonts.display,
      weight: 700,
      color: INK,
      startPx: 3 * mm,
      minPx: 2 * mm,
      align: "left",
    });
    paintTypePills(ctx, spec, screen.x + screen.w - 1.2 * mm, screen.y + screen.h - 0.8 * mm, mm);
  }
  ctx.restore();

  const title = box(f.title, mm);
  ctx.fillStyle = CREAM;
  roundRect(ctx, title.x, title.y, title.w, title.h, 1.6 * mm);
  ctx.fill();
  ctx.lineWidth = 0.5 * mm;
  ctx.strokeStyle = "#4a0010";
  ctx.stroke();
  paintLine(ctx, spec.title, { x: title.x + 1.6 * mm, y: title.y, w: title.w - 3.2 * mm, h: title.h }, {
    family: spec.fonts.display,
    weight: 700,
    color: INK,
    startPx: 5 * mm,
    minPx: 2.6 * mm,
    align: "center",
  });
  const info = [spec.rangeText, spec.countLabel].filter(Boolean).join(" · ");
  paintLine(ctx, info, box(f.info, mm), {
    family: spec.fonts.body,
    weight: 800,
    color: CREAM,
    startPx: 2.8 * mm,
    minPx: 2 * mm,
    align: "center",
  });

  const pad = box(f.pad, mm);
  const arm = pad.w / 3;
  ctx.fillStyle = "#262626";
  ctx.fillRect(pad.x + arm, pad.y, arm, pad.h);
  ctx.fillRect(pad.x, pad.y + arm, pad.w, arm);
  for (const button of f.buttons) {
    const b = box(button, mm);
    ctx.fillStyle = "#262626";
    roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fill();
  }
  const dot = box(f.dot, mm);
  ctx.fillStyle = "#2d9bf0";
  ctx.strokeStyle = "#4a0010";
  ctx.lineWidth = 0.35 * mm;
  ctx.beginPath();
  ctx.arc(dot.x + dot.w / 2, dot.y + dot.h / 2, dot.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  paintDrawing(ctx, spec, width, height, "front");
}

function paintTradingFront(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  const mm = scaleFor(ctx);
  const f = TRADING_FRONT;
  const color = heroColor(spec);
  ctx.fillStyle = "#f7d02c";
  ctx.fillRect(0, 0, width, height);
  const edge = f.border * mm;
  const inner = { x: edge, y: edge, w: width - edge * 2, h: height - edge * 2 };
  const panel = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
  panel.addColorStop(0, lighten(color, 0.35));
  panel.addColorStop(1, lighten(color, 0.72));
  ctx.fillStyle = panel;
  roundRect(ctx, inner.x, inner.y, inner.w, inner.h, 1.8 * mm);
  ctx.fill();

  const name = box(f.name, mm);
  const hero = spec.hero?.info;
  paintLine(ctx, hero ? heroName(hero) : spec.title, { x: name.x, y: name.y, w: name.w * 0.68, h: name.h }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#1b1b1b",
    startPx: 4.4 * mm,
    minPx: 2.6 * mm,
    align: "left",
  });
  if (hero) {
    paintLine(ctx, heroNumber(hero), { x: name.x + name.w * 0.68, y: name.y, w: name.w * 0.32, h: name.h }, {
      family: spec.fonts.body,
      weight: 800,
      color: "#1b1b1b",
      startPx: 2.8 * mm,
      minPx: 1.9 * mm,
      align: "right",
    });
  }

  const art = box(f.art, mm);
  ctx.fillStyle = "#c9a43a";
  ctx.fillRect(art.x, art.y, art.w, art.h);
  const frame = { x: art.x + 0.9 * mm, y: art.y + 0.9 * mm, w: art.w - 1.8 * mm, h: art.h - 1.8 * mm };
  const sky = ctx.createRadialGradient(
    frame.x + frame.w / 2,
    frame.y + frame.h * 0.45,
    frame.w * 0.08,
    frame.x + frame.w / 2,
    frame.y + frame.h * 0.45,
    frame.w * 0.75,
  );
  sky.addColorStop(0, lighten(color, 0.85));
  sky.addColorStop(1, lighten(color, 0.25));
  ctx.fillStyle = sky;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  paintDrawing(ctx, spec, width, height, "behind");
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  paintHeroArt(ctx, spec, { x: frame.x + 1.2 * mm, y: frame.y + 1.2 * mm, w: frame.w - 2.4 * mm, h: frame.h - 2.4 * mm });
  ctx.restore();

  const kind = box(f.kind, mm);
  ctx.fillStyle = "#efe2a8";
  roundRect(ctx, kind.x, kind.y, kind.w, kind.h, 0.8 * mm);
  ctx.fill();
  paintLine(ctx, hero ? heroKindLine(hero) : spec.countLabel, { x: kind.x + 1 * mm, y: kind.y, w: kind.w - 2 * mm, h: kind.h }, {
    family: spec.fonts.body,
    weight: "italic 700",
    color: "#3d3420",
    startPx: 2.4 * mm,
    minPx: 1.8 * mm,
    align: "center",
  });

  const text = box(f.text, mm);
  ctx.fillStyle = "rgba(255, 253, 246, 0.78)";
  roundRect(ctx, text.x, text.y, text.w, text.h, 1.4 * mm);
  ctx.fill();
  const countNumber = /^\d+/.exec(spec.countLabel)?.[0] ?? "";
  paintLine(ctx, spec.title, { x: text.x + 2 * mm, y: text.y + 1.6 * mm, w: text.w - 13 * mm, h: 6.4 * mm }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#1b1b1b",
    startPx: 4.6 * mm,
    minPx: 2.6 * mm,
    align: "left",
  });
  paintLine(ctx, countNumber, { x: text.x + text.w - 11 * mm, y: text.y + 1.2 * mm, w: 9 * mm, h: 7 * mm }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#1b1b1b",
    startPx: 6 * mm,
    minPx: 3 * mm,
    align: "right",
  });
  ctx.strokeStyle = "rgba(27, 27, 27, 0.25)";
  ctx.lineWidth = 0.3 * mm;
  ctx.beginPath();
  ctx.moveTo(text.x + 2 * mm, text.y + 9.4 * mm);
  ctx.lineTo(text.x + text.w - 2 * mm, text.y + 9.4 * mm);
  ctx.stroke();
  paintParagraph(
    ctx,
    `${playSteps(spec.kind)[2]}\n${spec.rangeText}`,
    { x: text.x + 2 * mm, y: text.y + 10.6 * mm, w: text.w - 4 * mm, h: text.h - 12 * mm },
    { family: spec.fonts.body, weight: 700, color: "#2b2b2b", startPx: 3.1 * mm, minPx: 2.1 * mm, align: "left", leading: 1.3 },
  );

  const footer = box(f.footer, mm);
  paintLine(ctx, "Pokefacts", { x: footer.x, y: footer.y, w: footer.w / 2, h: footer.h }, {
    family: spec.fonts.body,
    weight: 800,
    color: "#3d3420",
    startPx: 2.2 * mm,
    minPx: 1.6 * mm,
    align: "left",
  });
  paintLine(ctx, spec.countLabel, { x: footer.x + footer.w / 2, y: footer.y, w: footer.w / 2, h: footer.h }, {
    family: spec.fonts.body,
    weight: 800,
    color: "#3d3420",
    startPx: 2.2 * mm,
    minPx: 1.6 * mm,
    align: "right",
  });
  paintDrawing(ctx, spec, width, height, "front");
}

function splitLine(line: string): { mark: string; name: string } {
  const space = line.indexOf(" ");
  if (space <= 0) return { mark: "", name: line };
  return { mark: line.slice(0, space), name: line.slice(space + 1) };
}

function paintNameList(ctx: CanvasRenderingContext2D, spec: CardPaint, mm: number, width: number, height: number) {
  const plan = nameListPlan(spec.lines);
  if (!plan) return;
  const pad = BACK_PAD_MM * mm;
  const area = {
    x: pad,
    y: BACK_BODY_TOP_MM * mm,
    w: width - pad * 2,
    h: height - BACK_BODY_TOP_MM * mm - BACK_FOOTER_MM * mm - 2 * mm,
  };
  const fontPx = plan.fontPt * (25.4 / 72) * mm;
  const linePx = fontPx * LIST_LEADING;
  const colW = area.w / plan.columns;
  const rows = Math.ceil(spec.lines.length / plan.columns);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (let column = 0; column < plan.columns; column += 1) {
    const slice = spec.lines.slice(column * rows, (column + 1) * rows);
    const left = area.x + column * colW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, area.y, colW - 0.6 * mm, area.h);
    ctx.clip();
    slice.forEach((line, index) => {
      const parts = splitLine(line);
      const y = area.y + index * linePx;
      let cursor = left;
      if (parts.mark) {
        ctx.font = `700 ${fontPx}px ${spec.fonts.display}`;
        ctx.fillStyle = RED;
        ctx.fillText(parts.mark, cursor, y);
        cursor += ctx.measureText(`${parts.mark} `).width;
      }
      ctx.font = `700 ${fontPx}px ${spec.fonts.body}`;
      ctx.fillStyle = INK;
      ctx.fillText(parts.name, cursor, y);
    });
    ctx.restore();
  }
}

function paintOwner(ctx: CanvasRenderingContext2D, spec: CardPaint, mm: number) {
  const owner = box(BACK_FACE.owner, mm);
  ctx.fillStyle = "rgba(255, 203, 5, 0.22)";
  roundRect(ctx, owner.x, owner.y, owner.w, owner.h, 2 * mm);
  ctx.fill();
  paintLine(ctx, "This card belongs to", { x: owner.x + 2 * mm, y: owner.y + 1 * mm, w: owner.w - 4 * mm, h: 4 * mm }, {
    family: spec.fonts.body,
    weight: 800,
    color: "#3b5675",
    startPx: 2.7 * mm,
    minPx: 2 * mm,
    align: "left",
  });
  const name = spec.owner.trim();
  if (name) {
    paintLine(ctx, name, { x: owner.x + 2 * mm, y: owner.y + 5.4 * mm, w: owner.w - 4 * mm, h: 8.4 * mm }, {
      family: spec.fonts.display,
      weight: 700,
      color: INK,
      startPx: 7 * mm,
      minPx: 3 * mm,
      align: "center",
    });
    return;
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.35 * mm;
  ctx.setLineDash([1.2 * mm, 0.9 * mm]);
  ctx.beginPath();
  ctx.moveTo(owner.x + 3 * mm, owner.y + owner.h - 3 * mm);
  ctx.lineTo(owner.x + owner.w - 3 * mm, owner.y + owner.h - 3 * mm);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintBack(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  const mm = scaleFor(ctx);
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, width, height);
  const header = box(BACK_FACE.header, mm);
  ctx.fillStyle = INK;
  ctx.fillRect(header.x, header.y, header.w, header.h);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, header.h - 1 * mm, width, 1 * mm);
  const footer = box(BACK_FACE.footer, mm);
  ctx.fillStyle = RED;
  ctx.fillRect(footer.x, footer.y, footer.w, footer.h);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, footer.y - 1 * mm, width, 1 * mm);

  const logo = box(BACK_FACE.logo, mm);
  paintBrandLogo(ctx, spec.images.get(BRAND_IMAGE_KEY.compact), { x: logo.x, y: logo.y, width: logo.w, height: logo.h });
  paintLine(ctx, spec.title, box(BACK_FACE.title, mm), {
    family: spec.fonts.display,
    weight: 700,
    color: CREAM,
    startPx: 5.4 * mm,
    minPx: 3 * mm,
    align: "left",
  });
  paintLine(ctx, spec.countLabel, box(BACK_FACE.count, mm), {
    family: spec.fonts.body,
    weight: 800,
    color: YELLOW,
    startPx: 2.8 * mm,
    minPx: 2 * mm,
    align: "left",
  });

  if (spec.showNames) {
    paintNameList(ctx, spec, mm, width, height);
    return;
  }
  if (spec.backMode === "note") {
    paintParagraph(ctx, spec.backText, box(BACK_FACE.note, mm), {
      family: spec.fonts.body,
      weight: 700,
      color: INK,
      startPx: 3.4 * mm,
      minPx: 2.3 * mm,
      align: "left",
      leading: 1.3,
    });
  } else {
    const steps = playSteps(spec.kind);
    BACK_FACE.steps.forEach((rect, index) => {
      const row = box(rect, mm);
      const r = 3.8 * mm;
      const cy = row.y + row.h / 2;
      ctx.fillStyle = YELLOW;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.4 * mm;
      ctx.beginPath();
      ctx.arc(row.x + r, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      paintLine(ctx, String(index + 1), { x: row.x, y: cy - r, w: r * 2, h: r * 2 }, {
        family: spec.fonts.display,
        weight: 700,
        color: INK,
        startPx: 4.6 * mm,
        minPx: 3 * mm,
        align: "center",
      });
      paintParagraph(ctx, steps[index] ?? "", { x: row.x + r * 2 + 2 * mm, y: row.y, w: row.w - r * 2 - 2 * mm, h: row.h }, {
        family: spec.fonts.body,
        weight: 800,
        color: INK,
        startPx: 3.3 * mm,
        minPx: 2.3 * mm,
        align: "left",
        leading: 1.15,
      });
    });
    paintLine(ctx, spec.rangeText, box(BACK_FACE.range, mm), {
      family: spec.fonts.body,
      weight: 800,
      color: "#3b5675",
      startPx: 2.9 * mm,
      minPx: 2 * mm,
      align: "center",
    });
  }
  paintOwner(ctx, spec, mm);
}

function paintFront(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  if (spec.style === "pokedex") paintPokedexFront(ctx, spec, width, height);
  else if (spec.style === "trading") paintTradingFront(ctx, spec, width, height);
  else if (spec.style === "pile") paintPileFront(ctx, spec, width, height);
  else paintPhotoFront(ctx, spec, width, height);
}

function startFace(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.shadowColor = "transparent";
}

/** One face of one card, clipped to the Yoto card's rounded corners. */
export function paintCard(ctx: CanvasRenderingContext2D, face: "front" | "back", spec: CardPaint) {
  const { width, height } = ctx.canvas;
  const mm = width / CARD_MM.width;
  startFace(ctx);
  ctx.save();
  roundRect(ctx, 0, 0, width, height, CARD_MM.radius * mm);
  ctx.clip();
  if (face === "front") paintFront(ctx, spec, width, height);
  else paintBack(ctx, spec, width, height);
  ctx.restore();
}

/**
 * A playlist's cover in the Yoto app: the card's sticker front, edge to edge, since the app rounds the
 * corners itself. The canvas must have the card's shape.
 */
export function paintCover(ctx: CanvasRenderingContext2D, spec: CardPaint) {
  const { width, height } = ctx.canvas;
  startFace(ctx);
  paintFront(ctx, spec, width, height);
}

/**
 * An A4 poster of the group photo or the pile. The canvas must have the A4 shape;
 * the card painters draw it in card units, so everything grows to fill the page.
 */
export function paintPoster(ctx: CanvasRenderingContext2D, style: PosterStyle, spec: CrowdPaint) {
  const { width, height } = ctx.canvas;
  startFace(ctx);
  if (style === "pile") paintPileFront(ctx, spec, width, height, POSTER_PILE);
  else paintPhotoFront(ctx, spec, width, height, POSTER_PHOTO);
}

export type SheetCardLabel = { number: number; total: number; title: string };

function paintRuler(ctx: CanvasRenderingContext2D, x: number, top: number, dpi: number, fonts: Fonts) {
  const mm = (value: number) => (value / 25.4) * dpi;
  const length = mm(CHECK_RULER_MM);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, mm(0.35));
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, top + length);
  for (let tick = 0; tick <= CHECK_RULER_MM; tick += 10) {
    const y = top + mm(tick);
    const reach = tick === 0 || tick === CHECK_RULER_MM ? mm(3) : mm(1.6);
    ctx.moveTo(x, y);
    ctx.lineTo(x + reach, y);
  }
  ctx.stroke();
  ctx.save();
  ctx.translate(x + mm(5.4), top + length / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${mm(3)}px ${fonts.body}`;
  ctx.fillText(`This line is ${CHECK_RULER_MM / 10} cm`, 0, 0);
  ctx.restore();
}

/** A print sheet: each row is one card, front and back, with the print steps and check line beside them. */
export function paintSheet(
  ctx: CanvasRenderingContext2D,
  options: {
    paper: PaperId;
    dpi: number;
    images: readonly CanvasImageSource[];
    labels: readonly SheetCardLabel[];
    fonts: Fonts;
    logo?: CanvasImageSource | null;
  },
) {
  const { dpi, fonts } = options;
  const mm = (value: number) => (value / 25.4) * dpi;
  const pairs = Math.max(1, Math.ceil(options.images.length / 2));
  const layout = sheetSlots(options.paper, pairs);
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const cardW = mmToPx(CARD_MM.width, dpi);
  const cardH = mmToPx(CARD_MM.height, dpi);
  const filled = Math.min(layout.slots.length, options.images.length);
  for (let index = 0; index < filled; index += 1) {
    const slot = layout.slots[index];
    const image = options.images[index];
    if (!slot || !image) continue;
    const x = mmToPx(slot.x, dpi);
    const y = mmToPx(slot.y, dpi);
    ctx.drawImage(image, x, y, cardW, cardH);
    roundRect(ctx, x, y, cardW, cardH, mm(CARD_MM.radius));
    ctx.strokeStyle = "#9aa5b1";
    ctx.lineWidth = Math.max(1, mm(0.25));
    ctx.stroke();
  }

  const guide = {
    x: mm(layout.guide.x),
    y: mm(layout.guide.y),
    w: mm(layout.guide.width),
    h: mm(layout.guide.height),
  };
  let cursor = guide.y;
  if (options.logo) {
    const logoH = guide.w * 0.45;
    paintBrandLogo(ctx, options.logo, { x: guide.x, y: cursor, width: guide.w, height: logoH });
    cursor += logoH + mm(4);
  }
  paintParagraph(ctx, "How to print", { x: guide.x, y: cursor, w: guide.w, h: mm(6) }, {
    family: fonts.display,
    weight: 700,
    color: INK,
    startPx: mm(4.4),
    minPx: mm(3),
    align: "left",
  });
  cursor += mm(7);
  PRINT_STEPS.forEach((step, index) => {
    paintParagraph(ctx, `${index + 1}. ${step}`, { x: guide.x, y: cursor, w: guide.w, h: mm(13) }, {
      family: fonts.body,
      weight: 700,
      color: INK,
      startPx: mm(3),
      minPx: mm(2.4),
      align: "left",
      leading: 1.25,
    });
    cursor += mm(13.5);
  });
  paintRuler(ctx, guide.x + mm(2), Math.min(cursor + mm(2), guide.y + guide.h - mm(CHECK_RULER_MM)), dpi, fonts);

  const labelX = mm(layout.slots[1] ? layout.slots[1].x + CARD_MM.width + 4 : 0);
  const labelW = width - mm(12) - labelX;
  for (let row = 0; row * 2 < filled; row += 1) {
    const slot = layout.slots[row * 2];
    const label = options.labels[row];
    if (!slot || !label || labelW <= 0) continue;
    const top = mm(slot.y);
    paintParagraph(ctx, `Card ${label.number} of ${label.total}`, { x: labelX, y: top, w: labelW, h: mm(6) }, {
      family: fonts.display,
      weight: 700,
      color: INK,
      startPx: mm(4),
      minPx: mm(2.6),
      align: "left",
    });
    paintParagraph(ctx, label.title, { x: labelX, y: top + mm(6.5), w: labelW, h: mm(16) }, {
      family: fonts.body,
      weight: 700,
      color: "#3b5675",
      startPx: mm(3),
      minPx: mm(2.2),
      align: "left",
    });
    paintParagraph(ctx, "Front, then back", { x: labelX, y: top + mm(23), w: labelW, h: mm(5) }, {
      family: fonts.body,
      weight: 700,
      color: "#3b5675",
      startPx: mm(2.6),
      minPx: mm(2),
      align: "left",
    });
  }
}
