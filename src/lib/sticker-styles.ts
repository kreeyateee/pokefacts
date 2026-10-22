import type { KidCardKind } from "@/lib/kid-cards";
import { CARD_MM, type CoverStyle } from "@/lib/sticker-layout";
import { TYPE_COLORS } from "@/lib/types";

/** A box on the card in millimetres from the top-left corner. */
export type Rect = { x: number; y: number; w: number; h: number };

/** Text stays this far inside the card edge, so a slightly-off cut never clips it. */
export const TEXT_SAFE_MM = 2.2;

export const STYLE_CHOICES: ReadonlyArray<{ id: CoverStyle; label: string; detail: string }> = [
  { id: "photo", label: "Group photo", detail: "Everyone lined up, biggest at the back." },
  { id: "pile", label: "Pile", detail: "A huge pile of everyone, edge to edge." },
  { id: "pokedex", label: "Pokédex", detail: "Your star Pokémon on a Pokédex screen." },
  { id: "trading", label: "Trading card", detail: "Your star Pokémon on its own trading card." },
];

/** Logo pill at the top, the crowd on the risers, title ribbon at the bottom. */
export const PHOTO_FRONT = {
  logo: { x: 13, y: 2.2, w: 28, h: 7.6 },
  crowd: { x: 2.6, y: 11, w: 48.8, h: 61.4 },
  ribbon: { x: 2.6, y: 73.4, w: 48.8, h: 9.6 },
} as const;

/** The pile fills almost the whole front. The title sits on a ribbon at the bottom. */
export const PILE_FRONT = {
  crowd: { x: 0.8, y: 0.8, w: 52.4, h: 73.8 },
  ribbon: { x: 2.6, y: 75.4, w: 48.8, h: 8 },
} as const;

/** An A4 poster, portrait. */
export const POSTER_PAPER_MM = { width: 210, height: 297 } as const;

/**
 * Posters are laid out in card units: the page is a card-wide 54 across, so every size in the
 * card painters grows with it. The page is then this tall in those units.
 */
export const POSTER_UNITS = {
  width: CARD_MM.width,
  height: (CARD_MM.width * POSTER_PAPER_MM.height) / POSTER_PAPER_MM.width,
} as const;

/** Home printers leave about 5 mm blank at the edge. Everything on a poster stays 10 mm in. */
export const POSTER_SAFE_MM = 10;

export const POSTER_PHOTO = {
  logo: { x: 15, y: 2.8, w: 24, h: 6.6 },
  crowd: { x: 2.6, y: 10.4, w: 48.8, h: 55.2 },
  ribbon: { x: 2.6, y: 66.6, w: 48.8, h: 7.2 },
} as const;

export const POSTER_PILE = {
  crowd: { x: 2.6, y: 2.6, w: 48.8, h: 63.2 },
  ribbon: { x: 2.6, y: 66.8, w: 48.8, h: 7 },
} as const;

export type PosterStyle = "photo" | "pile";

/** A red Pokédex: lens and lights, a screen with the star, a title label, then the controls. */
export const POKEDEX_FRONT = {
  lens: { x: 4.4, y: 3.8, w: 9.4, h: 9.4 },
  lights: [
    { x: 16.4, y: 4.4, w: 2.8, h: 2.8, color: "#ff4d4d" },
    { x: 20.8, y: 4.4, w: 2.8, h: 2.8, color: "#ffcb05" },
    { x: 25.2, y: 4.4, w: 2.8, h: 2.8, color: "#4dc35a" },
  ],
  logo: { x: 30.5, y: 3.2, w: 20, h: 8 },
  bezel: { x: 4.4, y: 15, w: 45.2, h: 43.4 },
  screen: { x: 7.6, y: 18.2, w: 38.8, h: 33.2 },
  title: { x: 4.4, y: 61, w: 45.2, h: 9.6 },
  info: { x: 4.4, y: 72, w: 45.2, h: 4 },
  pad: { x: 6.4, y: 77.4, w: 6.4, h: 6.4 },
  buttons: [
    { x: 22, y: 79.4, w: 9, h: 2.4 },
    { x: 33.6, y: 79.4, w: 9, h: 2.4 },
  ],
  dot: { x: 45.2, y: 78.2, w: 4.4, h: 4.4 },
} as const;

/** A trading card: yellow border, name bar, art window, kind line, text box, footer. */
export const TRADING_FRONT = {
  border: 2.2,
  name: { x: 4.6, y: 3.6, w: 44.8, h: 6 },
  art: { x: 4.6, y: 10.4, w: 44.8, h: 33.6 },
  kind: { x: 6, y: 45, w: 42, h: 4.2 },
  text: { x: 4.6, y: 50.6, w: 44.8, h: 27.4 },
  footer: { x: 4.6, y: 79.4, w: 44.8, h: 3 },
} as const;

