import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ensureArtwork, isPng } from "./artwork";

describe("official artwork", () => {
  it("saves a PNG and reuses the file", async () => {
    const PNG = await readFile(path.join(process.cwd(), "public", "sprites", "1.png"));
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-art-"));
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(new Uint8Array(PNG), { status: 200 });
    };
    try {
      const first = await ensureArtwork(3, fetchImpl, dir);
      const second = await ensureArtwork(3, fetchImpl, dir);
      assert.equal(isPng(first), true);
      assert.equal(second.equals(first), true);
      assert.equal(calls, 1);
      assert.equal(isPng(await readFile(path.join(dir, "3.png"))), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("tries the home picture when official artwork is missing", async () => {
    const PNG = await readFile(path.join(process.cwd(), "public", "sprites", "1.png"));
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-art-"));
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("official-artwork")) return new Response("nope", { status: 404 });
      return new Response(new Uint8Array(PNG), { status: 200 });
    };
    try {
      const bytes = await ensureArtwork(10033, fetchImpl, dir);
      assert.equal(isPng(bytes), true);
      assert.equal(urls.length, 2);
      assert.match(urls[0] ?? "", /official-artwork\/10033\.png$/);
      assert.match(urls[1] ?? "", /home\/10033\.png$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a download that is not a PNG", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-art-"));
    const fetchImpl: typeof fetch = async () => new Response("<html></html>", { status: 200 });
    try {
      await assert.rejects(() => ensureArtwork(6, fetchImpl, dir), /could not be downloaded/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
