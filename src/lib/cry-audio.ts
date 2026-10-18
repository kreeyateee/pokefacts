import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** Latest PokéAPI cry. The fact track plays this before Lily speaks. */
export function cryUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
}

/**
 * Cry at the front, then speech.
 * Volume 4 and a short pad match the mix already used for these cards.
 */
const MERGE_FILTER =
  "[0:a]volume=4,apad=pad_dur=0.35,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[a0];" +
  "[1:a]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[a1];" +
  "[a0][a1]concat=n=2:v=0:a=1[out]";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 60_000 }, (error) => (error ? reject(error) : resolve()));
  });
}

export async function mergeCryFirst(cry: Buffer, speech: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "champdex-cry-"));
  const cryPath = path.join(dir, "cry.ogg");
  const speechPath = path.join(dir, "speech.mp3");
  const outPath = path.join(dir, "merged.mp3");
  try {
    await writeFile(cryPath, cry);
    await writeFile(speechPath, speech);
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      cryPath,
      "-i",
      speechPath,
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
  const file = path.join(dir, name);
  try {
    await writeFile(file, bytes);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
        { timeout: 20_000 },
        (error, text) => (error ? reject(error) : resolve(text)),
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
    const args = ["-y", "-v", "error", "-i", file];
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
