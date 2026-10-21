import { execFile, spawnSync } from "node:child_process";
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

export type YtdlpLaunch = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  packaged: boolean;
  python: boolean;
  deno: string | null;
};

/** Deno binary packaged for this app. yt-dlp does not search PATH for it. */
export function packagedDenoPath(root = process.cwd()): string {
  const name = process.platform === "win32" ? "deno.exe" : "deno";
  return path.join(/* turbopackIgnore: true */ root, "vendor", "deno", name);
}

function attachDeno(
  args: string[],
  root: string,
  exists: (file: string) => boolean,
  env: NodeJS.ProcessEnv,
): { args: string[]; deno: string | null } {
  const deno = packagedDenoPath(root);
  if (!exists(deno)) return { args, deno: null };
  env.DENO_DIR = path.join(root, "vendor", "deno", "cache");
  env.DENO_NO_UPDATE_CHECK = "1";
  return { args: [...args, "--js-runtimes", `deno:${deno}`], deno };
}

type PythonLauncher = { command: string; prefix: string[] };

let cachedPython: PythonLauncher | null | undefined;

export function detectPython(): PythonLauncher | null {
  if (cachedPython !== undefined) return cachedPython;
  const candidates: PythonLauncher[] =
    process.platform === "win32"
      ? [
          { command: "py", prefix: ["-3"] },
          { command: "python", prefix: [] },
          { command: "python3", prefix: [] },
        ]
      : [
          { command: "python3", prefix: [] },
          { command: "python", prefix: [] },
        ];
  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [...candidate.prefix, "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"],
      { windowsHide: true, timeout: 8_000 },
    );
    if (result.status === 0) {
      cachedPython = candidate;
      return candidate;
    }
  }
  cachedPython = null;
  return null;
}

/**
 * Prefer the yt-dlp installed in vendor/yt-dlp. That folder is the pip package
 * and its files, so a global `pip install yt-dlp` is not required.
 */
export function ytdlpLaunch(input?: {
  root?: string;
  python?: PythonLauncher | null;
  exists?: (file: string) => boolean;
  envCommand?: string;
  homeBin?: string;
  baseEnv?: NodeJS.ProcessEnv;
}): YtdlpLaunch {
  const exists = input?.exists ?? existsSync;
  const root = input?.root ?? process.cwd();
  const vendor = path.join(/* turbopackIgnore: true */ root, "vendor", "yt-dlp");
  const packaged = exists(path.join(/* turbopackIgnore: true */ vendor, "yt_dlp", "__main__.py"));
  const python = input && "python" in input ? (input.python ?? null) : detectPython();
  const env = { ...(input?.baseEnv ?? process.env) };
  const runtime = attachDeno([], root, exists, env);
  if (packaged && python) {
    const current = env.PYTHONPATH ?? "";
    env.PYTHONPATH = current ? `${vendor}${path.delimiter}${current}` : vendor;
    return {
      command: python.command,
      args: [...python.prefix, "-m", "yt_dlp", ...runtime.args],
      env,
      packaged: true,
      python: true,
      deno: runtime.deno,
    };
  }
  const fromEnv = (input && "envCommand" in input ? input.envCommand : env.YT_DLP)?.trim();
  if (fromEnv && exists(fromEnv)) {
    return { command: fromEnv, args: runtime.args, env, packaged, python: Boolean(python), deno: runtime.deno };
  }
  const homeBin =
    input?.homeBin ??
    path.join(homedir(), ".local", "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  if (exists(homeBin)) {
    return { command: homeBin, args: runtime.args, env, packaged, python: Boolean(python), deno: runtime.deno };
  }
  return {
    command: process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
    args: runtime.args,
    env,
    packaged,
    python: Boolean(python),
    deno: runtime.deno,
  };
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

function clipReason(reason: string): string {
  return reason.length > 240 ? `${reason.slice(0, 237)}...` : reason;
}

function textLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function errorLine(text: string): string {
  const line = [...textLines(text)].reverse().find((item) => /^ERROR:/i.test(item)) ?? "";
  return line.replace(/^ERROR:\s*/i, "");
}

/**
 * The sentence shown when yt-dlp exits with a real failure.
 * An empty stderr used to hide the stdout line and become a generic message.
 */
export function explainYtdlpFailure(
  stderr: string,
  stdout: string,
  outcome?: { killed?: boolean; timedOut?: boolean },
): string {
  const reason = errorLine(stderr) || errorLine(stdout) || textLines(stderr).at(-1) || "";
  if (/sign in to confirm|not a bot/i.test(reason)) {
    return "YouTube asked for a sign-in, so this audio could not be saved as an MP3.";
  }
  if (reason) return clipReason(reason);
  if (outcome?.killed || outcome?.timedOut) return "yt-dlp timed out.";
  return "yt-dlp could not download that audio.";
}

/**
 * `--max-downloads` stops yt-dlp with exit 101 after the file is already written.
 * That stop is stdout text, not an error, and the MP3 is usable.
 */
export function ytdlpStoppedAfterLimit(status: number | null, stdout: string, stderr: string): boolean {
  if (status !== 101) return false;
  return /Aborting remaining downloads|Maximum number of downloads reached/i.test(`${stdout}\n${stderr}`);
}

function ytdlpFailure(error: Error, stderr: string, stdout: string): Error {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    return new Error(
      ytdlpLaunch().packaged
        ? "Python 3 is needed to run the packaged yt-dlp."
        : "yt-dlp was not found. Run npm run ytdlp, then try again.",
    );
  }
  const killed = (error as { killed?: boolean }).killed === true;
  return new Error(explainYtdlpFailure(stderr, stdout, { killed, timedOut: killed || code === "ETIMEDOUT" }));
}

export function ytdlpOutput(args: string[], timeoutMs: number): Promise<string> {
  const launch = ytdlpLaunch();
  if (launch.packaged && !launch.python) {
    return Promise.reject(new Error("Python 3 is needed to run the packaged yt-dlp."));
  }
  if (launch.packaged && !launch.deno) {
    return Promise.reject(new Error("The packaged Deno runtime was not found in vendor/deno."));
  }
  ensureFfmpegPath();
  return new Promise((resolve, reject) => {
    execFile(
      launch.command,
      [...launch.args, ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4_000_000, env: launch.env },
      (error, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : "";
        const err = typeof stderr === "string" ? stderr : "";
        const rawCode = error && typeof error === "object" && "code" in error ? error.code : null;
        const status = typeof rawCode === "number" ? rawCode : null;
        if (error && !ytdlpStoppedAfterLimit(status, out, err)) {
          reject(ytdlpFailure(error, err, out));
          return;
        }
        resolve(out);
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

/** Audio the browser already fetched. This does not contact YouTube. */
export async function mp3FromUploadedAudio(bytes: Buffer, youtubeId: string, title: string): Promise<ParsedMp3> {
  if (!isYoutubeVideoId(youtubeId)) throw new Error("That YouTube video id does not look right.");
  const ready = await parseDownloadedAudio(bytes);
  const parsed = await plainMp3(ready);
  const name = cleanSongTitle(title);
  if (!parsed) throw new Error(`${name} did not come out as an MP3.`);
  return { ...parsed, youtubeId, title: name, bytes: ready };
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
  const stdout = await ytdlpOutput(["--flat-playlist", "--no-warnings", "--print", "%(id)s", url], 60_000);
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
    const stdout = await ytdlpOutput(args, timeout);
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
