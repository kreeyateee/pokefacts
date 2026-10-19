import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { getCatalogueEntry } from "./catalogue-db";
import { dexBlurb, type MonSheet } from "./dex-facts";
import { GET } from "../app/api/catalogue/[id]/biology/route";
import {
  BULBAPEDIA_API,
  BULBAPEDIA_USER_AGENT,
  biologyBlocks,
  bulbapediaArticleUrl,
  loadBiology,
  wikiPageTitle,
} from "./bulbapedia";

const HTML = `
<div class="mw-parser-output">
  <h2><span class="mw-headline" id="Biology">Biology</span><span class="mw-editsection"><span class="mw-editsection-bracket">[</span><a href="/w/index.php?title=Bulbasaur_(Pok%C3%A9mon)&amp;action=edit&amp;section=1">edit</a><span class="mw-editsection-bracket">]</span></span></h2>
  <table class="roundy infobox"><tr><td>SECRETTYPEBOX Poison</td></tr></table>
  <figure class="mw-halign-left"><a href="/wiki/File:Bulbasaur.jpg"><img src="/bulb.png" /></a><figcaption>Bulbasaur using its vines to climb a tree</figcaption></figure>
  <p>Bulbasaur is a small, quadrupedal amphibian Pokémon that has blue-green skin with darker patches. The bulb also provides it with energy.<sup id="cite_ref-1" class="reference"><a href="#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup></p>
  <ul>
    <li>It naps in bright sunlight.</li>
    <li>It lives in grasslands.</li>
  </ul>
  <h3><span class="mw-headline" id="Physiology">Physiology</span><span class="mw-editsection"><a href="/edit">edit</a></span></h3>
  <p>Each thick leg ends with three sharp claws.</p>
  <h3><span class="mw-headline" id="Evolution">Evolution</span></h3>
  <p>Bulbasaur evolves into <a href="/wiki/Ivysaur_(Pok%C3%A9mon)">Ivysaur</a>, which evolves into Venusaur.</p>
  <p>(For specifics on this Pokémon's Evolution in the games, refer to Game data→Evolution data.)</p>
  <table class="roundy"><tr><td>Evobox SECRETTYPEBOX</td></tr></table>
  <div class="mw-references-wrap"><ol class="references"><li>A Mudkip Mission</li></ol></div>
  <h2><span class="mw-headline" id="Game_data">Game data</span></h2>
  <p>This Pokédex table must stay off the biology section.</p>
</div>
`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Bulbapedia biology", () => {
  it("turns Biology HTML into prose and keeps the subsections", () => {
    const blocks = biologyBlocks(HTML);
    const text = blocks
      .map((block) => (block.kind === "list" ? block.items.join(" ") : block.text))
      .join("\n");
    assert.match(text, /quadrupedal amphibian Pokémon/);
    assert.match(text, /using its vines to climb a tree/);
    assert.match(text, /naps in bright sunlight/);
    assert.match(text, /Physiology/);
    assert.match(text, /three sharp claws/);
    assert.match(text, /evolves into Ivysaur, which evolves into Venusaur/);
    assert.doesNotMatch(text, /\s+[.,]/);
    assert.equal(
      blocks.some((block) => block.kind === "heading" && block.text === "Physiology"),
      true,
    );
    assert.equal(
      blocks.some((block) => block.kind === "heading" && block.text === "Evolution"),
      true,
    );
    assert.doesNotMatch(text, /SECRETTYPEBOX|\[edit\]|\bedit\b|\[1\]|Mudkip Mission|Game data|Pokédex table|For specifics/i);
    assert.equal(
      blocks.some((block) => block.kind === "heading" && block.text === "Biology"),
      false,
    );
  });

  it("builds wiki titles for names that are not plain words", () => {
    assert.equal(wikiPageTitle("Bulbasaur"), "Bulbasaur_(Pokémon)");
    assert.equal(wikiPageTitle("Mr. Mime"), "Mr._Mime_(Pokémon)");
    assert.equal(wikiPageTitle("Type: Null"), "Type:_Null_(Pokémon)");
    assert.equal(wikiPageTitle("Farfetch\u2019d"), "Farfetch'd_(Pokémon)");
    assert.equal(wikiPageTitle("Sirfetch\u2019d"), "Sirfetch'd_(Pokémon)");
    assert.equal(wikiPageTitle("Nidoran\u2640"), "Nidoran\u2640_(Pokémon)");
    assert.equal(wikiPageTitle("Nidoran\u2642"), "Nidoran\u2642_(Pokémon)");
    assert.equal(wikiPageTitle("Flab\u00e9b\u00e9"), "Flab\u00e9b\u00e9_(Pokémon)");
    assert.equal(
      bulbapediaArticleUrl("Mr. Mime"),
      "https://bulbapedia.bulbagarden.net/wiki/Mr._Mime_(Pok%C3%A9mon)",
    );

    const farfetchd = getCatalogueEntry(83);
    const mime = getCatalogueEntry(122);
    const female = getCatalogueEntry(29);
    const male = getCatalogueEntry(32);
    const typeNull = getCatalogueEntry(772);
    const flabebe = getCatalogueEntry(669);
    const sirfetchd = getCatalogueEntry(865);
    assert.ok(farfetchd && mime && female && male && typeNull && flabebe && sirfetchd);
    assert.equal(wikiPageTitle(farfetchd.name), "Farfetch'd_(Pokémon)");
    assert.equal(wikiPageTitle(sirfetchd.name), "Sirfetch'd_(Pokémon)");
    assert.equal(wikiPageTitle(mime.name), "Mr._Mime_(Pokémon)");
    assert.equal(wikiPageTitle(typeNull.name), "Type:_Null_(Pokémon)");
    assert.equal(wikiPageTitle(female.name), "Nidoran\u2640_(Pokémon)");
    assert.equal(wikiPageTitle(male.name), "Nidoran\u2642_(Pokémon)");
    assert.equal(wikiPageTitle(flabebe.name), "Flab\u00e9b\u00e9_(Pokémon)");
  });

  it("caches a lead and skips the wiki line without dropping the Pokédex fact", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-"));
    const cacheFile = path.join(dir, "biology.json");
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url.toString());
      assert.equal(url.origin + url.pathname, new URL(BULBAPEDIA_API).origin + new URL(BULBAPEDIA_API).pathname);
      assert.equal(url.searchParams.get("maxlag"), "5");
      assert.equal(url.searchParams.get("action"), "parse");
      assert.equal(url.searchParams.get("format"), "json");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("user-agent"), BULBAPEDIA_USER_AGENT);
      if (url.searchParams.get("prop") === "sections") {
        assert.equal(url.searchParams.get("page"), "Bulbasaur_(Pokémon)");
        return jsonResponse({
          parse: {
            sections: [
              { toclevel: 1, level: "2", line: "Biology", index: "4", anchor: "Biology" },
              { toclevel: 2, level: "3", line: "Physiology", index: "5", anchor: "Physiology" },
              { toclevel: 1, level: "2", line: "Game data", index: "9", anchor: "Game_data" },
            ],
          },
        });
      }
      assert.equal(url.searchParams.get("prop"), "text");
      assert.equal(url.searchParams.get("section"), "4");
      return jsonResponse({ parse: { text: HTML } });
    }) as typeof fetch;

    try {
      const first = await loadBiology("Bulbasaur", 1, { fetchImpl, cacheFile, sleep: async () => undefined });
      const second = await loadBiology("Bulbasaur", 1, { fetchImpl, cacheFile, sleep: async () => undefined });
      assert.equal(first.status, "ready");
      assert.equal(second.status, "ready");
      assert.match(first.blocks.map((block) => (block.kind === "list" ? block.items.join(" ") : block.text)).join(" "), /quadrupedal/);
      assert.equal(calls.length, 2);

      const sheet: MonSheet = {
        id: 1,
        slug: "bulbasaur",
        name: "Bulbasaur",
        genus: "Seed Pokémon",
        types: ["grass", "poison"],
        heightDecimetres: 7,
        weightHectograms: 69,
        stats: [],
        abilityName: "Overgrow",
        abilityEffect: "Powers up Grass-type moves when the Pokémon's HP is low.",
        evolution: "Bulbasaur becomes Ivysaur at level 16.",
        habitat: "Look for it in grassland.",
        entries: [
          {
            text: "While it is young, it uses the nutrients that are stored in the seed on its back in order to grow.",
            version: "shield",
          },
        ],
      };
      const spoken = dexBlurb(sheet, "1");
      assert.match(spoken, /nutrients that are stored in the seed/);
      assert.doesNotMatch(spoken, /Bulbapedia|Creative Commons|quadrupedal amphibian/i);
      assert.equal(calls.length, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records a missing Biology section and still leaves the Pokédex fact", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-miss-"));
    const cacheFile = path.join(dir, "biology.json");
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({
        parse: { sections: [{ toclevel: 1, line: "Game data", index: "1", anchor: "Game_data" }] },
      });
    }) as typeof fetch;

    try {
      const missing = await loadBiology("Mew", 151, { fetchImpl, cacheFile, sleep: async () => undefined });
      const again = await loadBiology("Mew", 151, { fetchImpl, cacheFile, sleep: async () => undefined });
      assert.equal(missing.status, "missing");
      assert.deepEqual(missing.blocks, []);
      assert.equal(again.status, "missing");
      assert.equal(calls, 1);
      const spoken = dexBlurb(
        {
          id: 151,
          slug: "mew",
          name: "Mew",
          genus: "New Species Pokémon",
          types: ["psychic"],
          heightDecimetres: 4,
          weightHectograms: 40,
          stats: [],
          abilityName: null,
          abilityEffect: null,
          evolution: "",
          habitat: null,
          entries: [{ text: "So rare that it is still said to be a mirage by many experts. It was created by a scientist.", version: "red" }],
        },
        "151",
      );
      assert.match(spoken, /Mew/);
      assert.match(spoken, /mirage/);
      assert.doesNotMatch(spoken, /Bulbapedia/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not cache a wiki failure", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-down-"));
    const cacheFile = path.join(dir, "biology.json");
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: { code: "maxlag", info: "Waiting", lag: 5 } }, 503);
      return jsonResponse({ error: { code: "internal", info: "down" } }, 500);
    }) as typeof fetch;

    try {
      await assert.rejects(
        loadBiology("Bulbasaur", 1, { fetchImpl, cacheFile, sleep: async () => undefined }),
      );
      assert.equal(calls, 2);
      await assert.rejects(
        loadBiology("Bulbasaur", 1, { fetchImpl, cacheFile, sleep: async () => undefined }),
      );
      assert.equal(calls, 3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("answers 404 for a number that is not a species", async () => {
    const response = await GET(new Request("http://127.0.0.1/api/catalogue/999999/biology"), {
      params: Promise.resolve({ id: "999999" }),
    });
    assert.equal(response.status, 404);
  });
});
