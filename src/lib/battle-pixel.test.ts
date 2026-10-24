import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { BATTLE_FPS, battleFrames, ensureBattlePixel, flashed, shifted, SIZE } from "@/lib/battle-pixel";

/** A test icon: one red pixel at (5, 5) on a clear background. */
function dot(): Uint8Array {
  const frame = new Uint8Array(SIZE * SIZE * 4);
  frame.set([200, 40, 40, 255], (5 * SIZE + 5) * 4);
  return frame;
}
const alphaAt = (frame: Uint8Array, x: number, y: number) => frame[(y * SIZE + x) * 4 + 3];

describe("battle icons", () => {
  it("moves the picture and leaves clear pixels behind", () => {
    const moved = shifted(dot(), 2, -1);
    assert.equal(alphaAt(moved, 7, 4), 255);
    assert.equal(alphaAt(moved, 5, 5), 0);
  });

  it("flashes towards white and leaves clear pixels clear", () => {
    const flash = flashed(dot());
    const at = (5 * SIZE + 5) * 4;
    assert.ok((flash[at] ?? 0) > 200 && (flash[at + 1] ?? 0) > 150);
    assert.equal(alphaAt(flash, 0, 0), 0);
  });

  it("loops for about three seconds: a bounce, a lunge, a hit", () => {
    const frames = battleFrames(dot());
    const seconds = frames.length / BATTLE_FPS;
    assert.ok(seconds >= 2.5 && seconds <= 4, `${seconds}s`);
    assert.ok(frames.some((frame) => alphaAt(frame, 5, 4) === 255), "it bounces up");
    assert.ok(frames.some((frame) => alphaAt(frame, 7, 5) === 255), "it lunges forward");
    assert.ok(frames.some((frame) => (frame[(5 * SIZE + 5) * 4 + 1] ?? 0) > 150), "it flashes");
    assert.deepEqual(frames.at(-1), dot(), "it ends still, so the loop joins up");
  });

  it("makes a 16×16 animated GIF from a real icon, once", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-battle-"));
    try {
      const gif = await ensureBattlePixel(25, dir);
      assert.equal(gif.subarray(0, 4).toString("ascii"), "GIF8");
      assert.equal(gif.readUInt16LE(6), 16);
      assert.equal(gif.readUInt16LE(8), 16);
      assert.ok(gif.includes(Buffer.from("NETSCAPE2.0")), "it loops");
      assert.deepEqual(await ensureBattlePixel(25, dir), gif, "the second time is the saved one");
      await assert.rejects(ensureBattlePixel(0, dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
