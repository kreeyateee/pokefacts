import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isNewerBuild } from "./update-check";

describe("update check", () => {
  it("spots a different build on the server", () => {
    assert.equal(isNewerBuild("a1b2c3d", "e4f5a6b"), true);
    assert.equal(isNewerBuild("a1b2c3d", "a1b2c3d"), false);
  });

  it("ignores bad answers and dev pages", () => {
    assert.equal(isNewerBuild("a1b2c3d", undefined), false);
    assert.equal(isNewerBuild("a1b2c3d", "<html>"), false);
    assert.equal(isNewerBuild("a1b2c3d", ""), false);
    assert.equal(isNewerBuild("dev", "e4f5a6b"), false);
  });
});
