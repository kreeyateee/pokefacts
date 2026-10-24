/**
 * Colouring sheets: a Pokémon's artwork turned into black outlines on white paper. The lines come from
 * three places: the edge of the picture (its outline), the artwork's own dark line work, and strong
 * changes of colour inside it (where one patch of colour meets another). Specks are cleared and lines
 * thickened so a child can colour up to them. Works on raw RGBA pixels, so it runs in the browser on a
 * canvas and in tests on plain arrays.
 */

export type LineArtOptions = {
  /** Brightness below which the artwork's own line work becomes a line (0 to 255). */
  darkLine: number;
  /** How strong a change of colour must be to draw a line between two patches. */
  colourEdge: number;
  /** How many pixels to thicken each line by, on each side. */
  thicken: number;
};

export const LINE_ART: LineArtOptions = { darkLine: 70, colourEdge: 110, thicken: 1 };

/** Brightness of a pixel laid on white, 0 (black) to 255 (white). */
function brightnessOnWhite(rgba: Uint8ClampedArray, index: number): number {
  const alpha = (rgba[index + 3] ?? 0) / 255;
  const r = (rgba[index] ?? 0) * alpha + 255 * (1 - alpha);
  const g = (rgba[index + 1] ?? 0) * alpha + 255 * (1 - alpha);
  const b = (rgba[index + 2] ?? 0) * alpha + 255 * (1 - alpha);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** How different two pixels' colours are, laid on white: 0 the same, up to about 441. */
function colourDistance(rgba: Uint8ClampedArray, a: number, b: number): number {
  const channel = (index: number, offset: number) => {
    const alpha = (rgba[index + 3] ?? 0) / 255;
    return (rgba[index + offset] ?? 0) * alpha + 255 * (1 - alpha);
  };
  const dr = channel(a, 0) - channel(b, 0);
  const dg = channel(a, 1) - channel(b, 1);
  const db = channel(a, 2) - channel(b, 2);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Where the lines go: 1 for a line pixel, 0 for paper. `width` × `height` RGBA in, one byte a pixel out.
 */
export function lineMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: LineArtOptions = LINE_ART,
): Uint8Array {
  const raw = new Uint8Array(width * height);
  const solid = (x: number, y: number) => (rgba[(y * width + x) * 4 + 3] ?? 0) >= 128;
  const darkAt = new Uint8Array(width * height);
  for (let at = 0; at < darkAt.length; at += 1) {
    darkAt[at] = (rgba[at * 4 + 3] ?? 0) >= 128 && brightnessOnWhite(rgba, at * 4) < options.darkLine ? 1 : 0;
  }
  // A dark patch wider than a line (an ear tip, the inside of a wing) keeps only its edge, so it can be
  // coloured in rather than printed solid black.
  // Anything up to about 1% of the picture across counts as a line, so thick vector strokes stay solid.
  const DARK_EDGE = Math.max(2, Math.round(Math.max(width, height) / 110));
  const nearLight = (x: number, y: number) => {
    for (let dy = -DARK_EDGE; dy <= DARK_EDGE; dy += 1) {
      for (let dx = -DARK_EDGE; dx <= DARK_EDGE; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !darkAt[ny * width + nx]) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = y * width + x;
      const index = here * 4;
      const inside = solid(x, y);
      // The outline: a solid pixel next to a clear one, or the edge of the picture.
      let outline = false;
      if (inside) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !solid(nx, ny)) outline = true;
        }
      }
      // The artwork's own dark line work.
      const dark = inside && darkAt[here] === 1 && nearLight(x, y);
      // A strong change of colour to the right or below: one patch meeting another.
      let edge = false;
      if (inside) {
        if (x + 1 < width && solid(x + 1, y) && colourDistance(rgba, index, index + 4) > options.colourEdge) edge = true;
        if (y + 1 < height && solid(x, y + 1) && colourDistance(rgba, index, index + width * 4) > options.colourEdge) edge = true;
      }
      raw[here] = outline || dark || edge ? 1 : 0;
    }
  }

  // Clear specks: a line pixel with no line pixel around it is noise, not a line.
  const cleaned = new Uint8Array(raw);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!raw[y * width + x]) continue;
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && raw[ny * width + nx]) neighbours += 1;
        }
      }
      if (neighbours === 0) cleaned[y * width + x] = 0;
    }
  }

  // Thicken, so the lines are easy to colour up to.
  let mask = cleaned;
  for (let step = 0; step < options.thicken; step += 1) {
    const grown = new Uint8Array(mask);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!mask[y * width + x]) continue;
        if (x > 0) grown[y * width + x - 1] = 1;
        if (x + 1 < width) grown[y * width + x + 1] = 1;
        if (y > 0) grown[(y - 1) * width + x] = 1;
        if (y + 1 < height) grown[(y + 1) * width + x] = 1;
      }
    }
    mask = grown;
  }
  return mask;
}

/** The mask as black lines on white RGBA, ready to put on a canvas. */
export function lineArtPixels(mask: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let index = 0; index < mask.length; index += 1) {
    const ink = mask[index] ? 0 : 255;
    out[index * 4] = ink;
    out[index * 4 + 1] = ink;
    out[index * 4 + 2] = ink;
    out[index * 4 + 3] = 255;
  }
  return out;
}

/** The share of the picture that is line, 0 to 1. Too much and there is little left to colour in. */
export function inkShare(mask: Uint8Array): number {
  let ink = 0;
  for (const value of mask) ink += value;
  return mask.length > 0 ? ink / mask.length : 0;
}
