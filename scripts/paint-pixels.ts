/**
 * Repaint every 16×16 icon from the source sprite: `npm run pixels`.
 * Transparent padding is cropped first so the creature fills the Yoto face.
 * Colour and shadow both keep a clear background, which is an unlit LED on the player.
 * The shadow is painted from the sprite alpha, not from the colour file.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { paintColourAndShadow } from "../src/lib/pixel-scale";
import { readPngRgba, shadowGrey } from "../src/lib/pixel-paint";

const SPRITES = path.join(process.cwd(), "public", "sprites");
const PIXELS = path.join(process.cwd(), "public", "pixels");

function occupiedRows(rgba: Uint8Array, size = 16): number {
  let rows = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (rgba[(y * size + x) * 4 + 3] === 255) {
        rows += 1;
        break;
      }
    }
  }
  return rows;
}

/** Every pixel is clear or solid. Shadow pixels are the grey for their row. */
function checkIcon(file: string, shadow: boolean): void {
  const decoded = readPngRgba(readFileSync(file));
  if (decoded.width !== 16 || decoded.height !== 16) throw new Error(`${file} is not 16×16.`);
  let lit = 0;
  for (let index = 0; index < decoded.rgba.length; index += 4) {
    const alpha = decoded.rgba[index + 3];
    if (alpha === 0) continue;
    if (alpha !== 255) throw new Error(`${file} has a half-clear pixel.`);
    lit += 1;
    if (!shadow) continue;
    const y = Math.floor(index / 4 / 16);
    const grey = shadowGrey(y);
    const [red = 0, green = 0, blue = 0] = decoded.rgba.subarray(index, index + 3);
    if (red !== green || green !== blue || Math.abs(red - grey) > 1) {
      throw new Error(`${file} row ${y} is not the shadow grey.`);
    }
  }
  if (lit === 0 || lit === 256) throw new Error(`${file} has no clear background or no creature.`);
}

const ids = readdirSync(SPRITES)
  .filter((name) => /^\d+\.png$/.test(name))
  .map((name) => name.replace(/\.png$/, ""))
  .sort((left, right) => Number(left) - Number(right));

async function paintOne(id: string): Promise<void> {
  await paintColourAndShadow(
    path.join(SPRITES, `${id}.png`),
    path.join(PIXELS, `${id}.png`),
    path.join(PIXELS, `${id}-shadow.png`),
  );
}

async function main(): Promise<void> {
  let cursor = 0;
  const missed: string[] = [];
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const id = ids[index];
      if (!id) return;
      try {
        await paintOne(id);
      } catch (error) {
        missed.push(id);
        console.error(id, error instanceof Error ? error.message : error);
      }
      if ((index + 1) % 100 === 0) console.log(`${index + 1} of ${ids.length}`);
    }
  }

  await Promise.all(Array.from({ length: 2 }, () => worker()));
  const leftover: string[] = [];
  for (const id of missed) {
    try {
      await paintOne(id);
    } catch (error) {
      leftover.push(id);
      console.error(id, error instanceof Error ? error.message : error);
    }
  }
  if (leftover.length > 0) {
    console.error(`${leftover.length} sprites failed.`);
    process.exit(1);
  }
  for (const id of ["1", "25", "640"]) {
    checkIcon(path.join(PIXELS, `${id}.png`), false);
    checkIcon(path.join(PIXELS, `${id}-shadow.png`), true);
  }
  const bulbasaur = readPngRgba(readFileSync(path.join(PIXELS, "1.png")));
  const rows = occupiedRows(bulbasaur.rgba);
  if (rows < 12) throw new Error(`Bulbasaur only fills ${rows} rows after the crop.`);
  console.log(`Painted ${ids.length} colour icons and ${ids.length} shadows.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
