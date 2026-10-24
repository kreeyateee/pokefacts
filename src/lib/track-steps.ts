/**
 * How the page paces one track's steps while Yoto records its lines. The server keeps a few lines
 * recording at once and says how long to wait before the next step; the page waits that long and asks
 * again, instead of polling one recording itself.
 */

/** Rounds of the end-of-send sweep that wait for lines still recording, about two seconds apart. */
export const SCRATCH_SETTLE_ROUNDS = 15;

/** A track whose lines stop coming in for this long is stopped and tried again. */
export const TRACK_STALL_MS = 5 * 60_000;

/** The longest the page waits between two steps, whatever the server asks. */
const LONGEST_WAIT_MS = 60_000;

/** The wait a track step asked for, in milliseconds: its `waitMs`. Undefined when it named none. */
export function stepWait(body: unknown): number | undefined {
  const waitMs = body && typeof body === "object" ? (body as { waitMs?: unknown }).waitMs : undefined;
  if (typeof waitMs !== "number" || !Number.isFinite(waitMs) || waitMs <= 0) return undefined;
  return Math.min(LONGEST_WAIT_MS, Math.max(250, Math.round(waitMs)));
}

/** What the bar says while a track's lines record, or while Yoto has asked for a pause. */
export function recordingNote(recording: unknown, paused = false): string {
  if (paused) return "Yoto asked for a short pause…";
  if (typeof recording === "number" && recording > 1) return `Yoto is recording ${recording} lines…`;
  return "Yoto is recording this line…";
}

/**
 * Watches one try at a track for lines that stop coming in. Each step reports how many lines are left;
 * `stalled` is true once none has come in for TRACK_STALL_MS.
 */
export function lineWatch(now: number): (linesLeft: unknown, at: number) => boolean {
  let left = Number.POSITIVE_INFINITY;
  let movedAt = now;
  return (linesLeft, at) => {
    if (typeof linesLeft === "number" && linesLeft < left) {
      left = linesLeft;
      movedAt = at;
    }
    return at - movedAt > TRACK_STALL_MS;
  };
}
