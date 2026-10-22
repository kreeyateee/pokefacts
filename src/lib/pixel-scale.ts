import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ffmpegCommand } from "./ffmpeg-bin";
import {
  COLOUR_PIXEL_FILL,
  SHADOW_PIXEL_FILL,
  colourPixelFilter,
  contentBounds,
  pixelFitFilter,
  readPngRgba,
  shadowPixelFilter,
  type ContentBox,
} from "./pixel-paint";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegCommand(), args, { timeout: 20_000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-pixel-"));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeWithRetry(file: string, bytes: Buffer): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await writeFile(file, bytes);
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    }
  }
  throw last;
}

/** Decode any PNG (indexed sprites included) to 8-bit RGBA. */
export async function readImageRgba(file: string): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  return withTempDir(async (dir) => {
    const rgbaFile = path.join(dir, "rgba.png");
    await runFfmpeg(["-y", "-loglevel", "error", "-i", file, "-vf", "format=rgba", "-frames:v", "1", rgbaFile]);
    return readPngRgba(await readFile(rgbaFile));
  });
}

export async function measureContentBox(file: string): Promise<ContentBox | null> {
  const image = await readImageRgba(file);
  return contentBounds(image.width, image.height, image.rgba);
}

async function paintToFile(output: string, work: (temp: string) => Promise<void>): Promise<void> {
  await withTempDir(async (dir) => {
    const temp = path.join(dir, "out.png");
    await work(temp);
    await writeWithRetry(output, await readFile(temp));
  });
}

export async function paintColourPixel(input: string, output: string, box?: ContentBox | null): Promise<void> {
  const crop = box === undefined ? await measureContentBox(input) : box;
  await paintToFile(output, (temp) =>
    runFfmpeg(["-y", "-loglevel", "error", "-i", input, "-vf", colourPixelFilter(crop), temp]),
  );
}

export async function paintShadowPixel(input: string, output: string, box?: ContentBox | null): Promise<void> {
  const crop = box === undefined ? await measureContentBox(input) : box;
  await paintToFile(output, (temp) =>
    runFfmpeg(["-y", "-loglevel", "error", "-i", input, "-vf", shadowPixelFilter(crop), temp]),
  );
}

/** One decode, then colour and shadow from the same crop. */
export async function paintColourAndShadow(input: string, colour: string, shadow: string): Promise<void> {
  const box = await measureContentBox(input);
  const fit = pixelFitFilter(box);
  const filter = `[0:v]${fit},split=2[base][sil];[base]${COLOUR_PIXEL_FILL}[colour];[sil]${SHADOW_PIXEL_FILL}[shadow]`;
  await withTempDir(async (dir) => {
    const colourTemp = path.join(dir, "colour.png");
    const shadowTemp = path.join(dir, "shadow.png");
    await runFfmpeg([
      "-y",
      "-loglevel",
      "error",
      "-i",
      input,
      "-filter_complex",
      filter,
      "-map",
      "[colour]",
      colourTemp,
      "-map",
      "[shadow]",
      shadowTemp,
    ]);
    await writeWithRetry(colour, await readFile(colourTemp));
    await writeWithRetry(shadow, await readFile(shadowTemp));
  });
}
