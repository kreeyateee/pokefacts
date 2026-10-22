import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contentBounds, pixelFitFilter } from "./pixel-paint";

function rgba(width: number, height: number, fill: [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set(fill, index * 4);
  return data;
}

function put(
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  pixel: [number, number, number, number],
): void {
  data.set(pixel, (y * width + x) * 4);
}

describe("pixel content crop", () => {
  it("trims transparent padding and keeps a one-pixel margin", () => {
    const data = rgba(10, 10, [0, 0, 0, 0]);
    put(data, 10, 4, 5, [40, 180, 70, 255]);
    put(data, 10, 5, 5, [40, 180, 70, 255]);
    put(data, 10, 5, 6, [40, 180, 70, 200]);
    assert.deepEqual(contentBounds(10, 10, data, 0), { x: 4, y: 5, width: 2, height: 2 });
    assert.deepEqual(contentBounds(10, 10, data, 1), { x: 3, y: 4, width: 4, height: 4 });
  });

  it("returns null when the picture is empty", () => {
    assert.equal(contentBounds(4, 4, rgba(4, 4, [0, 0, 0, 0])), null);
    assert.equal(contentBounds(4, 4, rgba(4, 4, [12, 12, 12, 8])), null);
  });

  it("crops then pads to a square before the 16×16 scale", () => {
    const filter = pixelFitFilter({ x: 28, y: 30, width: 35, height: 33 });
    assert.match(filter, /^format=rgba,crop=35:33:28:30,/);
    assert.match(filter, /pad=max\(iw\\,ih\):max\(iw\\,ih\):\(ow-iw\)\/2:\(oh-ih\)\/2:0x00000000/);
    assert.match(filter, /scale=16:16:flags=neighbor/);
  });
});
