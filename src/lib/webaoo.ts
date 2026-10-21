import { movePlaylistItem } from "@/lib/playlist-order";
import { YOTO_ICONS } from "@/lib/yoto-icons";

/**
 * Local playlist rules for files the user already has.
 * The Yoto HTTP wrapper lives in webaoo-api.ts. IndexedDB lives in webaoo-store.ts.
 * This module does not fetch, and it does not download video.
 */

/** Same ceiling as a Yoto Make Your Own card. */
export const WEBAOO_TRACK_CAP = 100;

export const YOUTUBE_STAYS_EMBED =
  "YouTube links stay as embeds on this page. They are not uploaded to Yoto.";

export const LOCAL_FILE_ONLY = "Only MP3 and M4A files you already have can be added.";

export const MISSING_FFMPEG = "ffmpeg is missing. Install ffmpeg, then send these files again.";

export const EXPIRED_LOGIN = "Reconnect Yoto. This login expired.";

export type WebaooTrack = {
  id: string;
  fileName: string;
  title: string;
  icon: string;
  mime: string;
  order: number;
};

export type WebaooDraft = {
  title: string;
  cardId: string;
  tracks: WebaooTrack[];
};

export type LocalAudioDraft = {
  id: string;
  fileName: string;
  mime?: string;
  title?: string;
  icon?: string;
};

/** Finished yoto:# audio. Same fields as the studio upload, with no dex id and no cry. */
export type StagedFinishedAudio = {
  trackUrl: string;
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string | number;
};

const ICON = /^yoto:#[A-Za-z0-9_-]+$/;
const YOUTUBE_HOST = /(?:^|[/.\s])(?:youtube\.com|youtube-nocookie\.com|youtu\.be)(?:[/:]|$)/i;

function storedFileName(fileName: string): string {
  return fileName.replace(/[\\/]/g, "_").slice(0, 180);
}

export function isYoutubeReference(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (YOUTUBE_HOST.test(text)) return true;
  if (/^yt:/i.test(text)) return true;
  return false;
}

/** A YouTube link is refused. Nothing is fetched. */
export function youtubeStayEmbedMessage(value: string): string | null {
  if (!isYoutubeReference(value)) return null;
  return YOUTUBE_STAYS_EMBED;
}

export function localAudioError(fileName: string, mime = ""): string | null {
  const youtube = youtubeStayEmbedMessage(fileName);
  if (youtube) return youtube;
  const name = fileName.trim();
  if (/^https?:\/\//i.test(name)) return LOCAL_FILE_ONLY;
  const lower = name.toLowerCase();
  const extOk = lower.endsWith(".mp3") || lower.endsWith(".m4a");
  const type = mime.trim().toLowerCase();
  if (type.startsWith("video/")) return LOCAL_FILE_ONLY;
  const typeOk =
    type === "" ||
    type === "audio/mpeg" ||
    type === "audio/mp3" ||
    type === "audio/mp4" ||
    type === "audio/x-m4a" ||
    type === "audio/m4a" ||
    type === "audio/aac" ||
    type === "application/octet-stream";
  if (!extOk || !typeOk) return LOCAL_FILE_ONLY;
  return null;
}

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, "").replace(/\.(mp3|m4a)$/i, "");
  const cleaned = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Track").slice(0, 80);
}

export function emptyWebaooDraft(): WebaooDraft {
  return { title: "My music", cardId: "", tracks: [] };
}

/** Append local files. Stops at 100. A YouTube name is reported and not added. */
export function addLocalTracks(
  existing: readonly WebaooTrack[],
  incoming: readonly LocalAudioDraft[],
  cap = WEBAOO_TRACK_CAP,
): { tracks: WebaooTrack[]; errors: string[] } {
  const tracks = existing.map((track, order) => ({ ...track, order }));
  const errors: string[] = [];
  for (const file of incoming) {
    const problem = localAudioError(file.fileName, file.mime ?? "");
    if (problem) {
      errors.push(problem);
      continue;
    }
    if (tracks.length >= cap) {
      errors.push(`A playlist holds ${cap} tracks. Remove one before adding another.`);
      break;
    }
    const title = (file.title?.trim() || titleFromFileName(file.fileName)).slice(0, 80);
    const icon = file.icon && ICON.test(file.icon) ? file.icon : YOTO_ICONS.music;
    tracks.push({
      id: file.id,
      fileName: storedFileName(file.fileName),
      title,
      icon,
      mime: file.mime || (file.fileName.toLowerCase().endsWith(".m4a") ? "audio/mp4" : "audio/mpeg"),
      order: tracks.length,
    });
  }
  return { tracks, errors };
}

/** Move the track at `from` so it occupies `to`. Other tracks keep their relative order. */
export function reorderLocalTracks<T>(tracks: readonly T[], from: number, to: number): T[] {
  return movePlaylistItem(tracks, from, to);
}

export function iconOrMusic(icon: string | undefined): string {
  if (icon && ICON.test(icon)) return icon;
  return YOTO_ICONS.music;
}

type MusicChapter = {
  key: string;
  title: string;
  overlayLabel: string;
  display: { icon16x16: string };
  tracks: Array<{
    key: string;
    title: string;
    type: "audio";
    trackUrl: string;
    overlayLabel: string;
    display: { icon16x16: string };
    duration: number;
    fileSize: number;
    format: string;
    channels: string | number;
  }>;
};

/**
 * Playlist body for local music.
 * Every track is type audio. There is no dexId, no lead, and no cry.
 */
export function musicPlaylistContent(
  input: { title?: string; tracks: readonly { id: string; title: string; icon?: string }[] },
  audioById: Record<string, StagedFinishedAudio>,
): {
  title: string;
  metadata: { description: string };
  content: { chapters: MusicChapter[] };
} {
  const title = (input.title?.trim() || "My music").slice(0, 80);
  const chapters = input.tracks.map((track, index) => {
    const audio = audioById[track.id];
    const label = (track.title?.trim() || `Track ${index + 1}`).slice(0, 80);
    if (!audio?.trackUrl.startsWith("yoto:#")) {
      throw new Error(`${label} is missing its finished audio.`);
    }
    if (typeof audio.duration !== "number" || !Number.isFinite(audio.duration)) {
      throw new Error(`${label} is missing its length, so Yoto cannot save the playlist.`);
    }
    if (typeof audio.fileSize !== "number" || !Number.isFinite(audio.fileSize)) {
      throw new Error(`${label} is missing its file size, so Yoto cannot save the playlist.`);
    }
    const icon = iconOrMusic(track.icon);
    return {
      key: `m${index + 1}`,
      title: label,
      overlayLabel: String(index + 1),
      display: { icon16x16: icon },
      tracks: [
        {
          key: `t${index + 1}`,
          title: label,
          type: "audio" as const,
          trackUrl: audio.trackUrl,
          overlayLabel: String(index + 1),
          display: { icon16x16: icon },
          duration: audio.duration,
          fileSize: audio.fileSize,
          format: audio.format ?? "mp3",
          channels: audio.channels ?? "mono",
        },
      ],
    };
  });
  return {
    title,
    metadata: {
      description: `${title}. Local MP3 and M4A files. Card artwork is 638 by 1011 pixels.`,
    },
    content: { chapters },
  };
}
