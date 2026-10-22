/** Classic Pokémon storefront lettering. */
export const POKEMON_SIGN_TEXT = "Pokémon";
export const POKEMON_SIGN_FILL = "#ffcb05";
export const POKEMON_SIGN_STROKE = "#2a75bb";
export const POKEMON_SIGN_INK = "#16324f";

/** Letter height as a fraction of the sign strip. Stroke sits around the fill. */
export function pokemonSignFontPx(heightPx: number): number {
  return Math.max(8, heightPx * 0.62);
}

export function pokemonSignStrokePx(fontPx: number): number {
  return Math.max(1.5, fontPx * 0.14);
}

/** Draw yellow-on-blue Pokémon lettering, scaled to fit the box. */
export function paintPokemonSign(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  fontFamily: string,
): void {
  if (box.width <= 0 || box.height <= 0) return;
  let size = pokemonSignFontPx(box.height);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2 + box.height * 0.04;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.font = `italic 900 ${size}px ${fontFamily}`;
  const maxWidth = box.width * 0.94;
  while (size > 8 && ctx.measureText(POKEMON_SIGN_TEXT).width + pokemonSignStrokePx(size) > maxWidth) {
    size -= 1;
    ctx.font = `italic 900 ${size}px ${fontFamily}`;
  }
  const stroke = pokemonSignStrokePx(size);
  ctx.lineWidth = stroke + Math.max(1, size * 0.05);
  ctx.strokeStyle = POKEMON_SIGN_INK;
  ctx.strokeText(POKEMON_SIGN_TEXT, cx, cy);
  ctx.lineWidth = stroke;
  ctx.strokeStyle = POKEMON_SIGN_STROKE;
  ctx.fillStyle = POKEMON_SIGN_FILL;
  ctx.strokeText(POKEMON_SIGN_TEXT, cx, cy);
  ctx.fillText(POKEMON_SIGN_TEXT, cx, cy);
  ctx.restore();
}
