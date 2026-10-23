/**
 * A once-a-week coffee toast for people who browse without sending a card. Senders are already asked
 * in the "ready to link" toast, so this is for everyone else, and only after they have used the page
 * for a while.
 */
export const COFFEE_NUDGE_KEY = "pokefacts.coffee-asked-at";

/** Seconds of the page being open and in front before the toast can show. */
export const COFFEE_NUDGE_AFTER_S = 180;

/** At most one ask a week, counting the ask in the send toast. */
export const COFFEE_NUDGE_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export const COFFEE_NUDGE_MS = 15_000;

export const COFFEE_NUDGE_COPY = "Enjoying Pokefacts? It's free, with no ads. If it's made your day, you could buy me a coffee.";

/** When the last ask was, from what this browser stored. Anything unreadable counts as never. */
export function readAskedAt(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Whether to ask now: used long enough this visit, and nobody has been asked in this browser for a week. */
export function shouldNudge(visibleSeconds: number, askedAt: number, now: number): boolean {
  if (visibleSeconds < COFFEE_NUDGE_AFTER_S) return false;
  return askedAt === 0 || now - askedAt >= COFFEE_NUDGE_GAP_MS || askedAt > now;
}
