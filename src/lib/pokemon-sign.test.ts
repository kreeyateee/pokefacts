import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  POKEMON_SIGN_FILL,
  POKEMON_SIGN_INK,
  POKEMON_SIGN_STROKE,
  POKEMON_SIGN_TEXT,
  pokemonSignFontPx,
  pokemonSignStrokePx,
} from "./pokemon-sign";

describe("Pokémon sign", () => {
  it("uses the accented storefront word", () => {
    assert.equal(POKEMON_SIGN_TEXT, "Pokémon");
    assert.equal(POKEMON_SIGN_FILL, "#ffcb05");
    assert.equal(POKEMON_SIGN_STROKE, "#2a75bb");
    assert.equal(POKEMON_SIGN_INK, "#16324f");
  });

  it("keeps lettering inside the sign strip", () => {
    assert.equal(pokemonSignFontPx(100), 62);
    assert.equal(pokemonSignFontPx(10), 8);
    assert.ok(pokemonSignStrokePx(62) < 62 * 0.2);
  });
});
