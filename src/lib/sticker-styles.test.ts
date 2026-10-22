import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CARD_MM, COVER_STYLES } from "./sticker-layout";
import {
  POSTER_PAPER_MM,
  POSTER_PHOTO,
  POSTER_PILE,
  POSTER_SAFE_MM,
  POSTER_UNITS,
  TEXT_SAFE_MM,
  heroKindLine,
  heroName,
  heroNumber,
  lighten,
  playSteps,
  rangeLine,
  styleRects,
  textRects,
  typeColor,
} from "./sticker-styles";

describe("sticker styles", () => {
  it("keeps every box of every face on the card", () => {
    for (const style of [...COVER_STYLES, "back" as const]) {
      for (const rect of styleRects(style)) {
        assert.ok(rect.x >= 0 && rect.y >= 0, `${style} box starts off the card`);
        assert.ok(rect.x + rect.w <= CARD_MM.width + 0.001, `${style} box runs off the right`);
        assert.ok(rect.y + rect.h <= CARD_MM.height + 0.001, `${style} box runs off the bottom`);
      }
    }
  });

  it("keeps words far enough from the edge that a slightly-off cut never clips them", () => {
    for (const style of [...COVER_STYLES, "back" as const]) {
      for (const rect of textRects(style)) {
        assert.ok(rect.x >= TEXT_SAFE_MM - 0.001, `${style} text is too close to the left edge`);
        assert.ok(rect.y >= TEXT_SAFE_MM - 0.001, `${style} text is too close to the top`);
        assert.ok(CARD_MM.width - rect.x - rect.w >= TEXT_SAFE_MM - 0.001, `${style} text is too close to the right`);
        assert.ok(CARD_MM.height - rect.y - rect.h >= TEXT_SAFE_MM - 0.001, `${style} text is too close to the bottom`);
      }
    }
  });

  it("keeps everything on an A4 poster at least 10 mm from the edge of the paper", () => {
    assert.ok(Math.abs(POSTER_UNITS.height / POSTER_UNITS.width - POSTER_PAPER_MM.height / POSTER_PAPER_MM.width) < 1e-9);
    const safe = (POSTER_SAFE_MM * POSTER_UNITS.width) / POSTER_PAPER_MM.width;
    for (const rect of [...Object.values(POSTER_PHOTO), ...Object.values(POSTER_PILE)]) {
      assert.ok(rect.x >= safe - 0.01 && rect.y >= safe - 0.01, "poster box is too close to the top or left");
      assert.ok(POSTER_UNITS.width - rect.x - rect.w >= safe - 0.01, "poster box is too close to the right");
      assert.ok(POSTER_UNITS.height - rect.y - rect.h >= safe - 0.01, "poster box is too close to the bottom");
    }
  });

  it("names the star, or keeps it a riddle", () => {
    const pikachu = { name: "Pikachu", number: 25, types: ["electric"], genus: "Mouse Pokémon", hidden: false };
    assert.equal(heroName(pikachu), "Pikachu");
    assert.equal(heroNumber(pikachu), "No. 025");
    assert.equal(heroKindLine(pikachu), "Electric type · Mouse Pokémon");
    const riddle = { ...pikachu, hidden: true };
    assert.equal(heroName(riddle), "???");
    assert.equal(heroNumber(riddle), "No. ???");
    assert.equal(heroKindLine(riddle), "Who's that Pokémon?");
    assert.equal(heroKindLine({ ...pikachu, types: ["grass", "poison"], genus: "" }), "Grass and Poison type");
  });

  it("colours by type and lightens toward white", () => {
    assert.equal(typeColor("Electric"), "#F7D02C");
    assert.equal(typeColor("unknown"), "#a8a77a");
    assert.equal(lighten("#000000", 1), "#ffffff");
    assert.equal(lighten("#000000", 0), "#000000");
    assert.equal(lighten("#204080", 0.5), "#90a0c0");
  });

  it("tells a child how to play, and keeps riddles a game", () => {
    assert.match(playSteps("meet")[2], /facts/);
    assert.match(playSteps("guess")[2], /guess/);
    assert.equal(playSteps("guess").length, 3);
  });

  it("writes the number range, but never for riddles", () => {
    assert.equal(rangeLine({ ids: [1, 2, 3], rangeLabel: "Pokefacts 1 (1-3)", hidden: false }), "No. 1 to 3");
    assert.equal(rangeLine({ ids: [4, 1, 7], rangeLabel: "Ash team", hidden: false }), "Ash team");
    assert.equal(rangeLine({ ids: [1, 2, 3], rangeLabel: "Riddles 1", hidden: true }), "Riddles 1");
  });
});
