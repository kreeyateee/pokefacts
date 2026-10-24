/**
 * The Poké Ball pictures: animations for the page's adventure player, and the 16×16 icon a catch track
 * shows on the Yoto screen. scripts/make-pokeball-gifs.ts draws them all; replace a file to change it.
 */
import { CATCH_CLICK, CATCH_WOBBLES } from "@/lib/story/story-sound";

export const POKEBALL_GIFS = {
  /** Three wobbles, in time with the catch sound's three thuds. Plays once. */
  wobble: "/story/pokeball-wobble.gif",
  /** The click, a lit button and a burst of stars. Plays once and holds. */
  caught: "/story/pokeball-caught.gif",
  /** A shake, a flash, and the ball springs open. Plays once and holds. */
  brokeFree: "/story/pokeball-broke-free.gif",
} as const;

/** The last frame of each ending GIF, shown instead of the animation when motion is turned down. */
export const POKEBALL_STILLS = {
  caught: "/story/pokeball-caught.png",
  brokeFree: "/story/pokeball-broke-free.png",
} as const;

/**
 * The story's own 16×16 pictures for the Yoto screen, by the name the icon route knows each by:
 * the Poké Ball while you choose a throw, then a caught ball or a burst-open one for the result.
 * The Poké Balls are animated 16×16 GIFs that loop on the player (Yoto keeps a GIF moving when it is
 * uploaded with autoConvert=false). The badges and trophy are still.
 */
export const STORY_PIXELS = {
  pokeball: "/story/pokeball-16.gif",
  "pokeball-caught": "/story/pokeball-caught-16.gif",
  "pokeball-broken": "/story/pokeball-broken-16.gif",
  "badge-rock": "/story/badge-rock-16.png",
  "badge-water": "/story/badge-water-16.png",
  "badge-grass": "/story/badge-grass-16.png",
  "badge-electric": "/story/badge-electric-16.png",
  "badge-flying": "/story/badge-flying-16.png",
  "badge-fire": "/story/badge-fire-16.png",
  "badge-ground": "/story/badge-ground-16.png",
  "badge-dragon": "/story/badge-dragon-16.png",
  trophy: "/story/trophy-16.png",
} as const;

export type StoryPixel = keyof typeof STORY_PIXELS;

export function isStoryPixel(value: unknown): value is StoryPixel {
  return typeof value === "string" && Object.hasOwn(STORY_PIXELS, value);
}

/** The 16×16 Poké Ball. */
export const POKEBALL_PIXEL = STORY_PIXELS.pokeball;

/** When the page swaps from the wobble to the click, matching the catch sound. */
export const WOBBLE_TO_CAUGHT_MS = Math.round((CATCH_CLICK - 0.05) * 1000);

/** When the ball breaks free in the escape sound: after two wobbles, a short shake, then the pop at one second. */
export const WOBBLE_TO_BROKE_FREE_MS = Math.round(((CATCH_WOBBLES[1] ?? 0.6) + 0.25) * 1000);
