import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampRotation,
  defaultStickers,
  isDecorationKey,
  sanitizeStickers,
  stickerHits,
  stickerStyle,
} from "./sticker-layout";

describe("sticker looks", () => {
  it("gives each suggested picture a different shape", () => {
    const stickers = defaultStickers(["a", "b", "c", "d", "e"]);
    const shapes = new Set(stickers.map((sticker) => sticker.shape));
    assert.equal(shapes.size, 5);
    assert.equal(stickers[0]?.rotation, 0);
    assert.notEqual(stickers[0]?.color, stickers[1]?.color);
  });

  it("keeps a saved decoration, its turn, and its colour", () => {
    const cleaned = sanitizeStickers(
      [{ id: "s1", key: "deco:poke", x: 0.4, y: 0.5, scale: 0.3, rotation: Math.PI / 2, shape: "star", color: "#2A75BB" }],
      new Set(["bulba"]),
    );
    assert.equal(cleaned?.length, 1);
    assert.equal(cleaned?.[0]?.key, "deco:poke");
    assert.equal(cleaned?.[0]?.shape, "star");
    assert.equal(cleaned?.[0]?.color, "#2a75bb");
    assert.ok(Math.abs((cleaned?.[0]?.rotation ?? 0) - Math.PI / 2) < 0.001);
  });

  it("drops a sticker that is not on the card and not a decoration", () => {
    const cleaned = sanitizeStickers([{ id: "s1", key: "missing", x: 0.5, y: 0.5, scale: 0.3 }], new Set(["bulba"]));
    assert.deepEqual(cleaned, []);
  });

  it("hits the middle of a turned sticker and misses a corner that rotated away", () => {
    const sticker = { x: 0.5, y: 0.5, scale: 0.4, ...stickerStyle(0) };
    assert.equal(stickerHits(sticker, 0.5, 0.5), true);
    const half = sticker.scale / 2;
    const along = half * 0.9;
    const aspect = 85.6 / 54;
    const corner = { x: sticker.x + along, y: sticker.y + along / aspect };
    assert.equal(stickerHits(sticker, corner.x, corner.y), true);
    const turned = { ...sticker, rotation: Math.PI / 4 };
    assert.equal(stickerHits(turned, corner.x, corner.y), false);
    assert.equal(stickerHits(turned, 0.5, 0.5), true);
  });

  it("wraps a full turn back to zero", () => {
    assert.ok(Math.abs(clampRotation(Math.PI * 2)) < 0.001);
    assert.equal(isDecorationKey("deco:oran"), true);
    assert.equal(isDecorationKey("bulba"), false);
  });
});
