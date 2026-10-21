import { LOCAL_APP_ORIGIN } from "@/lib/local-origin";
import { isYoutubeVideoId } from "@/lib/youtube-link";

/** Shown when this server is not allowed to contact YouTube. */
export const CLIENT_YOUTUBE_MESSAGE = "YouTube connects from the Pokefacts app on this computer.";

/** Shown when the browser cannot reach the app on this computer. */
export const CLIENT_YOUTUBE_OFFLINE =
  "Open the Pokefacts app on this computer so YouTube can connect, then try again.";

export const UPLOAD_AUDIO_LIMIT = 32 * 1024 * 1024;

export function isClientApp(pageOrigin: string, localOrigin = LOCAL_APP_ORIGIN): boolean {
  return pageOrigin === localOrigin;
}

/** YouTube requests stay on the client app. Same-origin when the page is that app. */
export function clientYoutubeUrl(pageOrigin: string, path: string, localOrigin = LOCAL_APP_ORIGIN): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isClientApp(pageOrigin, localOrigin)) return normalized;
  return `${localOrigin}${normalized}`;
}

export function youtubeStaysOnClient(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.YOUTUBE_DISABLED === "1";
}

export function uploadedAudioError(bytes: number, youtubeId: string): string | null {
  if (!isYoutubeVideoId(youtubeId)) return "That YouTube video id does not look right.";
  if (!Number.isFinite(bytes) || bytes < 1) return "That audio file was empty.";
  if (bytes > UPLOAD_AUDIO_LIMIT) return "That audio file is too large.";
  return null;
}

export async function fetchClientYoutube(pageOrigin: string, path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(clientYoutubeUrl(pageOrigin, path), init);
  } catch {
    throw new Error(CLIENT_YOUTUBE_OFFLINE);
  }
}
