import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { lyricsFromHtml, lyricsSection, loadSongLyrics } from "./song-lyrics";

describe("song lyrics", () => {
  it("keeps every verse and language heading", () => {
    const html = `
      <h2><span class="mw-headline">Lyrics</span><span class="mw-editsection">[edit]</span></h2>
      <h3>English</h3>
      <p>I wanna be the very best<br />Like no one ever was</p>
      <h3>Japanese</h3>
      <p>かくとう ポケモン<sup>1</sup></p>
    `;
    assert.equal(
      lyricsFromHtml(html),
      ["Lyrics", "", "English", "", "I wanna be the very best", "Like no one ever was", "", "Japanese", "", "かくとう ポケモン"].join("\n"),
    );
  });

  it("finds the lyrics heading and saves the section text", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lyrics-"));
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      const body = url.includes("prop=sections")
        ? { parse: { sections: [{ line: "Trivia", index: "1" }, { line: "Lyrics", index: "2" }] } }
        : { parse: { text: "<p>Verse one<br>Verse two</p>" } };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const lyrics = await loadSongLyrics("Pokémon_Theme", { fetchImpl, cacheDir: dir, sleep: async () => {} });
    assert.equal(lyrics, "Verse one\nVerse two");
    const saved = JSON.parse(await readFile(path.join(dir, `${encodeURIComponent("Pokémon_Theme")}.json`), "utf8")) as {
      lyrics: string;
    };
    assert.equal(saved.lyrics, lyrics);
    assert.equal(lyricsSection([{ line: "Lyrics", index: "2" }])?.index, "2");
  });
});
