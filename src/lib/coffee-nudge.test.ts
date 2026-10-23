import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COFFEE_NUDGE_AFTER_S, COFFEE_NUDGE_COPY, COFFEE_NUDGE_GAP_MS, readAskedAt, shouldNudge } from "./coffee-nudge";

describe("coffee nudge", () => {
  const now = 1_800_000_000_000;

  it("waits until the page has been used for a while", () => {
    assert.equal(shouldNudge(COFFEE_NUDGE_AFTER_S - 1, 0, now), false);
    assert.equal(shouldNudge(COFFEE_NUDGE_AFTER_S, 0, now), true);
  });

  it("asks at most once a week, counting the ask when a card is ready", () => {
    assert.equal(shouldNudge(600, now - 60_000, now), false, "asked a minute ago");
    assert.equal(shouldNudge(600, now - COFFEE_NUDGE_GAP_MS + 1, now), false);
    assert.equal(shouldNudge(600, now - COFFEE_NUDGE_GAP_MS, now), true);
    assert.equal(shouldNudge(600, now + 86_400_000, now), true, "a clock that went backwards does not block it forever");
  });

  it("treats a missing or broken stored time as never asked", () => {
    assert.equal(readAskedAt(null), 0);
    assert.equal(readAskedAt("soon"), 0);
    assert.equal(readAskedAt("-5"), 0);
    assert.equal(readAskedAt(String(now)), now);
  });

  it("asks kindly, in British English, without pressure", () => {
    assert.match(COFFEE_NUDGE_COPY, /free, with no ads/);
    assert.doesNotMatch(COFFEE_NUDGE_COPY, /please|must|need/i);
  });
});
