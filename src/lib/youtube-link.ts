const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[\w-]{10,80}$/;

/** Field separator for one yt-dlp --print line. Titles can contain tabs. */
export const DOWNLOAD_FIELD = "\u001f";

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtube-nocookie.com", "music.youtube.com", "youtu.be"]);

export function isYoutubeVideoId(id: string): boolean {
  return VIDEO_ID.test(id);
}

export function youtubeWatchUrl(id: string): string {
  if (!VIDEO_ID.test(id)) throw new Error("That YouTube video id does not look right.");
  return `https://www.youtube.com/watch?v=${id}`;
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^(www|m)\./, "").toLowerCase();
}

function videoIdFromPath(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") return parts[1] ?? "";
  if (parts[0] === "watch") return url.searchParams.get("v") ?? "";
  return "";
}

/**
 * A YouTube video or playlist link. Anything else is rejected.
 * A watch link that also carries a list is the playlist.
 */
export function youtubeTarget(raw: string): { url: string; playlist: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = hostOf(url);
  if (!YOUTUBE_HOSTS.has(host)) return null;
  const list = url.searchParams.get("list")?.trim() ?? "";
  const listed = PLAYLIST_ID.test(list);
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!VIDEO_ID.test(id)) return null;
    if (listed) return { url: `https://www.youtube.com/watch?v=${id}&list=${list}`, playlist: true };
    return { url: youtubeWatchUrl(id), playlist: false };
  }
  const playlistPath = url.pathname === "/playlist" || url.pathname.startsWith("/playlist/");
  if (playlistPath || listed) {
    if (!listed) return null;
    const id = videoIdFromPath(url);
    if (VIDEO_ID.test(id) && !playlistPath) {
      return { url: `https://www.youtube.com/watch?v=${id}&list=${list}`, playlist: true };
    }
    return { url: `https://www.youtube.com/playlist?list=${list}`, playlist: true };
  }
  const id = videoIdFromPath(url);
  if (!VIDEO_ID.test(id)) return null;
  return { url: youtubeWatchUrl(id), playlist: false };
}

export function cleanSongTitle(title: string | undefined): string {
  const cleaned = (title ?? "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  return (cleaned || "Song").slice(0, 80);
}

export type DownloadRow = {
  id: string;
  title: string;
  file: string;
};

/** Lines from `--print after_move:%(id)s\u001f%(title)s\u001f%(filepath)s`, in playlist order. */
export function parseDownloadLines(stdout: string): DownloadRow[] {
  const rows: DownloadRow[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    const first = trimmed.indexOf(DOWNLOAD_FIELD);
    const second = first >= 0 ? trimmed.indexOf(DOWNLOAD_FIELD, first + 1) : -1;
    if (first < 1 || second < 0) continue;
    const id = trimmed.slice(0, first).trim();
    const title = trimmed.slice(first + 1, second);
    const file = trimmed.slice(second + 1).trim();
    if (!VIDEO_ID.test(id) || !file || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, title: cleanSongTitle(title), file });
  }
  return rows;
}
