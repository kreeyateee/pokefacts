import { inflateSync } from "node:zlib";

/** The Yoto face is a 16×16 matrix. */
export const YOTO_PIXEL_SIZE = 16;

export type ContentBox = { x: number; y: number; width: number; height: number };

const ALPHA_MIN = 16;

/**
 * Bounding box of pixels that are actually drawn, not canvas padding.
 * Transparent pixels are empty. A 1-pixel margin keeps anti-aliased edges.
 */
export function contentBounds(
  width: number,
  height: number,
  rgba: Uint8Array,
  margin = 1,
): ContentBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) < ALPHA_MIN) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(width - 1, maxX + margin);
  maxY = Math.min(height - 1, maxY + margin);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Crop to the creature, pad to a square so the shape is not stretched, then
 * scale to 16×16. Without the crop, a 96×96 sprite with a 35-pixel Pokémon
 * becomes about four LEDs tall.
 */
export function pixelFitFilter(box: ContentBox | null): string {
  const crop = box ? `crop=${box.width}:${box.height}:${box.x}:${box.y},` : "";
  return `format=rgba,${crop}pad=max(iw\\,ih):max(iw\\,ih):(ow-iw)/2:(oh-ih)/2:0x00000000,scale=${YOTO_PIXEL_SIZE}:${YOTO_PIXEL_SIZE}:flags=neighbor,format=rgba`;
}

/**
 * 16×16 icons for the dark Yoto screen, where a clear pixel is an unlit LED.
 * Colour icons keep the sprite colours and leave the background clear, so only the creature lights up.
 * Who's That shadows are a solid silhouette that fades from grey at the top to near-black at the bottom.
 * Pure black would be an unlit LED, so even the bottom row stays a little lit.
 * Both are taken from the sprite alpha, never from each other.
 */
export const SHADOW_TOP_GREY = 150;
export const SHADOW_BOTTOM_GREY = 40;

const IN_SHAPE = "gt(alpha(X,Y),0)";
const SOLID_OR_CLEAR = `a='if(${IN_SHAPE},255,0)'`;

/** The grey a shadow pixel gets on row `y` (0 at the top) of the 16×16 face. */
export function shadowGrey(y: number): number {
  const fade = (SHADOW_TOP_GREY - SHADOW_BOTTOM_GREY) / (YOTO_PIXEL_SIZE - 1);
  return Math.round(SHADOW_TOP_GREY - fade * y);
}

export const COLOUR_PIXEL_FILL =
  `geq=r='if(${IN_SHAPE},r(X,Y),0)':g='if(${IN_SHAPE},g(X,Y),0)':b='if(${IN_SHAPE},b(X,Y),0)':${SOLID_OR_CLEAR},format=rgba`;

const SHADOW_SHADE = `if(${IN_SHAPE},${SHADOW_TOP_GREY}-${SHADOW_TOP_GREY - SHADOW_BOTTOM_GREY}*Y/${YOTO_PIXEL_SIZE - 1},0)`;

export const SHADOW_PIXEL_FILL = `geq=r='${SHADOW_SHADE}':g='${SHADOW_SHADE}':b='${SHADOW_SHADE}':${SOLID_OR_CLEAR},format=rgba`;

export function colourPixelFilter(box: ContentBox | null = null): string {
  return `${pixelFitFilter(box)},${COLOUR_PIXEL_FILL}`;
}

export function shadowPixelFilter(box: ContentBox | null = null): string {
  return `${pixelFitFilter(box)},${SHADOW_PIXEL_FILL}`;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  if (upDistance <= diagonal) return up;
  return upLeft;
}

/** Decode a non-interlaced 8-bit RGBA PNG. Used to check painted icons. */
export function readPngRgba(bytes: Buffer): { width: number; height: number; rgba: Uint8Array } {
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) throw new Error("Not a PNG.");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (kind === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error("Only 8-bit non-interlaced RGBA PNGs can be checked.");
      }
    } else if (kind === "IDAT") {
      idat.push(data);
    } else if (kind === "IEND") {
      break;
    }
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = 4;
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * channels);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[cursor + x] ?? 0;
      const left = x >= channels ? rgba[y * stride + x - channels]! : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? rgba[(y - 1) * stride + x - channels]! : 0;
      let decoded = value;
      if (filter === 1) decoded = (value + left) & 255;
      else if (filter === 2) decoded = (value + up) & 255;
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) decoded = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unknown PNG filter ${filter}.`);
      rgba[y * stride + x] = decoded;
    }
    cursor += stride;
  }
  return { width, height, rgba };
}
