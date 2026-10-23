import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CARD_MM,
  CHECK_RULER_MM,
  MIN_MARGIN_MM,
  PAPERS,
  cardsPerSheet,
  freshCover,
  readCoverDraft,
  sheetSlots,
  showsNameList,
  staleCoverIds,
  stickerStorageKey,
} from "./sticker-layout";

const fresh = freshCover({
  libraryTitle: "Pokefacts 1",
  rangeLabel: "Pokefacts 1 (1-3)",
  blurb: "",
  childDoes: "",
  detail: "",
  keys: ["a", "b", "c"],
});
const keys = new Set(["a", "b", "c"]);

describe("saved covers", () => {
  it("keeps the same storage key so earlier covers are found", () => {
    assert.match(stickerStorageKey("facts-1"), /^pokefacts\.stickers\.v3\./);
  });

  it("starts as a group photo of everyone, with the first Pokémon as the star", () => {
    assert.equal(fresh.style, "photo");
    assert.equal(fresh.crowd, null);
    assert.equal(fresh.sprites, false);
    assert.equal(fresh.hero, "a");
    assert.equal(fresh.backMode, "steps");
  });

  it("opens a cover saved before the three styles as a group photo with the how-to-play back", () => {
    const old = JSON.stringify({
      title: "My card",
      style: "grid",
      backMode: "auto",
      paper: "letter",
      pattern: "hex",
      stickers: [{ id: "s1", key: "b", x: 0.5, y: 0.5, scale: 0.3 }],
    });
    const cover = readCoverDraft(old, fresh, keys);
    assert.equal(cover.style, "photo");
    assert.equal(cover.backMode, "steps");
    assert.equal(cover.title, "My card");
    assert.equal(cover.crowd, null);
    assert.equal(cover.hero, "a");
    assert.equal(cover.scene, null, "an old cover keeps its usual background");
  });

  it("keeps a chosen background, and drops one it does not know", () => {
    assert.equal(readCoverDraft(JSON.stringify({ ...fresh, scene: "cave" }), fresh, keys).scene, "cave");
    assert.equal(readCoverDraft(JSON.stringify({ ...fresh, scene: "lava" }), fresh, keys).scene, null);
    assert.equal(fresh.scene, null);
  });

  it("keeps the style, star, owner, and crowd, and drops anyone not on this card", () => {
    const saved = JSON.stringify({ ...fresh, style: "pile", hero: "c", owner: "Ash", crowd: ["b", "zz", "b", 4], sprites: true, pileSeed: 3 });
    const cover = readCoverDraft(saved, fresh, keys);
    assert.equal(cover.style, "pile");
    assert.equal(cover.sprites, true);
    assert.equal(cover.pileSeed, 3);
    assert.equal(cover.hero, "c");
    assert.equal(cover.owner, "Ash");
    assert.deepEqual(cover.crowd, ["b"]);
    assert.equal(readCoverDraft(JSON.stringify({ ...fresh, hero: "zz" }), fresh, keys).hero, "a");
    assert.equal(readCoverDraft(JSON.stringify({ ...fresh, crowd: ["zz"] }), fresh, keys).crowd, null);
    assert.deepEqual(readCoverDraft(JSON.stringify({ ...fresh, crowd: [] }), fresh, keys).crowd, []);
    assert.deepEqual(readCoverDraft("{", fresh, keys), fresh);
  });

  it("puts a new drawing behind the Pokémon and keeps older drawings where they were", () => {
    assert.equal(fresh.drawLayer, "behind");
    assert.equal(readCoverDraft(JSON.stringify({ ...fresh, drawLayer: "front" }), fresh, keys).drawLayer, "front");
    const old = (style: string) => {
      const saved: Record<string, unknown> = { ...fresh, style };
      delete saved.drawLayer;
      return readCoverDraft(JSON.stringify(saved), fresh, keys).drawLayer;
    };
    assert.equal(old("photo"), "behind");
    assert.equal(old("pile"), "front");
    assert.equal(old("trading"), "front");
    assert.equal(readCoverDraft(JSON.stringify({ ...fresh, drawLayer: "sideways" }), fresh, keys).drawLayer, "behind");
  });

  it("only lists names on the back when asked and when they fit", () => {
    assert.equal(showsNameList(["001 Bulbasaur"], "names", false), true);
    assert.equal(showsNameList(["001 Bulbasaur"], "steps", false), false);
    assert.equal(showsNameList(["001 Bulbasaur"], "names", true), false);
  });

  it("tidies the oldest Pokédex pick covers and never a ready-made card", () => {
    const saved = [
      { id: "meet-1", savedAt: 1 },
      { id: "selection-a", savedAt: 5 },
      { id: "selection-b", savedAt: 9 },
      { id: "selection-c", savedAt: 7 },
    ];
    assert.deepEqual(staleCoverIds(saved, 2), ["selection-a"]);
  });
});

describe("print sheet", () => {
  it("keeps every card inside the printable area and pairs each front with its back", () => {
    for (const paper of ["a4", "letter"] as const) {
      const layout = sheetSlots(paper);
      const page = PAPERS[paper];
      assert.ok(layout.slots.length >= 4, `${paper} fits at least two cards`);
      for (const [index, slot] of layout.slots.entries()) {
        assert.equal(slot.face, index % 2 === 0 ? "front" : "back");
        assert.ok(slot.x >= MIN_MARGIN_MM && slot.y >= MIN_MARGIN_MM);
        assert.ok(slot.x + CARD_MM.width <= page.width - MIN_MARGIN_MM + 0.001);
        assert.ok(slot.y + CARD_MM.height <= page.height - MIN_MARGIN_MM + 0.001);
      }
    }
    assert.equal(cardsPerSheet("a4"), 3);
    assert.equal(cardsPerSheet("letter"), 2);
  });

  it("leaves room beside the cards for the print steps and a 5 cm check line", () => {
    for (const paper of ["a4", "letter"] as const) {
      const { guide } = sheetSlots(paper);
      assert.ok(guide.x >= MIN_MARGIN_MM);
      assert.ok(guide.width >= 28, `${paper} guide column is too narrow`);
      assert.ok(guide.height >= CHECK_RULER_MM + 40, `${paper} guide column is too short for the ruler`);
    }
  });
});
