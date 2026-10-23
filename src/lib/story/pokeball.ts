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

/** The 16×16 Poké Ball. Yoto takes still PNG icons, so it does not move on the player. */
export const POKEBALL_PIXEL = "/story/pokeball-16.png";

/** The name the icon route knows it by. */
export const POKEBALL_ICON = "pokeball";

/** When the page swaps from the wobble to the click, matching the catch sound. */
export const WOBBLE_TO_CAUGHT_MS = Math.round((CATCH_CLICK - 0.05) * 1000);

/** When the ball breaks free in the escape sound: after two wobbles, a short shake, then the pop at one second. */
export const WOBBLE_TO_BROKE_FREE_MS = Math.round(((CATCH_WOBBLES[1] ?? 0.6) + 0.25) * 1000);
