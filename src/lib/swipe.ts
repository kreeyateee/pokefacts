/** How far a finger has to travel sideways before a swipe counts, in CSS pixels. */
export const SWIPE_MIN_PX = 56;

/** Slower than this is a drag or a read, not a swipe. */
export const SWIPE_MAX_MS = 900;

/**
 * Which way a finger moved: 1 for on to the next (it moved left), -1 for back (it moved right), 0 when
 * it was too short, too slow, or more up and down than sideways, as when scrolling the page.
 */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > SWIPE_MAX_MS) return 0;
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** How far the card follows the finger: a little, and less the further it goes, so it feels held. */
export function swipeNudge(dx: number): number {
  const sign = Math.sign(dx);
  return sign * Math.min(48, Math.abs(dx) * 0.35);
}
