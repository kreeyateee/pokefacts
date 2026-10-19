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

export type PlacedSticker = {
  id: string;
  key: string;
  x: number;
  y: number;
  scale: number;
};

export type BackMode = "auto" | "names" | "note";

export type CoverDraft = {
  title: string;
  description: string;
  backText: string;
  backMode: BackMode;
  paper: PaperId;
  stickers: PlacedSticker[];
};

const SPOTS = [
  { x: 0.5, y: 0.49, scale: 0.46 },
  { x: 0.27, y: 0.43, scale: 0.28 },
  { x: 0.73, y: 0.43, scale: 0.28 },
  { x: 0.32, y: 0.6, scale: 0.26 },
  { x: 0.68, y: 0.6, scale: 0.26 },
] as const;

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

export function sheetSlots(paper: PaperId): SheetLayout {
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
  return "Print at 100% or Actual size. Do not choose Fit to page. Left stickers are the front. Right stickers are the back. Cut on the corner marks.";
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
  return Math.min(0.56, Math.max(0.16, scale));
}

export function clampSticker(point: { x: number; y: number }, scale = 0.3): { x: number; y: number } {
  const halfW = Math.min(0.45, Math.max(0, scale) / 2);
  const halfH = Math.min(0.45, Math.max(0, scale) / (2 * ASPECT));
  const clamp = (value: number, half: number) => {
    if (!Number.isFinite(value)) return 0.5;
    const inset = Math.min(0.46, half + 0.02);
    return Math.min(1 - inset, Math.max(inset, value));
  };
  return { x: clamp(point.x, halfW), y: clamp(point.y, halfH) };
}

export function stickerHits(sticker: { x: number; y: number; scale: number }, x: number, y: number): boolean {
  const halfW = sticker.scale / 2;
  const halfH = sticker.scale / (2 * ASPECT);
  return Math.abs(x - sticker.x) <= halfW && Math.abs(y - sticker.y) <= halfH;
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

export function defaultStickers(keys: readonly string[]): PlacedSticker[] {
  return spreadKeys(keys, SPOTS.length).map((key, index) => {
    const spot = SPOTS[index] ?? SPOTS[0];
    return { id: `cover-${key}`, key, x: spot.x, y: spot.y, scale: spot.scale };
  });
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
    stickers: defaultStickers(input.keys),
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
    if (typeof row.id !== "string" || typeof row.key !== "string" || !keys.has(row.key)) continue;
    if (typeof row.x !== "number" || typeof row.y !== "number" || typeof row.scale !== "number") continue;
    const spot = clampSticker({ x: row.x, y: row.y }, row.scale);
    stickers.push({ id: row.id, key: row.key, x: spot.x, y: spot.y, scale: clampScale(row.scale) });
  }
  return stickers;
}

export function playlistLine(mark: string, name: string): string {
  const number = mark.trim();
  return number ? `${number} ${name}` : name;
}
