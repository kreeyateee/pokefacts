import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { swipeNudge, swipeStep } from "./swipe";

describe("swipe", () => {
  it("goes on with a swipe to the left and back with a swipe to the right", () => {
    assert.equal(swipeStep(-120, 10, 250), 1);
    assert.equal(swipeStep(120, -10, 250), -1);
  });

  it("ignores taps, slow drags and scrolling", () => {
    assert.equal(swipeStep(-20, 0, 100), 0, "too short");
    assert.equal(swipeStep(-200, 0, 1500), 0, "too slow");
    assert.equal(swipeStep(-80, 120, 300), 0, "mostly up and down");
    assert.equal(swipeStep(-90, 70, 300), 0, "not sideways enough");
  });

  it("lets the card follow the finger a little, never far", () => {
    assert.equal(swipeNudge(0), 0);
    assert.equal(swipeNudge(-100), -35);
    assert.equal(swipeNudge(400), 48);
  });
});
