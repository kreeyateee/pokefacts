import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureArtwork, isPng } from "@/lib/artwork";
import { paintColourPixel } from "@/lib/pixel-scale";

const FORM_PIXEL_CACHE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "form-pixels", "crop");

type FormPixelOptions = {
  cacheDir?: string;
  /** Official artwork bytes. When omitted, the shared artwork cache is used. */
  artwork?: Buffer;
  fetchImpl?: typeof fetch;
};

/**
 * 16×16 Yoto icon painted from this form's official artwork.
 * The species pixel in public/pixels is a different picture.
 */
export async function ensureFormPixel(formId: number, options: FormPixelOptions = {}): Promise<Buffer> {
  if (!Number.isInteger(formId) || formId < 1 || formId > 20_000) {
    throw new Error(`That picture is not a form icon (${formId}).`);
  }
  const cacheDir = options.cacheDir ?? FORM_PIXEL_CACHE;
  await mkdir(cacheDir, { recursive: true });
  const file = path.join(/* turbopackIgnore: true */ cacheDir, `${formId}.png`);
  try {
    const cached = await readFile(file);
    if (isPng(cached)) return cached;
  } catch {
    // Missing cache is painted below.
  }
  const artwork = options.artwork ?? (await ensureArtwork(formId, options.fetchImpl));
  if (!isPng(artwork)) throw new Error(`That picture is not a form icon (${formId}).`);
  const source = path.join(/* turbopackIgnore: true */ cacheDir, `${formId}.source.png`);
  await writeFile(source, artwork);
  try {
    await paintColourPixel(source, file);
  } finally {
    await rm(source, { force: true });
  }
  const painted = await readFile(file);
  if (!isPng(painted)) throw new Error(`That picture is not a form icon (${formId}).`);
  return painted;
}
