/** Yoto Make Your Own cards are credit-card size, portrait, with rounded corners. */
export const CARD_MM = { width: 54, height: 85.6, radius: 3.18 } as const;

/** Home printers often cannot use the last 12 mm of a sheet. Nothing is printed there. */
export const MIN_MARGIN_MM = 12;

/** Room between cards on the sheet. The cut line is the card edge, so no corner marks need room. */
export const GAP_MM = 4;

/** A line this long is printed on every sheet, so a parent can check the printer kept 100% size. */
export const CHECK_RULER_MM = 50;

/** The back's body starts under the header and stops above the footer band. */
export const BACK_BODY_TOP_MM = 20;
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

/** Paper size is one setting for every card, kept apart from each cover. */
export const STICKER_PAPER_KEY = "pokefacts.stickerPaper";

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
  /** Left of the cards, inside the printable area: logo, how to print, and the check ruler. */
  guide: { x: number; y: number; width: number; height: number };
};

/** The three fronts a child can choose. */
export const COVER_STYLES = ["photo", "pile", "pokedex", "trading"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

/** How to play in three big steps, every name, or a note the parent writes. */
export type BackMode = "steps" | "names" | "note";

export type CoverDraft = {
  style: CoverStyle;
  /** Chapter key of the star Pokémon on the Pokédex and trading card fronts. */
  hero: string;
  /** Printed under "This card belongs to". Empty leaves a line to write on. */
  owner: string;
  title: string;
  backText: string;
  backMode: BackMode;
  /** Chapter keys in the group photo and the pile, or null for everyone on the card. */
  crowd: string[] | null;
  /** Draw the Pokémon as their 16×16 pixel art instead of the full artwork. */
  pixels: boolean;
  /** Shakes the pile into a new arrangement. */
  pileSeed: number;
  painting: string;
  /** When this cover was last saved, so old picks can be tidied away. */
  savedAt: number;
};

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

/** Each row is one card: front on the left, back on the right, centred, inside the printable area. */
export function sheetSlots(paper: PaperId, pairLimit?: number): SheetLayout {
  const page = PAPERS[paper];
  const availableH = page.height - MIN_MARGIN_MM * 2;
  let rows = Math.max(1, Math.floor((availableH + GAP_MM) / (CARD_MM.height + GAP_MM)));
  if (pairLimit && pairLimit > 0) rows = Math.min(rows, pairLimit);
  const contentW = CARD_MM.width * 2 + GAP_MM;
  const contentH = rows * CARD_MM.height + (rows - 1) * GAP_MM;
  const originX = (page.width - contentW) / 2;
  const originY = MIN_MARGIN_MM + (availableH - contentH) / 2;
  const slots: SheetSlot[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (const [column, face] of (["front", "back"] as const).entries()) {
      slots.push({
        face,
        x: originX + column * (CARD_MM.width + GAP_MM),
        y: originY + row * (CARD_MM.height + GAP_MM),
      });
    }
  }
  const guideRight = originX - GAP_MM;
  return {
    width: page.width,
    height: page.height,
    label: page.label,
    slots,
    guide: { x: MIN_MARGIN_MM, y: originY, width: guideRight - MIN_MARGIN_MM, height: contentH },
  };
}

/** Cards that fit on one sheet. */
export function cardsPerSheet(paper: PaperId): number {
  return sheetSlots(paper).slots.length / 2;
}

export const PRINT_STEPS = [
  "Print at 100% or Actual size, not Fit to page.",
  "Check the line below is 5 cm.",
  "Cut along the grey edge of each card.",
] as const;

export function stickerFilename(title: string, paper: PaperId): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "card"}-yoto-stickers-${paper}.pdf`;
}

export function stickerStorageKey(cardId: string): string {
  return `pokefacts.stickers.v3.${cardId}`;
}

function lineMm(fontPt: number): number {
  return fontPt * (25.4 / 72) * LIST_LEADING;
}

function textMm(chars: number, fontPt: number): number {
  return chars * fontPt * 0.52 * (25.4 / 72);
}

/** The biggest type that fits every name on the back, or null when they cannot fit. */
export function nameListPlan(lines: readonly string[]): { columns: number; fontPt: number } | null {
  if (lines.length === 0) return null;
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const boxW = CARD_MM.width - BACK_PAD_MM * 2;
  const boxH = CARD_MM.height - BACK_BODY_TOP_MM - BACK_FOOTER_MM - 2;
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

/** The back lists names only when asked, when they fit, and never for riddles. */
export function showsNameList(lines: readonly string[], mode: BackMode, hideNames: boolean): boolean {
  return !hideNames && mode === "names" && nameListPlan(lines) !== null;
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
  return {
    style: "photo",
    hero: input.keys[0] ?? "",
    owner: "",
    title,
    backText: stickerBackText({
      title,
      rangeLabel: input.rangeLabel.trim(),
      blurb: input.blurb.trim(),
      childDoes: input.childDoes,
      detail: input.detail,
    }),
    backMode: "steps",
    crowd: null,
    pixels: false,
    pileSeed: 0,
    painting: "",
    savedAt: 0,
  };
}

export function paperId(value: unknown): PaperId {
  return value === "letter" ? "letter" : "a4";
}

/** Covers saved before the group photo used "grid"; they open as the group photo. */
export function coverStyle(value: unknown): CoverStyle {
  return COVER_STYLES.find((style) => style === value) ?? "photo";
}

/** Older covers saved "auto"; they now show the how-to-play steps. */
export function backMode(value: unknown): BackMode {
  return value === "names" || value === "note" ? value : "steps";
}

/**
 * Read a saved cover. Anything missing or broken falls back to the fresh cover,
 * so covers saved before the three styles still open, as a group photo of everyone.
 */
export function readCoverDraft(raw: string | null, fresh: CoverDraft, keys: ReadonlySet<string>): CoverDraft {
  if (!raw) return fresh;
  let parsed: Partial<Record<keyof CoverDraft, unknown>>;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return fresh;
    parsed = value as typeof parsed;
  } catch {
    return fresh;
  }
  // An empty crowd is a choice ("Nobody"). A crowd that only named Pokémon no longer on the card means everyone.
  const savedCrowd = Array.isArray(parsed.crowd) ? parsed.crowd : null;
  const kept = savedCrowd ? [...new Set(savedCrowd.filter((key): key is string => typeof key === "string" && keys.has(key)))] : [];
  const crowd = savedCrowd && !(savedCrowd.length > 0 && kept.length === 0) ? kept : null;
  const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
  return {
    style: coverStyle(parsed.style),
    hero: typeof parsed.hero === "string" && keys.has(parsed.hero) ? parsed.hero : fresh.hero,
    owner: text(parsed.owner, "").slice(0, 40),
    title: text(parsed.title, fresh.title),
    backText: text(parsed.backText, fresh.backText),
    backMode: backMode(parsed.backMode),
    crowd,
    pixels: parsed.pixels === true,
    pileSeed: typeof parsed.pileSeed === "number" && Number.isInteger(parsed.pileSeed) ? parsed.pileSeed : 0,
    painting: paintingUrl(parsed.painting),
    savedAt: typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
  };
}

/** A drawing is a PNG data URL. Anything else, or one far too big to have come from this page, is dropped. */
export const MAX_PAINTING_CHARS = 4_000_000;

export function paintingUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("data:image/png;base64,")) return "";
  return value.length > MAX_PAINTING_CHARS ? "" : value;
}

/** Pokédex picks get a new card id each time. Keep the newest few covers and tidy the rest. */
export const KEPT_PICK_COVERS = 12;

export function staleCoverIds(saved: ReadonlyArray<{ id: string; savedAt: number }>, keep = KEPT_PICK_COVERS): string[] {
  return saved
    .filter((item) => item.id.startsWith("selection-"))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(keep)
    .map((item) => item.id);
}

export function playlistLine(mark: string, name: string): string {
  const number = mark.trim();
  return number ? `${number} ${name}` : name;
}
