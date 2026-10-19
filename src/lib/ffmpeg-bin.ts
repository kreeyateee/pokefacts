import { existsSync } from "node:fs";
import path from "node:path";

/**
 * WinGet moved ffmpeg from 8.1.2 to 9.0.2 and left the old folder on PATH.
 * That folder is gone, so `ffmpeg` from a stale shell is not a real binary.
 */
const WINGET_FFMPEG_902 =
  "C:\\Users\\mjlan\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin";

function exeName(tool: "ffmpeg" | "ffprobe"): string {
  return process.platform === "win32" ? `${tool}.exe` : tool;
}

/** Keep turbopack from tracing the ffmpeg install. A full build is thousands of files. */
function toolPath(dir: string, tool: "ffmpeg" | "ffprobe"): string {
  return path.join(/* turbopackIgnore: true */ dir, exeName(tool));
}

function dirHasTool(dir: string, tool: "ffmpeg" | "ffprobe"): boolean {
  return Boolean(dir) && existsSync(toolPath(dir, tool));
}

function locateFfmpegBinDir(): string | null {
  const fromEnv = process.env.FFMPEG_BIN?.trim();
  if (fromEnv && dirHasTool(fromEnv, "ffmpeg")) return fromEnv;
  if (dirHasTool(WINGET_FFMPEG_902, "ffmpeg")) return WINGET_FFMPEG_902;
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (dirHasTool(dir, "ffmpeg")) return dir;
  }
  return null;
}

let locatedDir: string | null | undefined;
let locatedCommands: { ffmpeg: string; ffprobe: string } | undefined;

/** Directory that actually contains ffmpeg, ignoring a PATH entry whose folder was deleted. Resolved once. */
export function ffmpegBinDir(): string | null {
  if (locatedDir === undefined) locatedDir = locateFfmpegBinDir();
  return locatedDir;
}

/** Put the working ffmpeg folder on PATH for this process, even when the shell PATH is stale. */
export function ensureFfmpegPath(): void {
  const dir = ffmpegBinDir();
  if (!dir) return;
  const current = process.env.PATH ?? "";
  const wanted = path.resolve(/* turbopackIgnore: true */ dir).toLowerCase();
  const listed = current.split(path.delimiter).some((entry) => {
    if (!entry) return false;
    return path.resolve(/* turbopackIgnore: true */ entry).toLowerCase() === wanted;
  });
  if (!listed) {
    const next = `${dir}${path.delimiter}${current}`;
    process.env.PATH = next;
    if (process.platform === "win32") process.env.Path = next;
  }
}

function command(tool: "ffmpeg" | "ffprobe"): string {
  if (!locatedCommands) {
    ensureFfmpegPath();
    const dir = ffmpegBinDir();
    locatedCommands = {
      ffmpeg: dir && dirHasTool(dir, "ffmpeg") ? toolPath(dir, "ffmpeg") : "ffmpeg",
      ffprobe: dir && dirHasTool(dir, "ffprobe") ? toolPath(dir, "ffprobe") : "ffprobe",
    };
  }
  return locatedCommands[tool];
}

export function ffmpegCommand(): string {
  return command("ffmpeg");
}

export function ffprobeCommand(): string {
  return command("ffprobe");
}
