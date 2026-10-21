import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  YOTO_LED_FILL,
  YOTO_MATRIX,
  YOTO_UNLIT,
  yotoLedFill,
  yotoLedPitch,
  yotoLedRect,
  yotoMatrixSize,
  yotoPixelSrc,
} from "./yoto-screen";

describe("Yoto screen preview", () => {
  it("keeps a 16×16 matrix with a dark gap between diodes", () => {
    assert.equal(YOTO_MATRIX, 16);
    assert.equal(YOTO_LED_FILL, 0.75);
    const { pitch, led, gap } = yotoLedPitch(8);
    assert.equal(pitch, 8);
    assert.equal(led, 6);
    assert.equal(gap, 2);
    assert.equal(yotoMatrixSize(8), 16 * 8 - 2);
    const first = yotoLedRect(0, 0, 8);
    const next = yotoLedRect(1, 0, 8);
    assert.equal(first?.size, 6);
    assert.equal(next?.x, 8);
    assert.ok((first?.x ?? 0) + (first?.size ?? 0) < (next?.x ?? 0));
    assert.equal(yotoLedRect(16, 0, 8), null);
  });

  it("leaves black and clear pixels unlit", () => {
    assert.equal(yotoLedFill(0, 0, 0), YOTO_UNLIT);
    assert.equal(yotoLedFill(255, 255, 255, 0), YOTO_UNLIT);
    assert.equal(yotoLedFill(28, 28, 32), "rgb(28 28 32)");
    assert.equal(yotoLedFill(255, 203, 5), "rgb(255 203 5)");
  });

  it("points at the 16×16 file the player will show", () => {
    assert.equal(yotoPixelSrc({ dexId: 25 }), "/pixels/25.png");
    assert.equal(yotoPixelSrc({ dexId: 25, shadow: true }), "/pixels/25-shadow.png");
    assert.equal(yotoPixelSrc({ formId: 10033, dexId: 3 }), "/api/artwork/pixel/10033");
    assert.equal(yotoPixelSrc({ formId: 10033, shadow: true }), undefined);
    assert.equal(yotoPixelSrc({}), undefined);
  });
});
