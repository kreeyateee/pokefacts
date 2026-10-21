/** Yoto Make Your Own cards are credit-card size, portrait. */
export const CARD_MM = { width: 54, height: 85.6, radius: 3.18 } as const;

/** Home printers often cannot use the last 12 mm of a sheet. */
export const MIN_MARGIN_MM = 12;

/** Room between stickers for corner marks. */
export const GAP_MM = 8;

export const CROP_MARK_MM = 2.6;
export const CROP_GAP_MM = 0.6;

export const BACK_HEADER_MM = 22;
export const BACK_PAD_MM = 3.4;
export const BACK_FOOTER_MM = 3.2;

export const LIST_LEADING = 1.3;
export const READABLE_LIST_PT = 6.5;

export const PREVIEW_DPI = 180;
export const SHEET_PREVIEW_DPI = 96;
export const PRINT_DPI = 300;

export type PaperId = "a4" | "letter";

export const PAPERS: Record<PaperId, { width: number; height: number; label: string }> = {
  a4: { width: 210, height: 297, label: "A4" },
  letter: { width: 215.9, height: 279.4, label: "US Letter" },
};

export type SheetSlot = {
  face: "front" | "back";
  x: number;
  y: number;
};

export type SheetLayout = {
  width: number;
  height: number;
  label: string;
  slots: SheetSlot[];
};

export const STICKER_SHAPES = ["circle", "round", "hex", "star", "diamond"] as const;
export type StickerShape = (typeof STICKER_SHAPES)[number];

/** How a cover fills with stickers. Square and rectangle are grids. Circle and hex are packed tiles. */
export const TILE_LAYOUTS = ["square", "rectangle", "circle", "hex"] as const;
export type TileLayout = (typeof TILE_LAYOUTS)[number];

export const STICKER_COLORS = ["#ffcb05", "#e10600", "#2a75bb", "#7ac74c", "#f95587", "#ff8c42", "#9b5de5", "#fffdf6", "#16324f"] as const;

export const DECORATION_KEYS = [
  "deco:poke",
  "deco:great",
  "deco:ultra",
  "deco:cheri",
  "deco:pecha",
  "deco:oran",
  "deco:sitrus",
  "deco:rawst",
  "deco:pamtre",
] as const;

export type PlacedSticker = {
  id: string;
  key: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  shape: StickerShape;
  color: string;
};

export type BackMode = "auto" | "names" | "note";

export type CoverDraft = {
  title: string;
  description: string;
  backText: string;
  backMode: BackMode;
  paper: PaperId;
  /** Tile shape used to place every sticker on the cover. */
  pattern: TileLayout;
  /** Multiplier on the pattern's tile size. 1 keeps the fitted size. */
  tileScale: number;
  stickers: PlacedSticker[];
  painting: string;
};

const SUGGESTED_STICKERS = 5;

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function cardPixelSize(dpi: number): { width: number; height: number } {
  return { width: mmToPx(CARD_MM.width, dpi), height: mmToPx(CARD_MM.height, dpi) };
}

export function pagePixelSize(paper: PaperId, dpi: number): { width: number; height: number } {
  const page = PAPERS[paper];
  return { width: mmToPx(page.width, dpi), height: mmToPx(page.height, dpi) };
}

function fits(count: number, item: number, gap: number, available: number): boolean {
  if (count < 1) return false;
  return count * item + (count - 1) * gap <= available + 0.05;
}

export function sheetSlots(paper: PaperId, pairLimit?: number): SheetLayout {
  const page = PAPERS[paper];
  const availableW = page.width - MIN_MARGIN_MM * 2;
  const availableH = page.height - MIN_MARGIN_MM * 2;
  let columns = 1;
  let rows = 1;
  for (let count = 6; count >= 1; count -= 1) {
    if (fits(count, CARD_MM.width, GAP_MM, availableW)) {
      columns = count;
      break;
    }
  }
  for (let count = 6; count >= 1; count -= 1) {
    if (fits(count, CARD_MM.height, GAP_MM, availableH)) {
      rows = count;
      break;
    }
  }
  if (columns >= 2) columns -= columns % 2;
  if (pairLimit && pairLimit > 0) rows = Math.min(rows, pairLimit);
  const contentW = columns * CARD_MM.width + (columns - 1) * GAP_MM;
  const contentH = rows * CARD_MM.height + (rows - 1) * GAP_MM;
  const originX = (page.width - contentW) / 2;
  const originY = (page.height - contentH) / 2;
  const slots: SheetSlot[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      slots.push({
        face: column % 2 === 0 ? "front" : "back",
        x: originX + column * (CARD_MM.width + GAP_MM),
        y: originY + row * (CARD_MM.height + GAP_MM),
      });
    }
  }
  return { width: page.width, height: page.height, label: page.label, slots };
}