/** The back: header, three numbered steps, the range line, and the owner's name. */
export const BACK_FACE = {
  header: { x: 0, y: 0, w: CARD_MM.width, h: 17 },
  logo: { x: 3.4, y: 1.4, w: 47.2, h: 5 },
  title: { x: 3.4, y: 6.8, w: 47.2, h: 6.4 },
  count: { x: 3.4, y: 13.4, w: 47.2, h: 3 },
  steps: [
    { x: 3.4, y: 21, w: 47.2, h: 9.6 },
    { x: 3.4, y: 32, w: 47.2, h: 9.6 },
    { x: 3.4, y: 43, w: 47.2, h: 9.6 },
  ],
  range: { x: 3.4, y: 55, w: 47.2, h: 4.4 },
  note: { x: 3.4, y: 20, w: 47.2, h: 41 },
  owner: { x: 3.4, y: 62.4, w: 47.2, h: 15.4 },
  footer: { x: 0, y: CARD_MM.height - 3.2, w: CARD_MM.width, h: 3.2 },
} as const;

/** What the Pokédex and trading card fronts show about the star Pokémon. */
export type HeroInfo = {
  name: string;
  number?: number;
  types: readonly string[];
  genus: string;
  /** Who's That cards keep the star a silhouette and its name a question mark. */
  hidden: boolean;
};

export function heroNumber(hero: HeroInfo): string {
  if (hero.hidden || !hero.number) return "No. ???";
  return `No. ${String(hero.number).padStart(3, "0")}`;
}

export function heroName(hero: HeroInfo): string {
  return hero.hidden ? "???" : hero.name;
}

/** "Electric type · Mouse Pokémon", or the question for a riddle. */
export function heroKindLine(hero: HeroInfo): string {
  if (hero.hidden) return "Who's that Pokémon?";
  const types = hero.types.map((type) => type.charAt(0).toUpperCase() + type.slice(1)).join(" and ");
  const genus = hero.genus.trim();
  if (types && genus) return `${types} type · ${genus}`;
  return types ? `${types} type` : genus;
}

export function typeColor(type: string | undefined): string {
  return (type && TYPE_COLORS[type.toLowerCase()]) || "#a8a77a";
}

/** Mix a colour with white. 0 keeps it, 1 is white. */
export function lighten(hex: string, amount: number): string {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!value) return hex;
  const channel = (offset: number) => {
    const base = parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(base + (255 - base) * Math.min(1, Math.max(0, amount)));
  };
  return `#${[0, 2, 4].map((offset) => channel(offset).toString(16).padStart(2, "0")).join("")}`;
}

/** Three short steps a child can follow from the back of the card. */
export function playSteps(kind: KidCardKind): [string, string, string] {
  const last =
    kind === "guess" ? "Listen to the clues, then shout your guess!" : "Press play to hear the cry and the facts.";
  return ["Put the card in your Yoto.", "Turn the wheel to pick a picture.", last];
}

/** "No. 1 to 99", or the playlist's own label when the numbers are not a run. */
export function rangeLine(input: { ids: readonly number[]; rangeLabel: string; hidden: boolean }): string {
  const ids = input.ids.filter((id) => Number.isInteger(id) && id > 0);
  if (!input.hidden && ids.length > 1) {
    const first = ids[0] ?? 0;
    const run = ids.every((id, index) => index === 0 || id === (ids[index - 1] ?? 0) + 1);
    if (run) return `No. ${first} to ${ids[ids.length - 1]}`;
  }
  return input.rangeLabel.trim();
}

/** Every box a style draws, for checks that nothing runs off the card. */
export function styleRects(style: CoverStyle | "back"): Rect[] {
  if (style === "photo") return Object.values(PHOTO_FRONT);
  if (style === "pile") return Object.values(PILE_FRONT);
  if (style === "pokedex") {
    const { lights, buttons, ...rest } = POKEDEX_FRONT;
    return [...Object.values(rest), ...lights, ...buttons];
  }
  if (style === "trading") {
    const { name, art, kind, text, footer } = TRADING_FRONT;
    return [name, art, kind, text, footer];
  }
  const { steps, ...rest } = BACK_FACE;
  return [...Object.values(rest), ...steps];
}

/** Boxes that hold words, which must stay inside the text-safe edge. */
export function textRects(style: CoverStyle | "back"): Rect[] {
  if (style === "photo") return [PHOTO_FRONT.ribbon];
  if (style === "pile") return [PILE_FRONT.ribbon];
  if (style === "pokedex") return [POKEDEX_FRONT.title, POKEDEX_FRONT.info];
  if (style === "trading") {
    return [TRADING_FRONT.name, TRADING_FRONT.kind, TRADING_FRONT.text, TRADING_FRONT.footer];
  }
  return [BACK_FACE.title, BACK_FACE.count, BACK_FACE.range, BACK_FACE.owner, ...BACK_FACE.steps];
}
