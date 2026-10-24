import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inkShare, lineArtPixels, lineMask } from "@/lib/colouring";
import { A4_MM, pagesOf, posterTiles, PRINTER_MARGIN_MM, sheetCells } from "@/lib/colouring-layout";

/** A test picture: a filled square of one colour on a clear background, with a second colour in its right half. */
function square(size: number, inner: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const from = (size - inner) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x < from || y < from || x >= from + inner || y >= from + inner) continue;
      const at = (y * size + x) * 4;
      const right = x >= size / 2;
      rgba.set(right ? [40, 120, 240, 255] : [250, 210, 40, 255], at);
    }
  }
  return rgba;
}

describe("colouring line art", () => {
  it("draws the outline and the line between two colours, and leaves the patches white to colour", () => {
    const size = 40;
    const mask = lineMask(square(size, 20), size, size, { darkLine: 70, colourEdge: 110, thicken: 0 });
    const at = (x: number, y: number) => mask[y * size + x];
    assert.equal(at(10, 20), 1, "the left edge");
    assert.equal(at(20, 10), 1, "the top edge");
    assert.equal(at(19, 20), 1, "where yellow meets blue");
    assert.equal(at(14, 20), 0, "inside the yellow");
    assert.equal(at(25, 20), 0, "inside the blue");
    assert.equal(at(2, 2), 0, "the clear background");
  });

  it("outlines a big dark patch instead of filling it black, and clears specks", () => {
    const size = 40;
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let y = 8; y < 32; y += 1) for (let x = 8; x < 32; x += 1) rgba.set([10, 10, 10, 255], (y * size + x) * 4);
    rgba.set([10, 10, 10, 255], (2 * size + 2) * 4);
    const mask = lineMask(rgba, size, size, { darkLine: 70, colourEdge: 110, thicken: 0 });
    assert.equal(mask[20 * size + 20], 0, "the middle of the dark patch stays white");
    assert.equal(mask[20 * size + 8], 1, "its edge is a line");
    assert.equal(mask[2 * size + 2], 0, "a lone dark speck is cleared");
    assert.ok(inkShare(mask) < 0.3);
  });

  it("thickens lines and paints black on white", () => {
    const size = 40;
    const thin = lineMask(square(size, 20), size, size, { darkLine: 70, colourEdge: 110, thicken: 0 });
    const thick = lineMask(square(size, 20), size, size, { darkLine: 70, colourEdge: 110, thicken: 2 });
    assert.ok(inkShare(thick) > inkShare(thin));
    const pixels = lineArtPixels(thin);
    assert.deepEqual([...pixels.subarray(0, 4)], [255, 255, 255, 255]);
    const line = (20 * size + 10) * 4;
    assert.deepEqual([...pixels.subarray(line, line + 4)], [0, 0, 0, 255]);
  });
});

describe("colouring sheet layout", () => {
  it("fits 1, 2, 4 or 6 square pictures on an A4 page without overlapping", () => {
    for (const perPage of [1, 2, 4, 6] as const) {
      const cells = sheetCells(perPage);
      assert.equal(cells.length, perPage);
      for (const cell of cells) {
        assert.equal(cell.width, cell.height);
        assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x + cell.width <= A4_MM.width && cell.y + cell.height <= A4_MM.height);
      }
      for (const [index, a] of cells.entries()) {
        for (const b of cells.slice(index + 1)) {
          const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
          assert.ok(apart, `${perPage} per page: cells overlap`);
        }
      }
    }
    assert.ok((sheetCells(1)[0]?.width ?? 0) > 150, "one Pokémon fills the page");
  });

  it("splits the picks into pages", () => {
    assert.deepEqual(pagesOf([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(pagesOf([], 4), []);
  });

  it("covers the whole enlarged sheet with A4 pages that meet exactly inside the printer margins", () => {
    for (const across of [2, 3, 4] as const) {
      const tiles = posterTiles(across);
      assert.equal(tiles.length, across * across);
      const scale = tiles[0]?.scale ?? 0;
      assert.ok(scale > across * 0.9 && scale <= across, `${across} across is enlarged ${scale.toFixed(2)} times`);
      const printable = A4_MM.width - PRINTER_MARGIN_MM * 2;
      for (const tile of tiles) {
        assert.ok(Math.abs(tile.source.width * scale - printable) < 1e-9, "each page fills its printable width");
        const right = tiles.find((other) => other.row === tile.row && other.column === tile.column + 1);
        if (right) assert.ok(Math.abs(tile.source.x + tile.source.width - right.source.x) < 1e-9, "no gap and no overlap");
      }
      const last = tiles.at(-1);
      assert.ok(last && last.source.x + last.source.width >= A4_MM.width - 1e-9, "the whole width is covered");
      assert.ok(last && last.source.y + last.source.height >= A4_MM.height - 1e-9, "the whole height is covered");
    }
    assert.equal(posterTiles(1).length, 1);
  });
});
