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

function dirHasTool(dir: string, tool: "ffmpeg" | "ffprobe"): boolean {
  return Boolean(dir) && existsSync(path.join(dir, exeName(tool)));
}

/** Directory that actually contains ffmpeg, ignoring a PATH entry whose folder was deleted. */
export function ffmpegBinDir(): string | null {
  const fromEnv = process.env.FFMPEG_BIN?.trim();
  if (fromEnv && dirHasTool(fromEnv, "ffmpeg")) return fromEnv;
  if (dirHasTool(WINGET_FFMPEG_902, "ffmpeg")) return WINGET_FFMPEG_902;
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (dirHasTool(dir, "ffmpeg")) return dir;
  }
  return null;
}

/** Put the working ffmpeg folder on PATH for this process, even when the shell PATH is stale. */
export function ensureFfmpegPath(): void {
  const dir = ffmpegBinDir();
  if (!dir) return;
  const current = process.env.PATH ?? "";
  const listed = current
    .split(path.delimiter)
    .some((entry) => entry.length > 0 && path.resolve(entry).toLowerCase() === path.resolve(dir).toLowerCase());
  if (!listed) {
    const next = `${dir}${path.delimiter}${current}`;
    process.env.PATH = next;
    if (process.platform === "win32") process.env.Path = next;
  }
}

function command(tool: "ffmpeg" | "ffprobe"): string {
  ensureFfmpegPath();
  const dir = ffmpegBinDir();
  if (!dir || !dirHasTool(dir, tool)) return tool;
  return path.join(dir, exeName(tool));
}

export function ffmpegCommand(): string {
  return command("ffmpeg");
}

export function ffprobeCommand(): string {
  return command("ffprobe");
}
