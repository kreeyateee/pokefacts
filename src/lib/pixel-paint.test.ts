import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLOUR_PIXEL_FILL,
  SHADOW_BOTTOM_GREY,
  SHADOW_PIXEL_FILL,
  SHADOW_TOP_GREY,
  contentBounds,
  pixelFitFilter,
  shadowGrey,
} from "./pixel-paint";

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

describe("pixel paint for the Yoto screen", () => {
  it("leaves the background of a colour icon clear instead of white", () => {
    assert.doesNotMatch(COLOUR_PIXEL_FILL, /255\)'/);
    assert.match(COLOUR_PIXEL_FILL, /a='if\(gt\(alpha\(X,Y\),0\),255,0\)'/);
  });

  it("fades the shadow from grey at the top to near-black at the bottom, never unlit", () => {
    assert.equal(shadowGrey(0), SHADOW_TOP_GREY);
    assert.equal(shadowGrey(15), SHADOW_BOTTOM_GREY);
    for (let y = 1; y < 16; y += 1) assert.ok(shadowGrey(y) < shadowGrey(y - 1));
    assert.ok(SHADOW_BOTTOM_GREY > 0);
    assert.match(SHADOW_PIXEL_FILL, /a='if\(gt\(alpha\(X,Y\),0\),255,0\)'/);
    assert.doesNotMatch(SHADOW_PIXEL_FILL, /r\(X,Y\)/);
  });
});
