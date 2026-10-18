import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("local start", () => {
  it("prints the home URL and the Yoto redirect before serving", () => {
    const result = spawnSync(process.execPath, ["scripts/local.mjs", "--check"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Open http:\/\/127\.0\.0\.1:3847\b/);
    assert.match(result.stdout, /Yoto redirect URI: http:\/\/127\.0\.0\.1:3847\/callback/);
    assert.match(result.stdout, /public tunnel is not required/i);
  });
});
