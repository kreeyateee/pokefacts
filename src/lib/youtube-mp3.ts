import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { audioContainer, describeClip, isPlainYotoMp3, transcodeToYotoMp3 } from "@/lib/cry-audio";
import { ensureFfmpegPath, ffmpegBinDir } from "@/lib/ffmpeg-bin";
import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";
import {
  cleanSongTitle,
  isYoutubeVideoId,
  parseDownloadLines,
  youtubeTarget,
  youtubeWatchUrl,
  type DownloadRow,
} from "@/lib/youtube-link";

const CACHE_DIR = path.join(process.cwd(), "data", "music-mp3");

export type ParsedMp3 = {
  youtubeId: string;
  title: string;
  bytes: Buffer;
  duration: number;
  fileSize: number;
  format: "mp3";
  channels: "mono";
};

/** What yt-dlp actually wrote. A .mp3 name can still be Opus, WebM, or M4A. */
export function downloadContainer(bytes: Buffer): "ogg" | "mp3" | "wav" | "webm" | "mp4" | null {
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
    return "wav";
  }
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") return "mp3";
  if (bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "mp4";
  return null;
}

export function ytdlpCommand(): string {
  const fromEnv = process.env.YT_DLP?.trim();
  if (fromEnv) return fromEnv;
  const local = path.join(homedir(), ".local", "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  if (existsSync(local)) return local;
  return "yt-dlp";
}

export function isDownloadPath(root: string, file: string): boolean {
  const base = path.resolve(root);
  const resolved = path.resolve(file);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

/**
 * Same choice as the MP3 downloader: best audio, then ffmpeg to MP3 at quality 192.
 * A playlist link downloads the playlist. A plain video link does not.
 */
export function ytdlpMp3Args(input: {
  url: string;
  outputDir: string;
  playlist: boolean;
  limit: number;
  ffmpegDir?: string | null;
}): string[] {
  const template = input.playlist ? "%(playlist_index)03d-%(id)s.%(ext)s" : "%(id)s.%(ext)s";
  const args = [
    "--no-warnings",
    "--no-progress",
    "--no-simulate",
    "--retries",
    "2",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "192",
    "--max-downloads",
    String(input.limit),
    "-o",
    path.join(input.outputDir, template),
    "--print",
    "after_move:%(id)s\u001f%(title)s\u001f%(filepath)s",
  ];
  if (input.ffmpegDir) args.push("--ffmpeg-location", input.ffmpegDir);
  if (input.playlist) args.push("--yes-playlist", "--playlist-end", String(input.limit));
  else args.push("--no-playlist");
  args.push(input.url);
  return args;
}

function clampLimit(limit: number | undefined, playlist: boolean): number {
  const fallback = playlist ? YOTO_TRACK_LIMIT : 1;
  const requested = limit == null || !Number.isFinite(limit) ? fallback : Math.floor(limit);
  if (requested < 1) return 1;
  return Math.min(YOTO_TRACK_LIMIT, requested);
}

function ytdlpFailure(error: Error, stderr: string): Error {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return new Error("yt-dlp was not found. Install it with pip install yt-dlp.");
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errorLine = [...lines].reverse().find((line) => /^ERROR:/i.test(line));
  const tail = (errorLine ?? lines.at(-1) ?? "").replace(/^ERROR:\s*/i, "");
  if (/sign in to confirm|not a bot/i.test(tail)) {
    return new Error("YouTube asked for a sign-in, so this audio could not be saved as an MP3.");
  }
  const killed = (error as { killed?: boolean }).killed === true;
  let reason = tail;
  if (!reason) {
    if (killed || code === "ETIMEDOUT") reason = "yt-dlp timed out.";
    else reason = "yt-dlp could not download that audio.";
  }
  return new Error(reason.length > 240 ? `${reason.slice(0, 237)}...` : reason);
}

function runYtdlp(args: string[], timeoutMs: number): Promise<string> {
  ensureFfmpegPath();
  return new Promise((resolve, reject) => {
    execFile(
      ytdlpCommand(),
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4_000_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(ytdlpFailure(error, stderr ?? ""));
          return;
        }
        resolve(stdout ?? "");
      },
    );
  });
}

async function plainMp3(bytes: Buffer): Promise<ParsedMp3 | null> {
  if (audioContainer(bytes) !== "mp3") return null;
  try {
    const info = await describeClip(bytes, "song.mp3");
    if (!isPlainYotoMp3(bytes, info)) return null;
    return {
      youtubeId: "",
      title: "Song",
      bytes,
      duration: info.duration,
      fileSize: bytes.length,
      format: "mp3",
      channels: "mono",
    };
  } catch {
    return null;
  }
}