export function sheetCaption(): string {
  return "Print at 100% or Actual size. Do not choose Fit to page. Each row is a different card. Left is the front. Right is the back. Cut on the corner marks.";
}

export function stickerFilename(title: string, paper: PaperId): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "card"}-yoto-stickers-${paper}.pdf`;
}

export function stickerStorageKey(cardId: string): string {
  return `pokefacts.stickers.${cardId}`;
}

function lineMm(fontPt: number): number {
  return fontPt * (25.4 / 72) * LIST_LEADING;
}

function textMm(chars: number, fontPt: number): number {
  return chars * fontPt * 0.52 * (25.4 / 72);
}

export function nameListPlan(lines: readonly string[]): { columns: number; fontPt: number } | null {
  if (lines.length === 0) return null;
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const boxW = CARD_MM.width - BACK_PAD_MM * 2;
  const boxH = CARD_MM.height - BACK_HEADER_MM - BACK_PAD_MM - BACK_FOOTER_MM;
  let best: { columns: number; fontPt: number } | null = null;
  for (const columns of [2, 3]) {
    const colW = boxW / columns;
    for (let half = 16; half >= 10; half -= 1) {
      const fontPt = half / 2;
      const rows = Math.ceil(lines.length / columns);
      if (rows * lineMm(fontPt) <= boxH && textMm(longest, fontPt) <= colW - 1) {
        if (!best || fontPt > best.fontPt) best = { columns, fontPt };
        break;
      }
    }
  }
  return best;
}

export function coverListsNames(lines: readonly string[], mode: BackMode, hideNames: boolean): boolean {
  if (hideNames || mode === "note" || lines.length === 0) return false;
  const plan = nameListPlan(lines);
  if (!plan) return false;
  if (mode === "names") return true;
  return plan.fontPt >= READABLE_LIST_PT;
}

const ASPECT = CARD_MM.height / CARD_MM.width;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 0.3;
  // 0.1 lets a dense tile pattern fit the card. Larger stickers still stop at 0.56.
  return Math.min(0.56, Math.max(0.1, scale));
}

export function isDecorationKey(key: string): boolean {
  return (DECORATION_KEYS as readonly string[]).includes(key);
}

export function stickerShape(value: unknown, index = 0): StickerShape {
  return STICKER_SHAPES.find((shape) => shape === value) ?? STICKER_SHAPES[index % STICKER_SHAPES.length] ?? "circle";
}

export function stickerColor(value: unknown, index = 0): string {
  if (typeof value === "string" && STICKER_COLORS.some((color) => color === value.toLowerCase())) return value.toLowerCase();
  return STICKER_COLORS[index % STICKER_COLORS.length] ?? "#ffcb05";
}

export function clampRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const turn = Math.PI * 2;
  const wrapped = value - Math.floor(value / turn) * turn;
  return wrapped > Math.PI ? wrapped - turn : wrapped;
}

export function stickerStyle(index: number): { shape: StickerShape; color: string; rotation: number } {
  return { shape: stickerShape(undefined, index), color: stickerColor(undefined, index), rotation: 0 };
}

export function clampSticker(
  point: { x: number; y: number },
  scale = 0.3,
  rotation = 0,
): { x: number; y: number } {
  const rot = clampRotation(rotation);
  const half = Math.max(0, scale) / 2;
  const extent = half * (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot)));
  const halfW = Math.min(0.46, extent);
  const halfH = Math.min(0.46, extent / ASPECT);
  const clamp = (value: number, halfEdge: number) => {
    if (!Number.isFinite(value)) return 0.5;
    const inset = Math.min(0.47, halfEdge + 0.02);
    return Math.min(1 - inset, Math.max(inset, value));
  };
  return { x: clamp(point.x, halfW), y: clamp(point.y, halfH) };
}

export function stickerHits(
  sticker: { x: number; y: number; scale: number; rotation?: number },
  x: number,
  y: number,
): boolean {
  const rot = sticker.rotation ?? 0;
  const dx = x - sticker.x;
  const dy = (y - sticker.y) * ASPECT;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const half = sticker.scale / 2;
  return Math.abs(lx) <= half && Math.abs(ly) <= half;
}

export function topStickerAt(stickers: readonly PlacedSticker[], x: number, y: number): PlacedSticker | null {
  for (let index = stickers.length - 1; index >= 0; index -= 1) {
    const sticker = stickers[index];
    if (sticker && stickerHits(sticker, x, y)) return sticker;
  }
  return null;
}

export function bringToFront(stickers: readonly PlacedSticker[], id: string): PlacedSticker[] {
  const index = stickers.findIndex((sticker) => sticker.id === id);
  if (index < 0 || index === stickers.length - 1) return stickers.slice();
  const next = stickers.slice();
  const [item] = next.splice(index, 1);
  if (!item) return stickers.slice();
  next.push(item);
  return next;
}

const OPEN_SPOTS = [
  { x: 0.5, y: 0.48 },
  { x: 0.28, y: 0.4 },
  { x: 0.72, y: 0.4 },
  { x: 0.32, y: 0.62 },
  { x: 0.68, y: 0.62 },
  { x: 0.5, y: 0.34 },
  { x: 0.5, y: 0.64 },
];

export function openSpot(existing: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } {
  for (const spot of OPEN_SPOTS) {
    const crowded = existing.some((item) => Math.hypot(item.x - spot.x, item.y - spot.y) < 0.14);
    if (!crowded) return spot;
  }
  const step = existing.length;
  return { x: 0.34 + (step % 4) * 0.1, y: 0.4 + (step % 3) * 0.1 };
}

function spreadKeys(keys: readonly string[], count: number): string[] {
  if (keys.length <= count) return keys.slice();
  const picked: string[] = [];
  const used = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    let choice = Math.round((index * (keys.length - 1)) / (count - 1));
    while (used.has(choice) && choice < keys.length - 1) choice += 1;
    used.add(choice);
    const key = keys[choice];
    if (key) picked.push(key);
  }
  return picked;
}

export function tileLayout(value: unknown): TileLayout {
  return TILE_LAYOUTS.find((layout) => layout === value) ?? "square";
}

/** 1 is the fitted tile size. Bigger and smaller stay inside this range. */
export function clampTileScale(value: unknown): number {
  const number = typeof value === "number" ? value : 1;
  if (!Number.isFinite(number)) return 1;
  return Math.min(1.4, Math.max(0.7, Math.round(number * 100) / 100));
}

const TILE_LEFT = 0.18;
const TILE_RIGHT = 0.82;
const TILE_TOP = 0.32;
const TILE_BOTTOM = 0.86;

export function tileGrid(layout: TileLayout, count: number): { columns: number; rows: number } {
  if (count < 1) return { columns: 0, rows: 0 };
  if (layout === "circle") return { columns: count, rows: 1 };
  if (layout === "rectangle") {
    const columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * 2))));
    return { columns, rows: Math.ceil(count / columns) };
  }
  if (layout === "hex") {
    const columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * 1.15))));
    return { columns, rows: Math.ceil(count / columns) };
  }
  const columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count))));
  return { columns, rows: Math.ceil(count / columns) };
}

function fittedTileScale(columns: number, rows: number, packed = false): number {
  const width = TILE_RIGHT - TILE_LEFT;
  const height = TILE_BOTTOM - TILE_TOP;
  const cellW = width / Math.max(1, columns);
  const cellH = height / Math.max(1, rows);
  const fromW = cellW * (packed ? 0.9 : 0.86);
  const fromH = cellH * ASPECT * (packed ? 0.72 : 0.82);
  return clampScale(Math.min(fromW, fromH));
}

export type TileCell = { x: number; y: number; scale: number };

export function tileCells(layout: TileLayout, count: number): TileCell[] {
  if (count < 1) return [];
  if (layout === "circle") return circleCells(count);
  if (layout === "hex") return hexCells(count);
  return gridCells(count, layout === "rectangle" ? "rectangle" : "square");
}

function gridCells(count: number, layout: "square" | "rectangle"): TileCell[] {
  const { columns, rows } = tileGrid(layout, count);
  const scale = fittedTileScale(columns, rows);
  const width = TILE_RIGHT - TILE_LEFT;
  const height = TILE_BOTTOM - TILE_TOP;
  const cells: TileCell[] = [];
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const spot = clampSticker(
      {
        x: TILE_LEFT + ((column + 0.5) * width) / columns,
        y: TILE_TOP + ((row + 0.5) * height) / rows,
      },
      scale,
      0,
    );
    cells.push({ x: spot.x, y: spot.y, scale });
  }
  return cells;
}

function hexCells(count: number): TileCell[] {
  const { columns, rows } = tileGrid("hex", count);
  const scale = fittedTileScale(columns, rows, true);
  const width = TILE_RIGHT - TILE_LEFT;
  const height = TILE_BOTTOM - TILE_TOP;
  const stride = columns + 0.5;
  const cells: TileCell[] = [];
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const shift = row % 2 === 1 ? 0.5 : 0;
    const spot = clampSticker(
      {
        x: TILE_LEFT + ((column + shift + 0.5) * width) / stride,
        y: TILE_TOP + ((row + 0.5) * height) / rows,
      },
      scale,
      0,
    );
    cells.push({ x: spot.x, y: spot.y, scale });
  }
  return cells;
}

function circleCells(count: number): TileCell[] {
  const cx = 0.5;
  const cy = 0.58;
  const points: { x: number; y: number }[] = [];
  let remaining = count;
  let ring = 0;
  if ((count === 1 || count > 6) && remaining > 0) {
    points.push({ x: cx, y: cy });
    remaining -= 1;
    ring = 1;
  }
  while (remaining > 0) {
    const capacity = 6 * Math.max(1, ring);
    const take = Math.min(remaining, capacity);
    const radius = Math.max(1, ring);
    const rx = 0.1 + 0.12 * radius;
    const ry = 0.075 + 0.085 * radius;
    for (let index = 0; index < take; index += 1) {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / take;
      points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
    }
    remaining -= take;
    ring += 1;
  }
  const scale = clampScale(count <= 1 ? 0.4 : count <= 6 ? 0.26 : count <= 12 ? 0.18 : 0.12);
  return points.map((point) => {
    const spot = clampSticker(point, scale, 0);
    return { x: spot.x, y: spot.y, scale };
  });
}

/** Put stickers on the pattern cells, in order. An empty list stays empty. */
export function arrangeTiles(
  stickers: readonly PlacedSticker[],
  layout: TileLayout,
  tileScale = 1,
): PlacedSticker[] {
  const cells = tileCells(layout, stickers.length);
  const factor = clampTileScale(tileScale);
  return stickers.map((sticker, index) => {
    const cell = cells[index];
    if (!cell) return { ...sticker };
    const scale = clampScale(cell.scale * factor);
    const spot = clampSticker({ x: cell.x, y: cell.y }, scale, sticker.rotation);
    return { ...sticker, x: spot.x, y: spot.y, scale };
  });
}

/** Index of the tile closest to a point on the card. */
export function nearestTileIndex(count: number, layout: TileLayout, x: number, y: number): number {
  const cells = tileCells(layout, count);
  if (cells.length === 0) return 0;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  cells.forEach((cell, index) => {
    const distance = Math.hypot(cell.x - x, (cell.y - y) * ASPECT);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

export function defaultStickers(keys: readonly string[], layout: TileLayout = "square"): PlacedSticker[] {
  const picked = spreadKeys(keys, Math.min(keys.length, SUGGESTED_STICKERS));
  const placed = picked.map((key, index) => {
    const style = stickerStyle(index);
    return {
      id: `cover-${key}`,
      key,
      x: 0.5,
      y: 0.5,
      scale: 0.3,
      rotation: style.rotation,
      shape: style.shape,
      color: style.color,
    };
  });
  return arrangeTiles(placed, layout, 1);
}

export function isNumberRun(values: readonly number[]): boolean {
  if (values.length < 2) return false;
  return values.every((value, index) => index === 0 || value === (values[index - 1] ?? 0) + 1);
}

function joinList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function countPhrase(count: number, noun: string): string {
  if (count === 1) {
    const one = noun === "Pokémon" ? "Pokémon" : noun.replace(/s$/, "");
    return `1 ${one} is on this card`;
  }
  return `${count} ${noun} are on this card`;
}

export function playlistDetail(input: {
  count: number;
  noun: string;
  names: readonly string[];
  hideNames: boolean;
  ordered: boolean;
}): string {
  if (input.count <= 0) return "";
  const phrase = countPhrase(input.count, input.noun);
  if (input.hideNames) return `${phrase}. The names stay hidden.`;
  if (input.names.length === 0) return `${phrase}.`;
  if (input.ordered && input.names.length > 1) {
    return `${phrase}, from ${input.names[0]} to ${input.names[input.names.length - 1]}.`;
  }
  const shown = input.names.slice(0, 3);
  if (input.names.length > shown.length) return `${phrase}, including ${joinList(shown)}.`;
  return `${phrase}: ${joinList(input.names)}.`;
}

export function stickerBackText(input: {
  title: string;
  rangeLabel: string;
  blurb: string;
  childDoes: string;
  detail: string;
}): string {
  const parts: string[] = [];
  const range = input.rangeLabel.trim();
  const title = input.title.trim();
  if (range && range !== title) parts.push(range);
  if (input.blurb.trim()) parts.push(input.blurb.trim());
  if (input.childDoes.trim()) parts.push(input.childDoes.trim());
  if (input.detail.trim()) parts.push(input.detail.trim());
  return parts.join("\n\n");
}

export function freshCover(input: {
  libraryTitle: string;
  rangeLabel: string;
  blurb: string;
  childDoes: string;
  detail: string;
  keys: readonly string[];
}): CoverDraft {
  const title = input.libraryTitle.trim() || "Pokefacts";
  const range = input.rangeLabel.trim();
  const blurb = input.blurb.trim();
  return {
    title,
    description: blurb,
    backText: stickerBackText({
      title,
      rangeLabel: range,
      blurb,
      childDoes: input.childDoes,
      detail: input.detail,
    }),
    backMode: "auto",
    paper: "a4",
    pattern: "square",
    tileScale: 1,
    stickers: defaultStickers(input.keys),
    painting: "",
  };
}

export function paperId(value: unknown): PaperId {
  return value === "letter" ? "letter" : "a4";
}

export function backMode(value: unknown): BackMode {
  return value === "names" || value === "note" ? value : "auto";
}

export function sanitizeStickers(value: unknown, keys: ReadonlySet<string>): PlacedSticker[] | null {
  if (!Array.isArray(value)) return null;
  const stickers: PlacedSticker[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<PlacedSticker>;
    if (typeof row.id !== "string" || typeof row.key !== "string") continue;
    if (!keys.has(row.key) && !isDecorationKey(row.key)) continue;
    if (typeof row.x !== "number" || typeof row.y !== "number" || typeof row.scale !== "number") continue;
    const scale = clampScale(row.scale);
    const rotation = clampRotation(row.rotation);
    const spot = clampSticker({ x: row.x, y: row.y }, scale, rotation);
    stickers.push({
      id: row.id,
      key: row.key,
      x: spot.x,
      y: spot.y,
      scale,
      rotation,
      shape: stickerShape(row.shape, stickers.length),
      color: stickerColor(row.color, stickers.length),
    });
  }
  return stickers;
}

export function playlistLine(mark: string, name: string): string {
  const number = mark.trim();
  return number ? `${number} ${name}` : name;
}
