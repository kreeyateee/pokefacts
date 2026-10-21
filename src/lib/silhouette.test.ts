import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { silhouetteRgba } from "./silhouette";

function solid(width: number, height: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set(fill, index * 4);
  }
  return data;
}

function put(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  pixel: [number, number, number, number],
): void {
  data.set(pixel, (y * width + x) * 4);
}

function counts(data: Uint8ClampedArray): { white: number; black: number; other: number; clear: number } {
  let white = 0;
  let black = 0;
  let other = 0;
  let clear = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const [red, green, blue, alpha] = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    if (alpha !== 255) clear += 1;
    else if (red === 255 && green === 255 && blue === 255) white += 1;
    else if (red === 0 && green === 0 && blue === 0) black += 1;
    else other += 1;
  }
  return { white, black, other, clear };
}

describe("silhouette pixels", () => {
  it("turns transparent artwork into opaque white with a black shape", () => {
    const data = solid(4, 4, [0, 0, 0, 0]);
    put(data, 4, 1, 1, [80, 180, 40, 255]);
    put(data, 4, 2, 1, [80, 180, 40, 20]);
    put(data, 4, 2, 2, [255, 255, 255, 255]);
    const painted = silhouetteRgba(data, 4, 4);
    const tally = counts(painted);
    assert.deepEqual(tally, { white: 14, black: 2, other: 0, clear: 0 });
    assert.equal(painted[(1 * 4 + 1) * 4], 0);
    assert.equal(painted[(2 * 4 + 2) * 4], 0);
  });

  it("keeps an opaque white field white and the creature black", () => {
    const data = solid(6, 6, [255, 255, 255, 255]);
    for (let y = 2; y <= 3; y += 1) {
      for (let x = 2; x <= 3; x += 1) put(data, 6, x, y, [30, 90, 200, 255]);
    }
    const tally = counts(silhouetteRgba(data, 6, 6));
    assert.deepEqual(tally, { white: 32, black: 4, other: 0, clear: 0 });
  });

  it("turns a pale checkerboard that touches the edge into solid white", () => {
    const data = solid(8, 8, [255, 255, 255, 255]);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const gray = (x + y) % 2 === 0 ? 255 : 200;
        put(data, 8, x, y, [gray, gray, gray, 255]);
      }
    }
    for (let y = 3; y <= 4; y += 1) {
      for (let x = 3; x <= 4; x += 1) put(data, 8, x, y, [20, 90, 200, 255]);
    }
    const tally = counts(silhouetteRgba(data, 8, 8));
    assert.deepEqual(tally, { white: 60, black: 4, other: 0, clear: 0 });
  });

  it("keeps an enclosed light patch inside the creature black", () => {
    const data = solid(10, 10, [250, 250, 248, 255]);
    for (let y = 1; y <= 8; y += 1) {
      for (let x = 1; x <= 8; x += 1) put(data, 10, x, y, [16, 16, 20, 255]);
    }
    put(data, 10, 4, 4, [255, 255, 255, 255]);
    put(data, 10, 5, 5, [255, 255, 255, 255]);
    const tally = counts(silhouetteRgba(data, 10, 10));
    assert.equal(tally.clear, 0);
    assert.equal(tally.other, 0);
    assert.equal(tally.white, 36);
    assert.equal(tally.black, 64);
    assert.equal(silhouetteRgba(data, 10, 10)[(4 * 10 + 4) * 4], 0);
  });
});
