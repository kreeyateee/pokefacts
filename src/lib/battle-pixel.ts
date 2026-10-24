import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ffmpegCommand } from "@/lib/ffmpeg-bin";

/**
 * A Pokémon's 16×16 icon as a little battle animation for the Yoto screen, looping while the track
 * plays: an idle bounce, then a wind-up and a lunge forward to attack. Other cards get a calm bob.
 * Made from the crisp pixel icon the cards already use, so it stays sharp on the player's LEDs.
 */

export const SIZE = 16;
/** Frames a second in the GIF. */
export const BATTLE_FPS = 10;

/** One 16×16 RGBA frame. */
export type Frame = Uint8Array;

/** The frame moved `dx` right and `dy` down, with clear pixels where it moved from. */
export function shifted(frame: Frame, dx: number, dy: number): Frame {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const fromX = x - dx;
      const fromY = y - dy;
      if (fromX < 0 || fromY < 0 || fromX >= SIZE || fromY >= SIZE) continue;
      const from = (fromY * SIZE + fromX) * 4;
      out.set(frame.subarray(from, from + 4), (y * SIZE + x) * 4);
    }
  }
  return out;
}

/**
 * A calm loop for cards that are not battles: the Pokémon just bobs gently on the spot now and then.
 */
export function idleFrames(icon: Frame): Frame[] {
  const up = shifted(icon, 0, -1);
  const hold = (frame: Frame, count: number) => Array.from({ length: count }, () => frame);
  return [...hold(icon, 12), ...hold(up, 4), ...hold(icon, 4), ...hold(up, 4), ...hold(icon, 6)];
}

/** The whole battle loop, about three seconds at BATTLE_FPS. */
export function battleFrames(icon: Frame): Frame[] {
  const still = icon;
  const up = shifted(icon, 0, -1);
  const hold = (frame: Frame, count: number) => Array.from({ length: count }, () => frame);
  return [
    // Ready: a bounce on the spot.
    ...hold(still, 3),
    ...hold(up, 3),
    ...hold(still, 3),
    ...hold(up, 3),
    // Attack: a wind-up, a quick lunge forward, and back. It never flashes as if hit: it's the one attacking.
    ...hold(shifted(icon, -1, 0), 2),
    shifted(icon, 1, 0),
    ...hold(shifted(icon, 2, 0), 2),
    shifted(icon, 1, 0),
    ...hold(still, 8),
  ];
}

/** Runs ffmpeg with `input` on stdin and returns what it writes to stdout. */
function ffmpeg(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegCommand(), args, { windowsHide: true });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg could not make the picture: ${Buffer.concat(errors).toString().slice(-200)}`));
    });
    child.stdin.end(input);
  });
}

/** The icon PNG as raw 16×16 RGBA. */
async function decodeIcon(png: Buffer): Promise<Frame> {
  const raw = await ffmpeg(
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vf", `scale=${SIZE}:${SIZE}:flags=neighbor`, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
    png,
  );
  if (raw.length !== SIZE * SIZE * 4) throw new Error("The icon is not 16 by 16.");
  return new Uint8Array(raw);
}

/**
 * Clear pixels made black. Yoto ignores GIF transparency and lights up the hidden "clear" colour
 * (bright green), but a black pixel is an LED left off, so black looks clear on the player.
 */
export function onBlack(frame: Frame): Frame {
  const out = new Uint8Array(frame);
  for (let at = 0; at < out.length; at += 4) {
    if ((out[at + 3] ?? 0) < 128) out.set([0, 0, 0, 255], at);
    else out[at + 3] = 255;
  }
  return out;
}

/** Frames as a looping GIF on black, as Yoto takes it with autoConvert off. */
async function encodeGif(frames: Frame[]): Promise<Buffer> {
  return ffmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${SIZE}x${SIZE}`,
      "-r",
      String(BATTLE_FPS),
      "-i",
      "pipe:0",
      "-vf",
      "split[a][b];[a]palettegen=max_colors=32:reserve_transparent=0:stats_mode=full[p];[b][p]paletteuse=dither=none",
      "-loop",
      "0",
      "-f",
      "gif",
      "pipe:1",
    ],
    Buffer.concat(frames.map((frame) => Buffer.from(onBlack(frame)))),
  );
}

/** v2: on black. The first ones were clear, which Yoto shows as bright green. */
const CACHE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "animated-pixels-v2");
const making = new Map<string, Promise<Buffer>>();

export type PixelMotion = "battle" | "idle";

/** A species' animated icon, made from its pixel icon once and kept: a battle loop, or a calm bob. */
export function ensureBattlePixel(id: number, cacheDir = CACHE, motion: PixelMotion = "battle"): Promise<Buffer> {
  if (!Number.isInteger(id) || id < 1 || id > 1025) return Promise.reject(new Error("That is not a national Pokédex number."));
  const key = `${motion}:${cacheDir}:${id}`;
  let job = making.get(key);
  if (!job) {
    job = (async () => {
      const file = path.join(/* turbopackIgnore: true */ cacheDir, `${motion}-${id}.gif`);
      try {
        const cached = await readFile(file);
        if (cached.subarray(0, 4).toString("ascii") === "GIF8") return cached;
      } catch {
        // Not made yet.
      }
      const icon = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "public", "pixels", `${id}.png`));
      const frames = motion === "battle" ? battleFrames : idleFrames;
      const gif = await encodeGif(frames(await decodeIcon(icon)));
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, gif);
      return gif;
    })().finally(() => making.delete(key));
    making.set(key, job);
  }
  return job;
}
