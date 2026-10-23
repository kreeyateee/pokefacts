import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ffmpegCommand, ffprobeCommand } from "@/lib/ffmpeg-bin";
import {
  clampMix,
  DEFAULT_CRY_VOLUME,
  type MixSettings,
} from "@/lib/playback-settings";

/** Latest PokéAPI cry. The fact track plays this before Lily speaks. */
export function cryUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
}

/**
 * Container of a downloaded cry. The URL always ends in `.ogg`, but Pikachu (25),
 * Meltan (808), and Melmetal (809) are MPEG frames. An HTML error page is neither.
 */
export function audioContainer(bytes: Buffer): "ogg" | "mp3" | null {
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") return "mp3";
  if (bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

/** Ogg, MP3, M4A, or a Piper WAV. Cries stay on audioContainer so a WAV is not treated as a cry. */
export function inputContainer(bytes: Buffer): "ogg" | "mp3" | "wav" | "m4a" | null {
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
    return "wav";
  }
  if (isM4a(bytes)) return "m4a";
  return audioContainer(bytes);
}

/** ISO BMFF audio the user already has. ffmpeg reads it as mp4 and encodeYotoMp3 writes the Yoto MP3. */
function isM4a(bytes: Buffer): boolean {
  if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = bytes.toString("ascii", 8, 12);
  return brand === "M4A " || brand === "M4B " || brand === "mp41" || brand === "mp42" || brand === "isom" || brand === "dash";
}

/** Cry gain when none is passed. The rendered-file cache key includes it, the pause, and voice gain. */
const CRY_MIX_VOLUME = DEFAULT_CRY_VOLUME;

/** Cry at the front, then speech. Voice gain is omitted at 1 so the default mix stays the old filter. */
function mergeFilter(mix: MixSettings = clampMix(null)): string {
  const voice = mix.voiceVolume === 1 ? "" : `volume=${mix.voiceVolume},`;
  return (
    `[0:a]volume=${mix.cryVolume},apad=pad_dur=${mix.pauseSeconds},aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[a0];` +
    `[1:a]${voice}aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[a1];` +
    "[a0][a1]concat=n=2:v=0:a=1[out]"
  );
}

/**
 * Plain CBR MP3. Yoto's transcoder rejects the VBR file `-q:a` writes
 * (Xing header, ID3 encoder tag, about 48 kb/s). No cover art and no video stream.
 */
export const YOTO_MP3_ARGS: readonly string[] = [
  "-vn",
  "-map_metadata",
  "-1",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "128k",
  "-ar",
  "44100",
  "-ac",
  "1",
  "-id3v2_version",
  "0",
  "-write_id3v1",
  "0",
];

const MIN_MERGED_SECONDS = 1;
const MIN_CRY_SECONDS = 0.05;

function commandFailure(command: string, error: Error, stderr: string): Error {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tail = lines.at(-1) ?? "";
  const code = (error as NodeJS.ErrnoException).code;
  const killed = (error as { killed?: boolean }).killed === true;
  let reason = tail;
  if (!reason) {
    if (code === "ENOENT") reason = `${command} was not found.`;
    else if (killed || code === "ETIMEDOUT") reason = `${command} timed out.`;
    else reason = code ? `${command} failed (${code}).` : `${command} failed.`;
  }
  const wrapped = new Error(reason);
  (wrapped as Error & { stderr?: string }).stderr = stderr;
  return wrapped;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 60_000, windowsHide: true }, (error, _stdout, stderr) => {
      if (!error) {
        resolve();
        return;
      }
      reject(commandFailure(command, error, stderr ?? ""));
    });
  });
}

/** Tell ffmpeg the real container. A `.ogg` path makes Windows open MP3 cries as Ogg. */
function formatArgs(bytes: Buffer): string[] {
  const container = inputContainer(bytes);
  if (!container) return [];
  if (container === "m4a") return ["-f", "mp4"];
  return ["-f", container];
}

