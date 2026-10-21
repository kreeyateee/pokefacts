import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  arrangeTiles,
  clampRotation,
  defaultStickers,
  isDecorationKey,
  nearestTileIndex,
  sanitizeStickers,
  stickerHits,
  stickerStyle,
  tileCells,
  tileGrid,
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

describe("sticker tiles", () => {
  it("leaves an empty pattern empty", () => {
    assert.deepEqual(tileCells("square", 0), []);
    assert.deepEqual(arrangeTiles([], "hex"), []);
    assert.equal(nearestTileIndex(0, "circle", 0.5, 0.5), 0);
  });

  it("fills a square grid and a wider rectangle", () => {
    const square = tileGrid("square", 4);
    const rectangle = tileGrid("rectangle", 4);
    assert.deepEqual(square, { columns: 2, rows: 2 });
    assert.equal(rectangle.columns, 3);
    assert.equal(rectangle.rows, 2);
    const squareCells = tileCells("square", 4);
    assert.equal(squareCells.length, 4);
    assert.ok((squareCells[0]?.x ?? 1) < (squareCells[1]?.x ?? 0));
    assert.ok((squareCells[0]?.y ?? 1) < (squareCells[2]?.y ?? 0));
    const placed = defaultStickers(["a", "b", "c", "d"]);
    const tiled = arrangeTiles(placed, "rectangle");
    assert.deepEqual(
      tiled.map((sticker) => sticker.key),
      ["a", "b", "c", "d"],
    );
    assert.notEqual(tiled[0]?.x, placed[0]?.x);
  });

  it("offsets the next hex row and rings a circle", () => {
    const hex = tileCells("hex", 6);
    const columns = tileGrid("hex", 6).columns;
    assert.ok(columns >= 2);
    assert.ok((hex[columns]?.x ?? 0) > (hex[0]?.x ?? 1));
    const circle = tileCells("circle", 6);
    assert.equal(circle.length, 6);
    const centerX = circle.reduce((sum, cell) => sum + cell.x, 0) / circle.length;
    const centerY = circle.reduce((sum, cell) => sum + cell.y, 0) / circle.length;
    const distances = circle.map((cell) => Math.hypot(cell.x - centerX, cell.y - centerY));
    const nearest = Math.min(...distances);
    const farthest = Math.max(...distances);
    assert.ok(farthest - nearest < 0.08);
    const hit = nearestTileIndex(6, "circle", circle[2]?.x ?? 0, circle[2]?.y ?? 0);
    assert.equal(hit, 2);
  });
});
