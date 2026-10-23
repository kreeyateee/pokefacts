import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isHidden, pillState } from "./send-pill";

describe("send pill", () => {
  it("shows a rounded percentage while tracks finish", () => {
    assert.deepEqual(pillState({ status: "sending", done: 1, total: 3 }), { kind: "percent", percent: 33 });
    assert.deepEqual(pillState({ status: "sending", done: 0, total: 100 }), { kind: "percent", percent: 0 });
  });

  it("keeps the percentage between 0 and 100", () => {
    assert.deepEqual(pillState({ status: "sending", done: 9, total: 4 }), { kind: "percent", percent: 100 });
    assert.deepEqual(pillState({ status: "sending", done: -2, total: 4 }), { kind: "percent", percent: 0 });
  });

  it("shows a working ring when the total is not known", () => {
    assert.deepEqual(pillState({ status: "sending" }), { kind: "working" });
    assert.deepEqual(pillState({ status: "sending", done: 2, total: 0 }), { kind: "working" });
  });

  it("shows done and failed over any count", () => {
    assert.deepEqual(pillState({ status: "completed", done: 3, total: 3 }), { kind: "done" });
    assert.deepEqual(pillState({ status: "failed", done: 1, total: 3 }), { kind: "failed" });
  });

  it("opens the panel again when the status moves on", () => {
    assert.equal(isHidden(null, "sending"), false);
    assert.equal(isHidden("sending", "sending"), true);
    assert.equal(isHidden("sending", "completed"), false);
    assert.equal(isHidden("sending", "failed"), false);
  });
});