function inputArgs(bytes: Buffer, file: string): string[] {
  return [...formatArgs(bytes), "-i", file];
}

type ClipInfo = {
  codec: string;
  sampleRate: number;
  channels: number;
  duration: number;
  bitRate: number;
  audioStreams: number;
  otherStreams: number;
};

function clipSummary(info: ClipInfo): string {
  const seconds = Number.isFinite(info.duration) ? `${info.duration.toFixed(2)}s` : "unknown length";
  const rate = info.sampleRate ? `${info.sampleRate} Hz` : "unknown rate";
  const kbps = info.bitRate ? `${Math.round(info.bitRate / 1000)} kb/s` : "unknown bitrate";
  return `${info.codec || "unknown codec"}, ${rate}, ${info.channels || 0} ch, ${kbps}, ${seconds}`;
}

/** ffprobe the bytes. A failure uses ffprobe's own last line, not a generic mix error. */
export async function describeClip(bytes: Buffer, name = "clip.mp3"): Promise<ClipInfo> {
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-probe-"));
  const file = path.join(/* turbopackIgnore: true */ dir, name);
  try {
    await writeFile(file, bytes);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        ffprobeCommand(),
        ["-v", "error", "-print_format", "json", ...formatArgs(bytes), "-show_streams", "-show_format", file],
        { timeout: 20_000, windowsHide: true, maxBuffer: 1_000_000 },
        (error, text, stderr) => {
          if (error) {
            reject(commandFailure("ffprobe", error, stderr ?? ""));
            return;
          }
          resolve(text);
        },
      );
    });
    let parsed: {
      streams?: Array<{ codec_name?: string; codec_type?: string; sample_rate?: string; channels?: number; bit_rate?: string; duration?: string }>;
      format?: { duration?: string; bit_rate?: string };
    };
    try {
      parsed = JSON.parse(stdout) as typeof parsed;
    } catch {
      throw new Error("ffprobe did not describe the audio.");
    }
    const streams = parsed.streams ?? [];
    const audio = streams.find((stream) => stream.codec_type === "audio");
    const duration = Number(audio?.duration ?? parsed.format?.duration);
    const bitRate = Number(audio?.bit_rate || parsed.format?.bit_rate || 0);
    return {
      codec: audio?.codec_name ?? "",
      sampleRate: Number(audio?.sample_rate ?? 0),
      channels: Number(audio?.channels ?? 0),
      duration: Number.isFinite(duration) ? duration : Number.NaN,
      bitRate: Number.isFinite(bitRate) ? bitRate : 0,
      audioStreams: streams.filter((stream) => stream.codec_type === "audio").length,
      otherStreams: streams.filter((stream) => stream.codec_type && stream.codec_type !== "audio").length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertCryDecodable(info: ClipInfo): void {
  if (info.audioStreams < 1 || !info.codec) {
    throw new Error(`ffprobe found no audio in the cry (${clipSummary(info)}).`);
  }
  if (!Number.isFinite(info.duration) || info.duration < MIN_CRY_SECONDS) {
    throw new Error(`ffprobe: the cry is too short to mix (${clipSummary(info)}).`);
  }
}

/** True when the bytes are the plain MP3 Yoto accepts, not a VBR file wearing an .mp3 name. */
export function isPlainYotoMp3(bytes: Buffer, info: ClipInfo): boolean {
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") return false;
  if (info.otherStreams > 0 || info.audioStreams !== 1) return false;
  return (
    info.codec === "mp3" &&
    info.sampleRate === 44100 &&
    info.channels === 1 &&
    info.bitRate >= 120_000 &&
    info.bitRate <= 140_000 &&
    info.duration >= MIN_MERGED_SECONDS
  );
}

function assertYotoMp3(bytes: Buffer, info: ClipInfo): void {
  const summary = clipSummary(info);
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") {
    throw new Error(`ffprobe: the merged file still has an ID3 tag (${summary}).`);
  }
  if (info.otherStreams > 0 || info.audioStreams !== 1) {
    throw new Error(`ffprobe: the merged file is not a single audio stream (${summary}).`);
  }
  if (!isPlainYotoMp3(bytes, info)) {
    throw new Error(`ffprobe: the merged file is not a plain 44.1 kHz mono 128 kb/s MP3 (${summary}).`);
  }
}

