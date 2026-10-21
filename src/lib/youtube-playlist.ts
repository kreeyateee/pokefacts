import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";
import { chosenVoice } from "@/lib/piper-voice";
import { cleanSongTitle } from "@/lib/youtube-link";
import { YOTO_ICONS } from "@/lib/yoto-icons";
import type { PlaylistUpload } from "@/lib/yoto-send";

export type MusicPlaylistTrack = {
  title: string;
  youtubeId: string;
  trackUrl: string;
  duration: number;
  fileSize: number;
  format?: string;
  channels?: string;
};

/** Title for the Yoto playlist. A typed title wins. Otherwise the album name. */
export function musicPlaylistTitle(typed: string | undefined, fallback: string): string {
  const clean = (value: string) => value.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const title = clean(typed ?? "") || clean(fallback) || "Pokémon music";
  return title.slice(0, 80);
}

/**
 * Audio playlist. Every track is an uploaded MP3: duration, file size, and format
 * are filled in so Yoto can save it.
 */
export function musicPlaylistUpload(title: string, tracks: MusicPlaylistTrack[], voiceId?: string): PlaylistUpload {
  if (tracks.length === 0) throw new Error("Add at least one song.");
  if (tracks.length > YOTO_TRACK_LIMIT) {
    throw new Error(`A playlist holds ${YOTO_TRACK_LIMIT} tracks. ${tracks.length} songs are picked. Nothing was sent.`);
  }
  const name = musicPlaylistTitle(title, "Pokémon music");
  const chapters = tracks.map((track, index) => {
    const label = cleanSongTitle(track.title);
    const number = String(index + 1);
    if (!track.trackUrl.startsWith("yoto:#")) throw new Error(`${label} is not a finished MP3.`);
    if (!Number.isFinite(track.duration) || track.duration <= 0) {
      throw new Error(`${label} is missing its length, so Yoto cannot save the playlist.`);
    }
    if (!Number.isFinite(track.fileSize) || track.fileSize <= 0) {
      throw new Error(`${label} is missing its file size, so Yoto cannot save the playlist.`);
    }
    const icon = YOTO_ICONS.music;
    return {
      key: `c${number}`,
      title: label,
      overlayLabel: number,
      display: { icon16x16: icon },
      tracks: [
        {
          key: `t${number}`,
          title: label,
          trackUrl: track.trackUrl,
          type: "audio" as const,
          overlayLabel: number,
          display: { icon16x16: icon },
          duration: track.duration,
          fileSize: track.fileSize,
          format: "mp3",
          channels: track.channels === "stereo" ? "stereo" : "mono",
        },
      ],
    };
  });
  return {
    voiceId: chosenVoice(voiceId),
    content: {
      title: name,
      content: { chapters },
      metadata: {
        title: name,
        description: `${name}. Songs saved as MP3s from the YouTube videos on their Bulbapedia pages. Link this playlist to its own Make Your Own card.`,
      },
    },
  };
}
