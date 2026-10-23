import { ensureEpisode, radioDate } from "@/lib/radio/radio-store";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site";

/** How long a request waits for today's episode to be made before answering without it. */
const MAKE_WAIT_MS = 25_000;

/** Makes today's episode if it is not made yet, waiting a little for it. A failure leaves the feed as it was. */
export async function withTodaysEpisode(): Promise<void> {
  const made = ensureEpisode(radioDate()).catch((error: unknown) => {
    console.error("[radio] today's episode could not be made:", error instanceof Error ? error.message : error);
    return null;
  });
  await Promise.race([made, new Promise((resolve) => setTimeout(resolve, MAKE_WAIT_MS))]);
}

/** The address podcast apps should use: this computer's own address when run at home, the public site otherwise. */
export function feedOrigin(request: Request): string {
  const url = new URL(request.url);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) || url.hostname.endsWith(".localhost");
  return local ? url.origin : PUBLIC_SITE_ORIGIN;
}
