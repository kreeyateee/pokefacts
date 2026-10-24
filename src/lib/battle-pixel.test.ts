import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { BATTLE_FPS, battleFrames, ensureBattlePixel, idleFrames, onBlack, shifted, SIZE } from "@/lib/battle-pixel";
import { ffmpegCommand } from "@/lib/ffmpeg-bin";

/** A test icon: one red pixel at (5, 5) on a clear background. */
function dot(): Uint8Array {
  const frame = new Uint8Array(SIZE * SIZE * 4);
  frame.set([200, 40, 40, 255], (5 * SIZE + 5) * 4);
  return frame;
}
const alphaAt = (frame: Uint8Array, x: number, y: number) => frame[(y * SIZE + x) * 4 + 3];

describe("animated icons for the Yoto screen", () => {
  it("moves the picture and leaves clear pixels behind", () => {
    const moved = shifted(dot(), 2, -1);
    assert.equal(alphaAt(moved, 7, 4), 255);
    assert.equal(alphaAt(moved, 5, 5), 0);
  });

  it("in battle: bounces, then winds up and lunges to attack, and never flashes as if hit", () => {
    const frames = battleFrames(dot());
    const seconds = frames.length / BATTLE_FPS;
    assert.ok(seconds >= 2 && seconds <= 4, `${seconds}s`);
    assert.ok(frames.some((frame) => alphaAt(frame, 5, 4) === 255), "it bounces up");
    assert.ok(frames.some((frame) => alphaAt(frame, 4, 5) === 255), "it winds up");
    assert.ok(frames.some((frame) => alphaAt(frame, 7, 5) === 255), "it lunges forward");
    const colours = new Set(frames.flatMap((frame) => [...frame.subarray((5 * SIZE + 5) * 4, (5 * SIZE + 5) * 4 + 3)].join(",")));
    assert.ok(![...colours].some((colour) => colour !== "200,40,40" && colour !== "0,0,0"), "no white flash");
    assert.deepEqual(frames.at(-1), dot(), "it ends still, so the loop joins up");
  });

  it("everywhere else: just a calm bob", () => {
    const frames = idleFrames(dot());
    assert.ok(frames.every((frame) => alphaAt(frame, 5, 5) === 255 || alphaAt(frame, 5, 4) === 255), "never moves sideways");
    assert.ok(frames.some((frame) => alphaAt(frame, 5, 4) === 255), "it bobs");
  });

  it("puts every frame on black, because Yoto shows GIF transparency as bright green", () => {
    const black = onBlack(dot());
    for (let at = 0; at < black.length; at += 4) assert.equal(black[at + 3], 255, "no clear pixels");
    assert.deepEqual([...black.subarray(0, 4)], [0, 0, 0, 255]);
    assert.deepEqual([...black.subarray((5 * SIZE + 5) * 4, (5 * SIZE + 5) * 4 + 4)], [200, 40, 40, 255]);
  });

  it("makes a 16×16 looping GIF from a real icon, once, with no green in it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-battle-"));
    try {
      for (const motion of ["battle", "idle"] as const) {
        const gif = await ensureBattlePixel(25, dir, motion);
        assert.equal(gif.subarray(0, 4).toString("ascii"), "GIF8");
        assert.equal(gif.readUInt16LE(6), 16);
        assert.equal(gif.readUInt16LE(8), 16);
        assert.ok(gif.includes(Buffer.from("NETSCAPE2.0")), "it loops");
        assert.deepEqual(await ensureBattlePixel(25, dir, motion), gif, "the second time is the saved one");
        const decoded = spawnSync(ffmpegCommand(), ["-loglevel", "error", "-f", "gif", "-i", "pipe:0", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], { input: gif });
        const pixels = decoded.stdout;
        let green = 0;
        for (let at = 0; at < pixels.length; at += 4) {
          if ((pixels[at + 1] ?? 0) > 200 && (pixels[at] ?? 0) < 80 && (pixels[at + 2] ?? 0) < 80) green += 1;
          assert.equal(pixels[at + 3], 255, "every pixel is solid");
        }
        assert.equal(green, 0, "no bright green background");
      }
      await assert.rejects(ensureBattlePixel(0, dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
