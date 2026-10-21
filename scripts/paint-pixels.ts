/**
 * Repaint every 16×16 icon from the source sprite.
 * Colour and shadow both get an opaque white background.
 * The shadow is painted from the sprite alpha, not from the colour file.
 */
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { ffmpegCommand } from "../src/lib/ffmpeg-bin";
import { COLOUR_PIXEL_FILTER, readPngRgba, SHADOW_PIXEL_FILTER } from "../src/lib/pixel-paint";

const SPRITES = path.join(process.cwd(), "public", "sprites");
const PIXELS = path.join(process.cwd(), "public", "pixels");

function paint(id: string): Promise<void> {
  const sprite = path.join(SPRITES, `${id}.png`);
  const colour = path.join(PIXELS, `${id}.png`);
  const shadow = path.join(PIXELS, `${id}-shadow.png`);
  const filter = `[0:v]scale=16:16:flags=neighbor,format=rgba,split=2[base][sil];[base]${COLOUR_PIXEL_FILTER.replace(/^scale=16:16:flags=neighbor,format=rgba,/, "")}[colour];[sil]${SHADOW_PIXEL_FILTER.replace(/^scale=16:16:flags=neighbor,format=rgba,/, "")}[shadow]`;
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        sprite,
        "-filter_complex",
        filter,
        "-map",
        "[colour]",
        colour,
        "-map",
        "[shadow]",
        shadow,
      ],
      { timeout: 20_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

function opaqueWhite(file: string, shadow: boolean): void {
  const decoded = readPngRgba(readFileSync(file));
  if (decoded.width !== 16 || decoded.height !== 16) throw new Error(`${file} is not 16×16.`);
  for (let index = 0; index < decoded.rgba.length; index += 4) {
    if (decoded.rgba[index + 3] !== 255) throw new Error(`${file} still has a clear pixel.`);
    if (!shadow) continue;
    const red = decoded.rgba[index];
    const green = decoded.rgba[index + 1];
    const blue = decoded.rgba[index + 2];
    const white = red === 255 && green === 255 && blue === 255;
    const ink = red === 28 && green === 28 && blue === 32;
    if (!white && !ink) throw new Error(`${file} has a pixel that is not white or the shadow ink.`);
  }
}

const ids = readdirSync(SPRITES)
  .filter((name) => /^\d+\.png$/.test(name))
  .map((name) => name.replace(/\.png$/, ""))
  .sort((left, right) => Number(left) - Number(right));

async function main(): Promise<void> {
  let cursor = 0;
  let failed = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const id = ids[index];
      if (!id) return;
      try {
        await paint(id);
      } catch (error) {
        failed += 1;
        console.error(id, error instanceof Error ? error.message : error);
      }
      if ((index + 1) % 100 === 0) console.log(`${index + 1} of ${ids.length}`);
    }
  }

  await Promise.all(Array.from({ length: 8 }, () => worker()));
  if (failed > 0) {
    console.error(`${failed} sprites failed.`);
    process.exit(1);
  }
  for (const id of ["1", "25", "640"]) {
    opaqueWhite(path.join(PIXELS, `${id}.png`), false);
    opaqueWhite(path.join(PIXELS, `${id}-shadow.png`), true);
  }
  console.log(`Painted ${ids.length} colour icons and ${ids.length} shadows.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
