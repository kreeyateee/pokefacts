import { isYoutubeVideoId } from "@/lib/youtube-link";

/** The sentence yt-dlp turns into when YouTube asks for a sign-in. */
export const YOUTUBE_SIGN_IN_ERROR =
  "YouTube asked for a sign-in, so this audio could not be saved as an MP3.";

export const YOUTUBE_COOKIE_STORAGE = "pokefacts.youtubeCookies";

export const UPLOAD_AUDIO_LIMIT = 32 * 1024 * 1024;

const COOKIE_TEXT_LIMIT = 64_000;

const AUTH_COOKIE =
  /^(?:LOGIN_INFO|SID|HSID|SSID|APISID|SAPISID|__Secure-1PSID|__Secure-3PSID|__Secure-1PAPISID|__Secure-3PAPISID)$/;

export function uploadedAudioError(bytes: number, youtubeId: string): string | null {
  if (!isYoutubeVideoId(youtubeId)) return "That YouTube video id does not look right.";
  if (!Number.isFinite(bytes) || bytes < 1) return "That audio file was empty.";
  if (bytes > UPLOAD_AUDIO_LIMIT) return "That audio file is too large.";
  return null;
}

function netscapeLine(name: string, value: string): string {
  return `.youtube.com\tTRUE\t/\tTRUE\t0\t${name}\t${value}`;
}

/**
 * A Netscape cookies.txt, or a Cookie header copied from youtube.com.
 * Anything else is refused. The result is what yt-dlp reads.
 */
export function netscapeYoutubeCookies(raw: string): string | null {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text || text.length > COOKIE_TEXT_LIMIT || text.includes("\0")) return null;
  const lines = text.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"));
  const netscape = lines.filter((line) => line.split("\t").length >= 7 && /youtube\.com|google\.com/i.test(line));
  if (netscape.length > 0) {
    const names = netscape.map((line) => line.split("\t")[5] ?? "");
    if (!names.some((name) => AUTH_COOKIE.test(name))) return null;
    return `${netscape.join("\n")}\n`;
  }
  const pairs = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const rows: string[] = [];
  for (const part of pairs) {
    const splitAt = part.indexOf("=");
    if (splitAt <= 0) continue;
    const name = part.slice(0, splitAt).trim();
    const value = part.slice(splitAt + 1).trim();
    if (!AUTH_COOKIE.test(name) || !value || /[\r\n\t;]/.test(value)) continue;
    rows.push(netscapeLine(name, value));
  }
  if (rows.length === 0) return null;
  return `${rows.join("\n")}\n`;
}

export function encodeYoutubeCookies(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeYoutubeCookies(value: string | null): string | null {
  if (!value || value.length > COOKIE_TEXT_LIMIT * 2) return null;
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return netscapeYoutubeCookies(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
