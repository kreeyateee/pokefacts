import { DONATE_URL } from "./site";

/** One toast id so the ready cheer replaces the “still recording” note. */
export const SEND_TOAST_ID = "pokefacts-send";

export const DONATE_LABEL = "Buy me a coffee";

export const SEND_TOAST_MS = 20_000;

export function sendStartedCopy(title: string): string {
  const name = title.trim() || "This playlist";
  return `${name} is recording in the background. Keep browsing.`;
}

export function sendReadyCopy(title: string, updated = false): string {
  const name = title.trim() || "The playlist";
  return updated
    ? `${name} was updated. Fancy buying me a coffee?`
    : `${name} is ready to link. Fancy buying me a coffee?`;
}

export function sendAllReadyCopy(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return `All ${n} Pokefacts playlists are ready to link. Fancy buying me a coffee?`;
}

export function sendCheerAction(): { label: string; href: string } {
  return { label: DONATE_LABEL, href: DONATE_URL };
}
