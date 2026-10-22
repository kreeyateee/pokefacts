import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ensureFormPixel } from "./form-pixel";
import { readPngRgba } from "./pixel-paint";

describe("form pixels", () => {
  it("paints a 16×16 icon from the form artwork and reuses it", async () => {
    const artwork = await readFile(path.join(process.cwd(), "public", "sprites", "1.png"));
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-form-pixel-"));
    try {
      const first = await ensureFormPixel(10033, { cacheDir: dir, artwork });
      const decoded = readPngRgba(first);
      assert.equal(decoded.width, 16);
      assert.equal(decoded.height, 16);
      let coloured = false;
      for (let index = 0; index < decoded.rgba.length; index += 4) {
        assert.equal(decoded.rgba[index + 3], 255);
        const white = decoded.rgba[index] === 255 && decoded.rgba[index + 1] === 255 && decoded.rgba[index + 2] === 255;
        if (!white) coloured = true;
      }
      assert.equal(coloured, true);
      let occupiedRows = 0;
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const i = (y * 16 + x) * 4;
          const white =
            decoded.rgba[i] === 255 && decoded.rgba[i + 1] === 255 && decoded.rgba[i + 2] === 255;
          if (!white) {
            occupiedRows += 1;
            break;
          }
        }
      }
      assert.ok(occupiedRows >= 12, `form icon should fill the Yoto face (${occupiedRows} rows).`);
      const species = await readFile(path.join(process.cwd(), "public", "pixels", "3.png"));
      assert.equal(first.equals(species), false);
      const second = await ensureFormPixel(10033, { cacheDir: dir, artwork: Buffer.from("not a png") });
      assert.equal(second.equals(first), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
