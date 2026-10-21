/** The Yoto player face is a 16×16 LED matrix. */
export const YOTO_MATRIX = 16;

/**
 * Lit LED size as a fraction of the 16×16 pitch.
 * The Yoto screen leaves a dark grid between diodes; 0.75 matches that spacing.
 */
export const YOTO_LED_FILL = 0.75;

/** Colour of a diode that is off. Pure black on the icon is unlit on the player. */
export const YOTO_UNLIT = "#141414";

export function yotoLedPitch(cell: number): { pitch: number; led: number; gap: number } {
  const pitch = Math.max(2, Math.floor(cell));
  const led = Math.max(1, Math.round(pitch * YOTO_LED_FILL));
  return { pitch, led, gap: pitch - led };
}

export function yotoMatrixSize(pitch: number): number {
  const { gap } = yotoLedPitch(pitch);
  return YOTO_MATRIX * pitch - gap;
}

export function yotoLedRect(
  x: number,
  y: number,
  pitch: number,
): { x: number; y: number; size: number } | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= YOTO_MATRIX || y >= YOTO_MATRIX) {
    return null;
  }
  const { led } = yotoLedPitch(pitch);
  return { x: x * pitch, y: y * pitch, size: led };
}

/** Fill for one diode. Black and clear pixels stay off, the way the player does. */
export function yotoLedFill(r: number, g: number, b: number, a = 255): string {
  if (a < 16 || (r < 8 && g < 8 && b < 8)) return YOTO_UNLIT;
  return `rgb(${r} ${g} ${b})`;
}

/** Local 16×16 file the page can preview. Forms are painted on demand. */
export function yotoPixelSrc(input: {
  formId?: number;
  dexId?: number;
  shadow?: boolean;
}): string | undefined {
  if (input.formId) {
    if (input.shadow) return undefined;
    return `/api/artwork/pixel/${input.formId}`;
  }
  const id = input.dexId;
  if (!id || !Number.isInteger(id) || id < 1 || id > 1025) return undefined;
  return input.shadow ? `/pixels/${id}-shadow.png` : `/pixels/${id}.png`;
}
