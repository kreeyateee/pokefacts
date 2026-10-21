/**
 * Opaque black shape on solid white. Every output pixel has alpha 255.
 * Transparent artwork uses its alpha. An opaque picture keeps a light
 * backdrop (white or a pale checkerboard touching the edge) as white, and
 * turns the remaining shape black so a white field does not become a black box.
 */
export function silhouetteRgba(source: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const count = width * height;
  const out = new Uint8ClampedArray(count * 4);
  if (width < 1 || height < 1 || source.length < count * 4) return out;

  let clear = 0;
  for (let index = 0; index < count; index += 1) {
    if (source[index * 4 + 3] < 250) clear += 1;
  }
  if (clear > 0) {
    for (let index = 0; index < count; index += 1) write(out, index, source[index * 4 + 3] < 40);
    return out;
  }

  const backdrop = new Uint8Array(count);
  const stack: number[] = [];
  const consider = (index: number) => {
    if (index < 0 || index >= count || backdrop[index]) return;
    const offset = index * 4;
    if (!lightBackdrop(source[offset], source[offset + 1], source[offset + 2])) return;
    backdrop[index] = 1;
    stack.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    consider(x);
    consider((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    consider(y * width);
    consider(y * width + width - 1);
  }
  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % width;
    if (x > 0) consider(index - 1);
    if (x + 1 < width) consider(index + 1);
    if (index >= width) consider(index - width);
    if (index + width < count) consider(index + width);
  }

  for (let index = 0; index < count; index += 1) write(out, index, backdrop[index] === 1);
  return out;
}

function write(out: Uint8ClampedArray, index: number, white: boolean): void {
  const value = white ? 255 : 0;
  const offset = index * 4;
  out[offset] = value;
  out[offset + 1] = value;
  out[offset + 2] = value;
  out[offset + 3] = 255;
}

/** Near-white and light-gray checker squares. Saturated body colours stay out. */
function lightBackdrop(red: number, green: number, blue: number): boolean {
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const luminance = (red + green + blue) / 3;
  return spread <= 28 && luminance >= 168;
}
