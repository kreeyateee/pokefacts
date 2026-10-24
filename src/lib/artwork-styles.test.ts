import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ensureStyleArtwork, isArtworkStyle, LAST_DREAM_WORLD, looksLike } from "@/lib/artwork-styles";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const GIF = Buffer.from("GIF89a....");
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe("other artwork", () => {
  it("knows its styles and checks each file is the picture it claims to be", () => {
    assert.ok(isArtworkStyle("shiny") && isArtworkStyle("dream") && isArtworkStyle("battle"));
    assert.ok(!isArtworkStyle("species") && !isArtworkStyle("../x"));
    assert.ok(looksLike("png", PNG) && !looksLike("png", GIF));
    assert.ok(looksLike("gif", GIF) && !looksLike("gif", PNG));
    assert.ok(looksLike("svg", SVG));
    assert.ok(!looksLike("svg", Buffer.from("<html><body>Not found</body></html>")), "an error page is not a picture");
  });

  it("downloads each style from its own place once, then serves it from the server", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-styles-"));
    try {
      const asked: string[] = [];
      const fetchImpl = (async (url: string) => {
        asked.push(String(url));
        if (String(url).includes("/official-artwork/shiny/25.png")) return new Response(PNG);
        if (String(url).includes("/dream-world/25.svg")) return new Response(SVG);
        if (String(url).includes("/showdown/25.gif")) return new Response("missing", { status: 404 });
        if (String(url).includes("/black-white/animated/25.gif")) return new Response(GIF);
        return new Response("missing", { status: 404 });
      }) as typeof fetch;
      const shiny = await ensureStyleArtwork("shiny", 25, fetchImpl, dir);
      assert.equal(shiny.type, "image/png");
      const dream = await ensureStyleArtwork("dream", 25, fetchImpl, dir);
      assert.equal(dream.type, "image/svg+xml");
      // Showdown has no sprite for it here, so the animated Black and White sprite stands in.
      const battle = await ensureStyleArtwork("battle", 25, fetchImpl, dir);
      assert.equal(battle.type, "image/gif");
      const before = asked.length;
      await ensureStyleArtwork("shiny", 25, fetchImpl, dir);
      assert.equal(asked.length, before, "the second time comes from the server's copy");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("has no Dream World art after the fifth generation, and refuses other numbers", async () => {
    const never = (async () => {
      throw new Error("should not be asked");
    }) as typeof fetch;
    await assert.rejects(ensureStyleArtwork("dream", LAST_DREAM_WORLD + 1, never));
    await assert.rejects(ensureStyleArtwork("shiny", 0, never));
    await assert.rejects(ensureStyleArtwork("battle", 1026, never));
  });
});
