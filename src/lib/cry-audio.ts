import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

/**
 * Cry at the front, then speech.
 * Volume 4 and a short pad match the mix already used for these cards.
 */
const MERGE_FILTER =
  "[0:a]volume=4,apad=pad_dur=0.35,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[a0];" +
  "[1:a]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[a1];" +
  "[a0][a1]concat=n=2:v=0:a=1[out]";

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
  const container = audioContainer(bytes);
  return container ? ["-f", container] : [];
}

function inputArgs(bytes: Buffer, file: string): string[] {
  return [...formatArgs(bytes), "-i", file];
}

export async function mergeCryFirst(cry: Buffer, speech: Buffer): Promise<Buffer> {
  const cryKind = audioContainer(cry);
  if (!cryKind) throw new Error("The cry was not an Ogg or MP3 file.");
  const speechKind = audioContainer(speech);
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-cry-"));
  const cryPath = path.join(dir, `cry.${cryKind}`);
  const speechPath = path.join(dir, `speech.${speechKind ?? "mp3"}`);
  const outPath = path.join(dir, "merged.mp3");
  try {
    await writeFile(cryPath, cry);
    await writeFile(speechPath, speech);
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      ...inputArgs(cry, cryPath),
      ...inputArgs(speech, speechPath),
      "-filter_complex",
      MERGE_FILTER,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "5",
      outPath,
    ]);
    return await readFile(outPath);
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
        "ffprobe",
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
  const file = path.join(dir, name);
  const rawPath = path.join(dir, "audio.raw");
  try {
    await writeFile(file, bytes);
    const args = ["-y", "-v", "error", ...inputArgs(bytes, file)];
    if (filter) args.push("-af", filter);
    args.push("-f", "s16le", "-ac", "1", "-ar", "44100", rawPath);
    await run("ffmpeg", args);
    const raw = await readFile(rawPath);
    const samples = new Int16Array(Math.floor(raw.byteLength / 2));
    for (let index = 0; index < samples.length; index += 1) samples[index] = raw.readInt16LE(index * 2);
    return samples;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The merged file starts with the amplified cry, not the spoken fact. */
export async function cryLeads(cry: Buffer, speech: Buffer, merged: Buffer): Promise<boolean> {
  const [loud, spoken, mix] = await Promise.all([
    pcm(cry, "cry.ogg", "volume=4,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono"),
    pcm(speech, "speech.mp3"),
    pcm(merged, "merged.mp3"),
  ]);
  const count = Math.min(loud.length, spoken.length, mix.length, 8_000);
  if (count < 1000) return false;
  let cryGap = 0;
  let speechGap = 0;
  for (let index = 0; index < count; index += 1) {
    cryGap += Math.abs((loud[index] ?? 0) - (mix[index] ?? 0));
    speechGap += Math.abs((spoken[index] ?? 0) - (mix[index] ?? 0));
  }
  return cryGap * 4 < speechGap;
}