/** Convert one audio file to the plain MP3. `ffmpegFormat` is the real container, such as webm or mp4. */
export async function transcodeToYotoMp3(bytes: Buffer, ffmpegFormat?: string): Promise<Buffer> {
  if (ffmpegFormat && !/^[a-z0-9_]+$/.test(ffmpegFormat)) {
    throw new Error("That audio format cannot be converted.");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-yoto-mp3-"));
  const inPath = path.join(/* turbopackIgnore: true */ dir, `in.${ffmpegFormat || "bin"}`);
  const outPath = path.join(/* turbopackIgnore: true */ dir, "out.mp3");
  try {
    await writeFile(inPath, bytes);
    await run(ffmpegCommand(), [
      "-y",
      "-loglevel",
      "error",
      ...(ffmpegFormat ? ["-f", ffmpegFormat] : []),
      "-i",
      inPath,
      ...YOTO_MP3_ARGS,
      outPath,
    ]);
    const mp3 = await readFile(outPath);
    assertYotoMp3(mp3, await describeClip(mp3, "out.mp3"));
    return mp3;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** One clip, already the plain 128 kb/s MP3 Yoto accepts. Used when a line has no cry. */
export async function encodeYotoMp3(speech: Buffer): Promise<Buffer> {
  const kind = inputContainer(speech);
  if (!kind) throw new Error("The recording was not playable audio.");
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-speech-"));
  const inPath = path.join(/* turbopackIgnore: true */ dir, `speech.${kind}`);
  const outPath = path.join(/* turbopackIgnore: true */ dir, "speech.mp3");
  try {
    await writeFile(inPath, speech);
    await run(ffmpegCommand(), [
      "-y",
      "-loglevel",
      "error",
      ...inputArgs(speech, inPath),
      ...YOTO_MP3_ARGS,
      outPath,
    ]);
    const mp3 = await readFile(outPath);
    assertYotoMp3(mp3, await describeClip(mp3, "speech.mp3"));
    return mp3;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function mergeCryFirst(
  cry: Buffer,
  speech: Buffer,
  mix: MixSettings = clampMix(null),
): Promise<Buffer> {
  const cryKind = audioContainer(cry);
  if (!cryKind) throw new Error("The cry was not an Ogg or MP3 file.");
  const speechKind = inputContainer(speech);
  assertCryDecodable(await describeClip(cry, `cry.${cryKind}`));
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-cry-"));
  const cryPath = path.join(/* turbopackIgnore: true */ dir, `cry.${cryKind}`);
  const speechPath = path.join(/* turbopackIgnore: true */ dir, `speech.${speechKind ?? "mp3"}`);
  const outPath = path.join(/* turbopackIgnore: true */ dir, "merged.mp3");
  try {
    await writeFile(cryPath, cry);
    await writeFile(speechPath, speech);
    await run(ffmpegCommand(), [
      "-y",
      "-loglevel",
      "error",
      ...inputArgs(cry, cryPath),
      ...inputArgs(speech, speechPath),
      "-filter_complex",
      mergeFilter(mix),
      "-map",
      "[out]",
      ...YOTO_MP3_ARGS,
      outPath,
    ]);
    const merged = await readFile(outPath);
    assertYotoMp3(merged, await describeClip(merged, "merged.mp3"));
    return merged;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function audioDurationSeconds(bytes: Buffer, name = "clip.mp3"): Promise<number> {
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-audio-"));
  const file = path.join(/* turbopackIgnore: true */ dir, name);
  try {
    await writeFile(file, bytes);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        ffprobeCommand(),
        ["-v", "error", ...formatArgs(bytes), "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
        { timeout: 20_000, windowsHide: true },
        (error, text, stderr) => {
          if (error) {
            reject(commandFailure("ffprobe", error, stderr ?? ""));
            return;
          }
          resolve(text);
        },
      );
    });
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration)) throw new Error("Could not read the audio length.");
    return duration;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function pcm(bytes: Buffer, name: string, filter?: string): Promise<Int16Array> {
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-pcm-"));
  const file = path.join(/* turbopackIgnore: true */ dir, name);
  const rawPath = path.join(/* turbopackIgnore: true */ dir, "audio.raw");
  try {
    await writeFile(file, bytes);
    const args = ["-y", "-v", "error", ...inputArgs(bytes, file)];
    if (filter) args.push("-af", filter);
    args.push("-f", "s16le", "-ac", "1", "-ar", "44100", rawPath);
    await run(ffmpegCommand(), args);
    const raw = await readFile(rawPath);
    const samples = new Int16Array(Math.floor(raw.byteLength / 2));
    for (let index = 0; index < samples.length; index += 1) samples[index] = raw.readInt16LE(index * 2);
    return samples;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function meanGap(left: Int16Array, right: Int16Array, offset: number, count: number): number {
  let gap = 0;
  for (let index = 0; index < count; index += 1) {
    gap += Math.abs((left[index] ?? 0) - (right[offset + index] ?? 0));
  }
  return gap / count;
}

/**
 * The merged file starts with the amplified cry, not the spoken fact.
 * MP3 cries (Pikachu, Meltan, Melmetal) are re-encoded, so the match is
 * looser than a sample-perfect copy and may sit a few dozen milliseconds late.
 */
export async function cryLeads(
  cry: Buffer,
  speech: Buffer,
  merged: Buffer,
  cryVolume: number = CRY_MIX_VOLUME,
): Promise<boolean> {
  const cryName = `cry.${audioContainer(cry) ?? "bin"}`;
  const speechName = `speech.${audioContainer(speech) ?? "bin"}`;
  const [loud, spoken, mix] = await Promise.all([
    pcm(cry, cryName, `volume=${cryVolume},aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono`),
    pcm(speech, speechName),
    pcm(merged, "merged.mp3"),
  ]);
  const window = Math.min(loud.length, spoken.length, mix.length, 8_000);
  if (window < 1000) return false;
  let bestCry = Number.POSITIVE_INFINITY;
  const shiftLimit = Math.min(2_400, Math.max(0, mix.length - window));
  for (let offset = 0; offset <= shiftLimit; offset += 80) {
    const score = meanGap(loud, mix, offset, window);
    if (score < bestCry) bestCry = score;
  }
  const speechScore = meanGap(spoken, mix, 0, window);
  return bestCry * 2 < speechScore;
}

/** Reject a file that is only Lily. The cry has to add audible time at the front. */
export async function assertCryFirst(
  cry: Buffer,
  speech: Buffer,
  merged: Buffer,
  cryVolume: number = CRY_MIX_VOLUME,
): Promise<void> {
  if (!(await cryLeads(cry, speech, merged, cryVolume))) {
    throw new Error("The merged audio did not start with the cry.");
  }
  const cryKind = audioContainer(cry) ?? "bin";
  const speechKind = audioContainer(speech) ?? "bin";
  const [crySeconds, speechSeconds, mergedSeconds] = await Promise.all([
    audioDurationSeconds(cry, `cry.${cryKind}`),
    audioDurationSeconds(speech, `speech.${speechKind}`),
    audioDurationSeconds(merged, "merged.mp3"),
  ]);
  const minimum = Math.min(Math.max(crySeconds * 0.5, 0.2), 1);
  if (mergedSeconds + 0.1 < speechSeconds + minimum) {
    throw new Error("The merged audio was not longer than Lily's voice.");
  }
}
