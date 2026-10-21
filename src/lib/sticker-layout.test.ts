import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampRotation,
  clampSticker,
  defaultStickers,
  hexagonGrid,
  isDecorationKey,
  sanitizeStickers,
  stickerHits,
  stickerStyle,
} from "./sticker-layout.ts";

function rowsOf(stickers: readonly { x: number; y: number }[]): { y: number; xs: number[] }[] {
  const rows: { y: number; xs: number[] }[] = [];
  for (const sticker of stickers) {
    const row = rows.find((item) => Math.abs(item.y - sticker.y) < 0.01);
    if (row) row.xs.push(sticker.x);
    else rows.push({ y: sticker.y, xs: [sticker.x] });
  }
  return rows.map((row) => ({ y: row.y, xs: row.xs.slice().sort((a, b) => a - b) }));
}

describe("sticker looks", () => {
  it("lines suggested pictures up in a transparent hex grid", () => {
    const stickers = defaultStickers(["a", "b", "c", "d", "e"]);
    assert.equal(stickers.length, 5);
    for (const sticker of stickers) {
      assert.equal(sticker.shape, "hex");
      assert.equal(sticker.color, "transparent");
      assert.equal(sticker.rotation, 0);
    }
    const scales = new Set(stickers.map((sticker) => sticker.scale.toFixed(4)));
    assert.equal(scales.size, 1);
    const rows = rowsOf(stickers);
    assert.ok(rows.length >= 2);
    const wide = rows.find((row) => row.xs.length >= 2);
    assert.ok(wide);
    const pitch = (wide?.xs[1] ?? 0) - (wide?.xs[0] ?? 0);
    assert.ok(pitch > 0.08);
    for (const row of rows) {
      for (let index = 1; index < row.xs.length; index += 1) {
        assert.ok(Math.abs((row.xs[index] ?? 0) - (row.xs[index - 1] ?? 0) - pitch) < 0.02);
      }
    }
    if (rows.length >= 2) {
      const shift = (rows[1]?.xs[0] ?? 0) - (rows[0]?.xs[0] ?? 0);
      assert.ok(Math.abs(Math.abs(shift) - pitch / 2) < 0.03);
    }
    const cleaned = sanitizeStickers(stickers, new Set(stickers.map((sticker) => sticker.key)));
    assert.equal(cleaned?.[0]?.color, "transparent");
    assert.ok(Math.abs((cleaned?.[0]?.x ?? 0) - (stickers[0]?.x ?? 0)) < 0.001);
    const spot = clampSticker(stickers[0] ?? { x: 0.5, y: 0.5 }, stickers[0]?.scale ?? 0.3, 0);
    assert.ok(Math.abs(spot.x - (stickers[0]?.x ?? 0)) < 0.001);
  });

  it("fills a long list with one honeycomb instead of every picture", () => {
    const keys = Array.from({ length: 40 }, (_, index) => `mon-${index}`);
    const stickers = defaultStickers(keys);
    assert.ok(stickers.length >= 8);
    assert.ok(stickers.length < keys.length);
    assert.ok(stickers.every((sticker) => sticker.shape === "hex" && sticker.color === "transparent" && sticker.rotation === 0));
    const grid = hexagonGrid(1);
    assert.equal(grid.length, 1);
    assert.ok((grid[0]?.scale ?? 0) >= 0.45);
    assert.ok(Math.abs((grid[0]?.x ?? 0) - 0.5) < 0.08);
    for (const sticker of stickers) {
      const spot = clampSticker(sticker, sticker.scale, sticker.rotation);
      assert.ok(Math.abs(spot.x - sticker.x) < 0.001);
      assert.ok(Math.abs(spot.y - sticker.y) < 0.001);
    }
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
