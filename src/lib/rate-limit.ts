/**
 * A per-visitor request budget for the live server, kept in memory. The site runs as one Node process
 * behind Caddy, so one map is enough; a restart simply starts every budget again.
 *
 * Two budgets per minute: a small one for page requests, which is where scanners probing for files such
 * as /.env land, and a large one for everything else, which a card send (hundreds of track and job
 * requests) stays well inside.
 */
export type Budget = "page" | "other";

export const LIMITS: Record<Budget, number> = { page: 40, other: 900 };
export const WINDOW_MS = 60_000;

/** Asked for many times a second during a send, so the map is swept once per window, not per request. */
export class RateLimiter {
  private counts = new Map<string, number>();
  private windowStart = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly limits: Record<Budget, number> = LIMITS,
    private readonly windowMs = WINDOW_MS,
  ) {}

  /** Counts one request. Returns the seconds to wait when this one is over budget, or 0. */
  take(visitor: string, budget: Budget, now = Date.now()): number {
    if (now - this.windowStart >= this.windowMs) {
      this.counts.clear();
      this.windowStart = now;
    }
    const key = `${budget} ${visitor}`;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    if (count <= this.limits[budget]) return 0;
    return Math.max(1, Math.ceil((this.windowStart + this.windowMs - now) / 1000));
  }
}

/** Sending a card to Yoto: never limited here. */
export function isYotoRoute(pathname: string): boolean {
  return pathname.startsWith("/api/yoto/");
}

/** Which budget a request comes out of. Prefetches and app data count with the API, not as pages. */
export function budgetFor(pathname: string, headers: Headers, search = ""): Budget {
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return "other";
  if (headers.get("rsc") || headers.get("next-router-prefetch") || search.includes("_rsc=")) return "other";
  return "page";
}

/**
 * The visitor's address. Caddy is the only thing that can reach the app (it listens on 127.0.0.1) and
 * appends the real client address last, so the last entry is the one to trust.
 */
export function visitorOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || headers.get("x-real-ip") || "local";
}