/** Read the downloaded bytes and keep them only once they parse as a plain MP3. */
export async function parseDownloadedAudio(bytes: Buffer): Promise<Buffer> {
  const kind = downloadContainer(bytes);
  if (!kind) throw new Error("That download was not audio.");
  const ready = await plainMp3(bytes);
  if (ready) return ready.bytes;
  try {
    return await transcodeToYotoMp3(bytes, kind);
  } catch {
    return transcodeToYotoMp3(bytes);
  }
}

function cacheFile(cacheDir: string, youtubeId: string): string {
  if (!isYoutubeVideoId(youtubeId)) throw new Error("That YouTube video id does not look right.");
  return path.join(cacheDir, `${youtubeId}.mp3`);
}

export async function readCachedMp3(youtubeId: string, cacheDir = CACHE_DIR): Promise<ParsedMp3 | null> {
  if (!isYoutubeVideoId(youtubeId)) return null;
  try {
    const bytes = await readFile(cacheFile(cacheDir, youtubeId));
    const parsed = await plainMp3(bytes);
    if (!parsed) {
      await rm(cacheFile(cacheDir, youtubeId), { force: true });
      return null;
    }
    return { ...parsed, youtubeId };
  } catch {
    return null;
  }
}

async function writeCachedMp3(cacheDir: string, youtubeId: string, bytes: Buffer): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  const file = cacheFile(cacheDir, youtubeId);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}

async function songFromRow(row: DownloadRow, root: string, cacheDir: string): Promise<ParsedMp3> {
  if (!isDownloadPath(root, row.file)) throw new Error("yt-dlp wrote a file outside the download folder.");
  let raw: Buffer;
  try {
    raw = await readFile(row.file);
  } catch {
    throw new Error(`${row.title} was not written.`);
  }
  const bytes = await parseDownloadedAudio(raw);
  if (audioContainer(bytes) !== "mp3") throw new Error(`${row.title} did not come out as an MP3.`);
  const parsed = await plainMp3(bytes);
  if (!parsed) throw new Error(`${row.title} did not come out as an MP3.`);
  await writeCachedMp3(cacheDir, row.id, bytes);
  return { ...parsed, youtubeId: row.id, title: row.title, bytes };
}

async function playlistCount(url: string): Promise<number> {
  const stdout = await runYtdlp(["--flat-playlist", "--no-warnings", "--print", "%(id)s", url], 60_000);
  const ids = new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter((id) => isYoutubeVideoId(id)));
  return ids.size;
}

/**
 * Download a video or a playlist and parse every file as a plain MP3.
 * Files that are still Opus, WebM, or M4A are converted before they are kept.
 */
export async function downloadYoutubeMp3s(
  rawUrl: string,
  options?: { limit?: number; cacheDir?: string },
): Promise<ParsedMp3[]> {
  const target = youtubeTarget(rawUrl);
  if (!target) throw new Error("That link is not a YouTube video or playlist.");
  const limit = clampLimit(options?.limit, target.playlist);
  const cacheDir = options?.cacheDir ?? CACHE_DIR;
  if (target.playlist) {
    const count = await playlistCount(target.url);
    if (count > limit) {
      const noun = limit === 1 ? "track" : "tracks";
      throw new Error(`A playlist holds ${limit} ${noun}. This one has ${count}. Nothing was downloaded.`);
    }
    if (count === 0) throw new Error("That playlist has no videos.");
  }
  const root = await mkdtemp(path.join(tmpdir(), "pokefacts-ytdlp-"));
  try {
    const args = ytdlpMp3Args({
      url: target.url,
      outputDir: root,
      playlist: target.playlist,
      limit,
      ffmpegDir: ffmpegBinDir(),
    });
    const timeout = target.playlist ? Math.min(900_000, 45_000 * limit) : 180_000;
    const stdout = await runYtdlp(args, timeout);
    const rows = parseDownloadLines(stdout).slice(0, limit);
    if (rows.length === 0) throw new Error("yt-dlp did not write an MP3.");
    const songs: ParsedMp3[] = [];
    for (const row of rows) songs.push(await songFromRow(row, root, cacheDir));
    return songs;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** One Bulbapedia song. A cached plain MP3 is reused. */
export async function ensureYoutubeMp3(
  youtubeId: string,
  title: string,
  cacheDir = CACHE_DIR,
): Promise<ParsedMp3> {
  const cached = await readCachedMp3(youtubeId, cacheDir);
  if (cached) return { ...cached, title: cleanSongTitle(title) };
  const [song] = await downloadYoutubeMp3s(youtubeWatchUrl(youtubeId), { limit: 1, cacheDir });
  if (!song || song.youtubeId !== youtubeId) throw new Error(`${cleanSongTitle(title)} did not come out as an MP3.`);
  return { ...song, title: cleanSongTitle(title) };
}
