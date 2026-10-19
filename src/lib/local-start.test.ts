import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { productionBuildArgs } from "../../scripts/next-build-args.mjs";

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

  it("builds Android and Termux arm64 with webpack", () => {
    const android = productionBuildArgs("android", "arm64", {});
    assert.ok(android.includes("--webpack"));
    assert.deepEqual(android, ["build", "--webpack"]);

    const termux = productionBuildArgs("linux", "arm64", {
      TERMUX_VERSION: "0.118.1",
      PREFIX: "/data/data/com.termux/files/usr",
      HOME: "/data/data/com.termux/files/home",
    });
    assert.ok(termux.includes("--webpack"));
    assert.deepEqual(productionBuildArgs("android", "arm", {}), ["build", "--webpack"]);
  });

  it("keeps Turbopack on desktop Linux, macOS, and Windows", () => {
    assert.deepEqual(productionBuildArgs("linux", "x64", {}), ["build"]);
    assert.deepEqual(productionBuildArgs("linux", "arm64", { HOME: "/home/ubuntu" }), ["build"]);
    assert.deepEqual(productionBuildArgs("darwin", "arm64", {}), ["build"]);
    assert.deepEqual(productionBuildArgs("win32", "x64", {}), ["build"]);
  });
});
