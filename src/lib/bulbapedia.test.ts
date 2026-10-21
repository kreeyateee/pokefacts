import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  BULBAPEDIA_DELAY_MAX_MS,
  BULBAPEDIA_DELAY_MIN_MS,
  bulbapediaArticleUrl,
  bulbapediaDelayMs,
  loadBiology,
  loadFactSpeech,
  wikiPageTitle,
  WIKI_TIMEOUT_TRIES,
} from "./bulbapedia";
import { formWikiTitle, loadFormProse, loadFormSpeech, pickFormSection } from "./form-prose";
import { leadParagraphs, spokenFact, spokenForm, spokenWiki, statusWithDexNote, WIKI_DEX_NOTE } from "./spoken-wiki";
import type { BiologyBlock } from "./catalogue-types";

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
  it("picks a delay inside the polite range", () => {
    assert.equal(bulbapediaDelayMs(() => 0), BULBAPEDIA_DELAY_MIN_MS);
    assert.equal(bulbapediaDelayMs(() => 1), BULBAPEDIA_DELAY_MAX_MS);
    assert.equal(bulbapediaDelayMs(() => 0.5), 725);
    assert.equal(bulbapediaDelayMs(() => Number.NaN), BULBAPEDIA_DELAY_MIN_MS);
  });

  it("waits before each Bulbapedia read and skips the wait when the page is cached", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-pace-"));
    const cacheFile = path.join(dir, "biology.json");
    const pauses: number[] = [];
    let fetches = 0;
    const fetchImpl = (async () => {
      fetches += 1;
      assert.equal(pauses.length, fetches);
      if (fetches === 1) {
        return jsonResponse({
          parse: {
            sections: [{ toclevel: 1, level: "2", line: "Biology", index: "1", anchor: "Biology" }],
          },
        });
      }
      return jsonResponse({
        parse: { text: "<h2>Biology</h2><p>Bulbasaur keeps this paragraph.</p>" },
      });
    }) as typeof fetch;
    try {
      const first = await loadBiology("Bulbasaur", 1, {
        fetchImpl,
        cacheFile,
        sleep: async (ms) => {
          pauses.push(ms);
        },
      });
      assert.equal(first.status, "ready");
      assert.equal(fetches, 2);
      assert.equal(pauses.length, 2);
      for (const pause of pauses) {
        assert.ok(pause >= BULBAPEDIA_DELAY_MIN_MS && pause <= BULBAPEDIA_DELAY_MAX_MS);
      }
      const again = await loadBiology("Bulbasaur", 1, {
        fetchImpl: (async () => {
          throw new Error("cached biology was fetched again");
        }) as typeof fetch,
        cacheFile,
        sleep: async (ms) => {
          pauses.push(ms);
        },
      });
      assert.equal(again.status, "ready");
      assert.equal(pauses.length, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("turns Biology HTML into prose and keeps the subsections", () => {
    const blocks = biologyBlocks(HTML);
    const text = blocks
      .map((block) => (block.kind === "list" ? block.items.join(" ") : block.text))
      .join("\n");
    assert.match(text, /quadrupedal amphibian Pokémon/);
    assert.doesNotMatch(text, /using its vines to climb a tree/);
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

  it("keeps Venusaur's Biology prose when a contents box comes first", () => {
    const html = `
      <div class="mw-parser-output">
        <div id="toc" class="toc" role="navigation" aria-labelledby="mw-toc-heading">
          <h2 id="mw-toc-heading">Contents</h2>
          <ul>
            <li class="toclevel-1"><a href="#Biology"><span class="toctext">Biology</span></a>
              <ul><li class="toclevel-2"><a href="#Forms"><span class="toctext">Forms</span></a></li></ul>
            </li>
          </ul>
        </div>
        <h2><span class="mw-headline" id="Biology">Biology</span><span class="mw-editsection"><a href="/w/index.php?action=edit">edit</a></span></h2>
        <figure class="mw-halign-left" typeof="mw:File/Thumb"><img src="/leaves.png" /><figcaption>Venusaur with its leaves closed</figcaption></figure>
        <p>Venusaur is a squat, quadrupedal amphibian Pokémon with bumpy, blue-green skin. It has small, circular red eyes and a short, blunt snout.<sup class="reference"><a href="#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup></p>
        <h3><span class="mw-headline" id="Forms">Forms</span></h3>
        <p>Venusaur has two forms: Mega Venusaur and Gigantamax Venusaur.</p>
        <h2><span class="mw-headline" id="Game_data">Game data</span></h2>
        <p>This Pokédex table must stay off the biology section.</p>
      </div>
    `;
    const blocks = biologyBlocks(html);
    const text = blocks
      .map((block) => (block.kind === "list" ? block.items.join(" ") : block.text))
      .join("\n");
    assert.match(text, /squat, quadrupedal amphibian Pokémon/);
    assert.match(text, /short, blunt snout/);
    assert.match(text, /Forms/);
    assert.match(text, /Mega Venusaur and Gigantamax Venusaur/);
    assert.doesNotMatch(text, /leaves closed|Contents|Game data|Pokédex table|\[1\]|\[edit\]/i);
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

  it("stores two species at once without dropping either row", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-parallel-"));
    const cacheFile = path.join(dir, "biology.json");
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = url.searchParams.get("page") ?? "";
      if (url.searchParams.get("prop") === "sections") {
        return jsonResponse({
          parse: {
            sections: [{ toclevel: 1, level: "2", line: "Biology", index: "1", anchor: "Biology" }],
          },
        });
      }
      const name = page.startsWith("Ivysaur") ? "Ivysaur" : "Bulbasaur";
      return jsonResponse({
        parse: { text: `<h2><span class="mw-headline" id="Biology">Biology</span></h2><p>${name} keeps this paragraph.</p>` },
      });
    }) as typeof fetch;
    try {
      const [first, second] = await Promise.all([
        loadBiology("Bulbasaur", 1, { fetchImpl, cacheFile, sleep: async () => undefined }),
        loadBiology("Ivysaur", 2, { fetchImpl, cacheFile, sleep: async () => undefined }),
      ]);
      assert.equal(first.status, "ready");
      assert.equal(second.status, "ready");
      const saved = JSON.parse(await readFile(cacheFile, "utf8")) as Record<string, { name?: string }>;
      assert.equal(saved["1"]?.name, "Bulbasaur");
      assert.equal(saved["2"]?.name, "Ivysaur");
      let refetched = 0;
      const again = await loadBiology("Bulbasaur", 1, {
        fetchImpl: (async () => {
          refetched += 1;
          throw new Error("cached biology was fetched again");
        }) as typeof fetch,
        cacheFile,
        sleep: async () => undefined,
      });
      assert.equal(refetched, 0);
      assert.equal(again.status, "ready");
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

  it("speaks only the first two biology paragraphs and leaves Bulbapedia off the track", () => {
    const blocks: BiologyBlock[] = [
      { kind: "paragraph", text: "One. The first biology paragraph is about the bulb." },
      {
        kind: "paragraph",
        text: "Two. The second biology paragraph is about the sun. This line is from Bulbapedia and must not be read.",
      },
      { kind: "paragraph", text: "Three. The third biology paragraph is about the soil." },
      { kind: "heading", level: 3, text: "Physiology" },
      { kind: "paragraph", text: "Four. Later physiology must stay unspoken." },
    ];
    const spoken = spokenWiki("Bulbasaur", blocks);
    assert.match(spoken, /^Bulbasaur\./);
    assert.match(spoken, /first biology paragraph is about the bulb/);
    assert.match(spoken, /second biology paragraph is about the sun/);
    assert.doesNotMatch(spoken, /third biology paragraph|Later physiology|Bulbapedia|Creative Commons/i);
    assert.equal(leadParagraphs(blocks).length, 2);

    const venusaur = spokenWiki("Venusaur", biologyBlocks(`
      <div class="mw-parser-output">
        <div id="toc" class="toc"><h2 id="mw-toc-heading">Contents</h2></div>
        <h2><span class="mw-headline" id="Biology">Biology</span></h2>
        <figure><figcaption>Venusaur with its leaves closed</figcaption></figure>
        <p>Venusaur is a squat, quadrupedal amphibian Pokémon with bumpy, blue-green skin. It has small, circular red eyes and a short, blunt snout.</p>
        <h3><span class="mw-headline" id="Forms">Forms</span></h3>
        <p>Venusaur has two forms: Mega Venusaur and Gigantamax Venusaur.</p>
      </div>
    `));
    assert.match(venusaur, /squat, quadrupedal amphibian Pokémon/);
    assert.match(venusaur, /short, blunt snout/);
    assert.doesNotMatch(venusaur, /leaves closed|Mega Venusaur and Gigantamax|Bulbapedia|Creative Commons/i);
  });

  it("picks the form section instead of species Biology", () => {
    const sections = [
      { index: "1", line: "Biology", anchor: "Biology" },
      { index: "3", line: "Mega Charizard X", anchor: "Mega_Charizard_X" },
      { index: "27", line: "Mega Charizard X", anchor: "Mega_Charizard_X_2" },
      { index: "5", line: "Gigantamax Charizard", anchor: "Gigantamax_Charizard" },
      { index: "39", line: "Mega Evolution", anchor: "Mega_Evolution" },
    ];
    assert.equal(pickFormSection(sections, "Mega Charizard X")?.index, "3");
    assert.equal(pickFormSection(sections, "Gigantamax Charizard")?.index, "5");
    assert.equal(pickFormSection(sections, "Gigantamax Amped Toxtricity")?.line, undefined);
    assert.equal(
      pickFormSection(
        [{ index: "8", line: "Gigantamax Toxtricity", anchor: "Gigantamax_Toxtricity" }],
        "Gigantamax Amped Toxtricity",
      )?.index,
      "8",
    );
    assert.equal(formWikiTitle("Mega Charizard X"), "Mega_Charizard_X");
    assert.equal(formWikiTitle("Mega Meowstic (Male)"), "Mega_Meowstic");
    assert.equal(
      pickFormSection(
        [{ index: "4", line: "Mega Meowstic", anchor: "Mega_Meowstic" }],
        "Mega Meowstic (Male)",
      )?.index,
      "4",
    );
  });

  it("reads Mega Venusaur from its section and Gigantamax Charizard from its section", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-form-"));
    const cacheFile = path.join(dir, "forms.json");
    const calls: string[] = [];
    const megaHtml = `
      <h4><span class="mw-headline" id="Mega_Venusaur">Mega Venusaur</span><span class="mw-editsection"><a href="/edit">edit</a></span></h4>
      <figure class="mw-halign-left"><figcaption>Mega Venusaur with its flower open</figcaption></figure>
      <p>Mega Venusaur's flower grows more prominent, and two smaller pink flowers bloom, one on its forehead and one on its rear.</p>
      <p>Mega Venusaur's legs and back have become sturdier to support the extra weight of the flower.<sup class="reference"><a href="#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup></p>
      <p>A third paragraph about the brambles should stay unspoken.</p>
    `;
    const speciesHtml = `<p>Venusaur is a squat, quadrupedal amphibian Pokémon with bumpy, blue-green skin.</p>`;
    const gmaxHtml = `
      <h4><span id="Gigantamax_Charizard">Gigantamax Charizard</span></h4>
      <figure><figcaption>Gigantamax Charizard's wingless body</figcaption></figure>
      <p>Gigantamax Charizard's belly is now white instead of its normal cream coloration.</p>
      <p>Its wings burn hotter while it is this size.</p>
      <p>Charizard is a draconic, bipedal Pokémon. This species Biology sentence must stay unspoken.</p>
    `;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(`${url.searchParams.get("page")}|${url.searchParams.get("prop")}|${url.searchParams.get("section") ?? ""}`);
      const page = url.searchParams.get("page");
      const prop = url.searchParams.get("prop");
      if (page === "Mega_Venusaur" && prop === "sections") {
        return jsonResponse({
          parse: {
            title: "Venusaur (Pokémon)",
            redirects: [{ from: "Mega Venusaur", to: "Venusaur (Pokémon)" }],
            sections: [
              { toclevel: 1, line: "Biology", index: "1", anchor: "Biology" },
              { toclevel: 3, line: "Mega Venusaur", index: "3", anchor: "Mega_Venusaur" },
            ],
          },
        });
      }
      if (page === "Gigantamax_Charizard") {
        return jsonResponse({ error: { code: "missingtitle", info: "The page you specified doesn't exist." } }, 404);
      }
      if (page === "Charizard_(Pokémon)" && prop === "sections") {
        return jsonResponse({
          parse: {
            title: "Charizard (Pokémon)",
            sections: [
              { toclevel: 1, line: "Biology", index: "1", anchor: "Biology" },
              { toclevel: 3, line: "Gigantamax Charizard", index: "5", anchor: "Gigantamax_Charizard" },
            ],
          },
        });
      }
      if (prop === "text") {
        assert.notEqual(url.searchParams.get("section"), "1");
        if (page === "Venusaur_(Pokémon)") {
          assert.equal(url.searchParams.get("section"), "3");
          return jsonResponse({ parse: { text: megaHtml } });
        }
        assert.equal(page, "Charizard_(Pokémon)");
        assert.equal(url.searchParams.get("section"), "5");
        return jsonResponse({ parse: { text: gmaxHtml } });
      }
      return jsonResponse({ parse: { text: speciesHtml } });
    }) as typeof fetch;

    try {
      const mega = await loadFormProse(
        { formId: 10033, speciesId: 3, speciesName: "Venusaur", formName: "Mega Venusaur" },
        { fetchImpl, cacheFile, sleep: async () => undefined },
      );
      const again = await loadFormProse(
        { formId: 10033, speciesId: 3, speciesName: "Venusaur", formName: "Mega Venusaur" },
        { fetchImpl, cacheFile, sleep: async () => undefined },
      );
      const spoken = spokenWiki("Mega Venusaur", mega.blocks);
      assert.equal(again.status, mega.status);
      assert.match(spoken, /flower grows more prominent/);
      assert.match(spoken, /sturdier to support the extra weight/);
      assert.doesNotMatch(spoken, /squat, quadrupedal|brambles should stay|flower open|\[1\]|Bulbapedia/i);
      assert.match(mega.url, /Venusaur_\(Pok%C3%A9mon\)#Mega_Venusaur/);

      const gmax = await loadFormProse(
        { formId: 10196, speciesId: 6, speciesName: "Charizard", formName: "Gigantamax Charizard" },
        { fetchImpl, cacheFile, sleep: async () => undefined },
      );
      const gmaxSpoken = spokenWiki("Gigantamax Charizard", gmax.blocks);
      assert.match(gmaxSpoken, /belly is now white/);
      assert.match(gmaxSpoken, /wings burn hotter/);
      assert.doesNotMatch(gmaxSpoken, /draconic, bipedal|wingless body|Bulbapedia/i);
      const after = calls.length;
      await loadFormProse(
        { formId: 10033, speciesId: 3, speciesName: "Venusaur", formName: "Mega Venusaur" },
        { fetchImpl, cacheFile, sleep: async () => undefined },
      );
      assert.equal(calls.length, after);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses the species biology when a Mega form has no prose, and the form text when it does", () => {
    const species: BiologyBlock[] = [
      { kind: "paragraph", text: "One. The first biology paragraph is about the crest." },
      {
        kind: "paragraph",
        text: "Two. The second biology paragraph is about the wind. This line is from Bulbapedia and must not be read.",
      },
      { kind: "paragraph", text: "Three. The third biology paragraph is about the forest." },
    ];
    const missing = spokenForm(
      "Mega Pidgeot",
      [{ kind: "paragraph", text: "It can Mega Evolve." }],
      "Pidgeot",
      species,
    );
    assert.equal(missing, spokenWiki("Pidgeot", species));
    assert.match(missing, /first biology paragraph is about the crest/);
    assert.match(missing, /second biology paragraph is about the wind/);
    assert.doesNotMatch(missing, /third biology paragraph|Bulbapedia|It can Mega Evolve/i);
    assert.ok(missing.length <= 1200);

    const formText = spokenForm(
      "Mega Venusaur",
      [
        { kind: "heading", level: 4, text: "Mega Venusaur" },
        {
          kind: "paragraph",
          text: "Mega Venusaur's flower grows more prominent, and two smaller pink flowers bloom.",
        },
        {
          kind: "paragraph",
          text: "Mega Venusaur's legs and back have become sturdier to support the extra weight of the flower.",
        },
      ],
      "Venusaur",
      [
        {
          kind: "paragraph",
          text: "Venusaur is a squat, quadrupedal amphibian Pokémon. This species Biology sentence must stay unspoken.",
        },
      ],
    );
    assert.match(formText, /flower grows more prominent/);
    assert.match(formText, /sturdier to support the extra weight/);
    assert.doesNotMatch(formText, /squat, quadrupedal|Bulbapedia/);

    const gmax = spokenForm("Gigantamax Butterfree", [], "Butterfree", [
      { kind: "paragraph", text: "Butterfree is a butterfly Pokémon with violet wings." },
      { kind: "paragraph", text: "It collects honey from flowers." },
      { kind: "paragraph", text: "A third paragraph stays unspoken." },
    ]);
    assert.equal(gmax.startsWith("Butterfree."), true);
    assert.match(gmax, /violet wings/);
    assert.match(gmax, /collects honey/);
    assert.doesNotMatch(gmax, /third paragraph|Bulbapedia|Gigantamax/);
  });

  it("loads species biology when the Mega page is missing and keeps form prose when the section exists", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-form-speech-"));
    const missingFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = url.searchParams.get("page");
      const prop = url.searchParams.get("prop");
      const section = url.searchParams.get("section") ?? "";
      if (page === "Mega_Pidgeot") {
        return jsonResponse({ error: { code: "missingtitle", info: "The page you specified doesn't exist." } }, 404);
      }
      if (prop === "sections") {
        return jsonResponse({
          parse: {
            title: "Pidgeot (Pokémon)",
            sections: [{ toclevel: 1, line: "Biology", index: "1", anchor: "Biology" }],
          },
        });
      }
      if (prop === "text" && section === "1") {
        return jsonResponse({
          parse: {
            text: `<div class="mw-parser-output">
              <div id="toc" class="toc"><h2 id="mw-toc-heading">Contents</h2></div>
              <figure><figcaption>Pidgeot in flight</figcaption></figure>
              <p>One. The first biology paragraph is about the crest.</p>
              <p>Two. The second biology paragraph is about the wind. This line is from Bulbapedia and must not be read.</p>
              <h3><span class="mw-headline" id="Forms">Forms</span></h3>
              <p>It can Mega Evolve.</p>
              <p>Three. The third biology paragraph is about the forest.</p>
            </div>`,
          },
        });
      }
      throw new Error(`Unexpected ${page} ${prop} ${section}`);
    }) as typeof fetch;

    let readBiology = false;
    const formFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = url.searchParams.get("page");
      const prop = url.searchParams.get("prop");
      const section = url.searchParams.get("section") ?? "";
      if (page === "Mega_Venusaur" && prop === "sections") {
        return jsonResponse({
          parse: {
            title: "Venusaur (Pokémon)",
            redirects: [{ from: "Mega Venusaur", to: "Venusaur (Pokémon)" }],
            sections: [
              { toclevel: 1, line: "Biology", index: "1", anchor: "Biology" },
              { toclevel: 3, line: "Mega Venusaur", index: "3", anchor: "Mega_Venusaur" },
            ],
          },
        });
      }
      if (prop === "text" && section === "1") {
        readBiology = true;
        return jsonResponse({
          parse: { text: "<p>Venusaur is a squat, quadrupedal amphibian Pokémon.</p>" },
        });
      }
      if (prop === "text" && section === "3") {
        return jsonResponse({
          parse: {
            text: `<p>Mega Venusaur's flower grows more prominent, and two smaller pink flowers bloom.</p>
              <p>Mega Venusaur's legs and back have become sturdier to support the extra weight of the flower.</p>`,
          },
        });
      }
      throw new Error(`Unexpected ${page} ${prop} ${section}`);
    }) as typeof fetch;

    try {
      const missing = await loadFormSpeech(
        { formId: 10073, speciesId: 18, speciesName: "Pidgeot", formName: "Mega Pidgeot" },
        {
          fetchImpl: missingFetch,
          cacheFile: path.join(dir, "missing-forms.json"),
          biologyCacheFile: path.join(dir, "missing-biology.json"),
          sleep: async () => undefined,
        },
      );
      assert.match(missing.speech, /first biology paragraph is about the crest/);
      assert.match(missing.speech, /second biology paragraph is about the wind/);
      assert.doesNotMatch(missing.speech, /third biology paragraph|Bulbapedia|in flight|It can Mega Evolve|Contents/i);
      assert.equal(missing.speech.startsWith("Pidgeot."), true);

      const present = await loadFormSpeech(
        { formId: 10033, speciesId: 3, speciesName: "Venusaur", formName: "Mega Venusaur" },
        {
          fetchImpl: formFetch,
          cacheFile: path.join(dir, "form-forms.json"),
          biologyCacheFile: path.join(dir, "form-biology.json"),
          sleep: async () => undefined,
        },
      );
      assert.equal(readBiology, false);
      assert.match(present.speech, /flower grows more prominent/);
      assert.match(present.speech, /sturdier to support the extra weight/);
      assert.doesNotMatch(present.speech, /squat, quadrupedal|Bulbapedia/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads Mega Pidgeot from the Forms section, not the species opener or the stats heading", async () => {
    const sections = [
      { index: "1", line: "Biology", anchor: "Biology" },
      { index: "2", line: "Forms", anchor: "Forms" },
      { index: "4", line: "Game data", anchor: "Game_data" },
      { index: "17", line: "Mega Pidgeot", anchor: "Mega_Pidgeot" },
      { index: "27", line: "Mega Evolution", anchor: "Mega_Evolution" },
    ];
    assert.equal(pickFormSection(sections, "Mega Pidgeot")?.index, "2");
    assert.equal(pickFormSection(sections, "Mega Pidgeot")?.line, "Forms");

    const formsHtml = `
      <h3><span class="mw-headline" id="Forms">Forms</span><span class="mw-editsection"><a href="/edit">edit</a></span></h3>
      <p>Pidgeot can <a href="/wiki/Mega_Evolution">Mega Evolve</a> into Mega Pidgeot.</p>
      <figure><figcaption>Mega Pidgeot</figcaption></figure>
      <p>Pidgeot grows noticeably when it <a href="/wiki/Mega_Evolution">Mega Evolves</a>, developing a larger body and longer, broader wings. Its wingtips and tail feathers are tipped with cyan, and its cream coloring is now white. Its eyes turn magenta and its pupils turn white.</p>
      <p>As a result of Mega Evolution, Mega Pidgeot's body is much stronger, along with its wings. The crest is sensitive to air currents, acting like a large antenna.<sup class="reference"><a href="#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup></p>
      <table><tr><td>Mega Pidgeot</td></tr></table>
    `;
    const speciesHtml = `
      <h2><span class="mw-headline" id="Biology">Biology</span></h2>
      <p>Pidgeot is an avian Pokémon with large wings, sharp talons, and a short, hooked beak.</p>
      <p>Pidgeot's powerful wings can stir up windstorms in just a few flaps.</p>
      <h3><span class="mw-headline" id="Forms">Forms</span></h3>
      <p>Pidgeot can Mega Evolve into Mega Pidgeot.</p>
      <p>Pidgeot grows noticeably when it Mega Evolves, developing a larger body and longer, broader wings.</p>
    `;
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-pidgeot-"));
    let biologyReads = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = url.searchParams.get("page");
      const prop = url.searchParams.get("prop");
      const section = url.searchParams.get("section") ?? "";
      if (page === "Mega_Pidgeot" && prop === "sections") {
        return jsonResponse({
          parse: {
            title: "Pidgeot (Pokémon)",
            redirects: [{ from: "Mega Pidgeot", to: "Pidgeot (Pokémon)" }],
            sections,
          },
        });
      }
      if (prop === "text" && section === "17") {
        return jsonResponse({ parse: { text: "<table><tr><td>Mega Pidgeot base stats</td></tr></table>" } });
      }
      if (prop === "text" && section === "2") {
        return jsonResponse({ parse: { text: formsHtml } });
      }
      if (prop === "text" && section === "1") {
        biologyReads += 1;
        return jsonResponse({ parse: { text: speciesHtml } });
      }
      throw new Error(`Unexpected ${page} ${prop} ${section}`);
    }) as typeof fetch;

    try {
      const spoken = await loadFormSpeech(
        { formId: 10073, speciesId: 18, speciesName: "Pidgeot", formName: "Mega Pidgeot" },
        {
          fetchImpl,
          cacheFile: path.join(dir, "forms.json"),
          biologyCacheFile: path.join(dir, "biology.json"),
          sleep: async () => undefined,
        },
      );
      assert.equal(biologyReads, 0);
      assert.match(spoken.speech, /developing a larger body and longer, broader wings/);
      assert.match(spoken.speech, /body is much stronger/);
      assert.equal(spoken.speech.startsWith("Mega Pidgeot."), true);
      assert.doesNotMatch(spoken.speech, /avian Pokémon|windstorms|base stats|\[1\]|Bulbapedia/i);
      assert.equal(spoken.notice, "");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adds the Pokédex note to a send status once", () => {
    assert.equal(statusWithDexNote("Pokefacts 1, description 1 of 2", ""), "Pokefacts 1, description 1 of 2");
    const noted = statusWithDexNote("Pokefacts 1, description 1 of 2", WIKI_DEX_NOTE);
    assert.match(noted, /description 1 of 2/);
    assert.match(noted, /Pokédex line is used instead/);
    assert.equal(statusWithDexNote(noted, WIKI_DEX_NOTE), noted);
    const wiki = spokenFact("Bulbasaur", [{ kind: "paragraph", text: "One. The bulb is the lead." }], "Dex sentence only.");
    assert.match(wiki, /bulb is the lead/);
    assert.doesNotMatch(wiki, /Dex sentence only/);
    assert.equal(spokenFact("Bulbasaur", [], "Dex sentence only."), "Bulbasaur. Dex sentence only.");
  });

  it("keeps a wiki lead ahead of the catalogue Pokédex line", async () => {
    const entry = getCatalogueEntry(1);
    assert.ok(entry);
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-wins-"));
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("prop") === "sections") {
        return jsonResponse({
          parse: { sections: [{ toclevel: 1, line: "Biology", index: "1", anchor: "Biology" }] },
        });
      }
      return jsonResponse({ parse: { text: HTML } });
    }) as typeof fetch;
    try {
      const fact = await loadFactSpeech(entry.name, entry.id, entry.info, {
        fetchImpl,
        cacheFile: path.join(dir, "biology.json"),
        sleep: async () => undefined,
        timeoutMs: 30,
      });
      assert.equal(fact.biology.status, "ready");
      assert.match(fact.speech, /quadrupedal amphibian/);
      assert.equal(fact.speech.includes(entry.info), false);
      assert.equal(fact.notice, "");
      assert.notEqual(fact.speech, "Bulbasaur.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("speaks the catalogue line when a wiki read hangs and does not cache the timeout", async () => {
    const entry = getCatalogueEntry(1);
    assert.ok(entry);
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-hang-"));
    const cacheFile = path.join(dir, "biology.json");
    const calls = { n: 0 };
    const fetchImpl = (() => {
      calls.n += 1;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    try {
      const fact = await loadFactSpeech(entry.name, entry.id, entry.info, {
        fetchImpl,
        cacheFile,
        sleep: async () => undefined,
        timeoutMs: 20,
      });
      assert.equal(calls.n, WIKI_TIMEOUT_TRIES);
      assert.match(fact.speech, /^Bulbasaur\./);
      assert.ok(fact.speech.includes(entry.info));
      assert.notEqual(fact.speech, "Bulbasaur.");
      assert.equal(fact.notice, WIKI_DEX_NOTE);
      assert.equal(fact.biology.status, "unavailable");
      assert.deepEqual(fact.biology.blocks, []);
      await assert.rejects(readFile(cacheFile, "utf8"));
      await loadFactSpeech(entry.name, entry.id, entry.info, {
        fetchImpl,
        cacheFile,
        sleep: async () => undefined,
        timeoutMs: 20,
      });
      assert.equal(calls.n, WIKI_TIMEOUT_TRIES * 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not store an aborted wiki body as a missing page", async () => {
    const entry = getCatalogueEntry(1);
    assert.ok(entry);
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-abort-"));
    const cacheFile = path.join(dir, "biology.json");
    const calls = { n: 0 };
    const fetchImpl = (async () => {
      calls.n += 1;
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
        },
      } as unknown as Response;
    }) as typeof fetch;
    try {
      const fact = await loadFactSpeech(entry.name, entry.id, entry.info, {
        fetchImpl,
        cacheFile,
        sleep: async () => undefined,
        timeoutMs: 50,
      });
      assert.equal(calls.n, WIKI_TIMEOUT_TRIES);
      assert.ok(fact.speech.includes(entry.info));
      assert.notEqual(fact.speech, `${entry.name}.`);
      await assert.rejects(readFile(cacheFile, "utf8"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses cached prose when the live read times out", async () => {
    const entry = getCatalogueEntry(1);
    assert.ok(entry);
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-disk-"));
    const cacheFile = path.join(dir, "biology.json");
    await writeFile(
      cacheFile,
      JSON.stringify({
        "1": {
          name: "Bulbasaur",
          page: "Bulbasaur_(Pokémon)",
          url: "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pokémon)",
          status: "ready",
          blocks: [{ kind: "paragraph", text: "Cached bulb prose stays on the track." }],
          fetchedAt: "2020-01-01T00:00:00.000Z",
          revision: 1,
        },
      }),
    );
    const calls = { n: 0 };
    const fetchImpl = (() => {
      calls.n += 1;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    try {
      const fact = await loadFactSpeech(entry.name, entry.id, entry.info, {
        fetchImpl,
        cacheFile,
        sleep: async () => undefined,
        timeoutMs: 20,
      });
      assert.equal(calls.n, WIKI_TIMEOUT_TRIES);
      assert.match(fact.speech, /Cached bulb prose stays on the track/);
      assert.equal(fact.speech.includes(entry.info), false);
      assert.equal(fact.notice, "");
      assert.notEqual(fact.speech, "Bulbasaur.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fetches again when a missing row was stored by an aborted read", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-wiki-unset-"));
    const cacheFile = path.join(dir, "biology.json");
    await writeFile(
      cacheFile,
      JSON.stringify({
        "1": {
          name: "Bulbasaur",
          page: "Bulbasaur_(Pokémon)",
          url: "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pokémon)",
          status: "missing",
          blocks: [],
          fetchedAt: "2024-01-01T00:00:00.000Z",
          revision: 2,
        },
      }),
    );
    let calls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls += 1;
      const url = new URL(String(input));
      if (url.searchParams.get("prop") === "sections") {
        return jsonResponse({
          parse: { sections: [{ toclevel: 1, line: "Biology", index: "1", anchor: "Biology" }] },
        });
      }
      return jsonResponse({ parse: { text: HTML } });
    }) as typeof fetch;
    try {
      const fact = await loadFactSpeech("Bulbasaur", 1, "While it is young, it uses the nutrients.", {
        fetchImpl,
        cacheFile,
        sleep: async () => undefined,
        timeoutMs: 30,
      });
      assert.equal(calls, 2);
      assert.match(fact.speech, /quadrupedal amphibian/);
      assert.equal(fact.speech.includes("uses the nutrients"), false);
      assert.equal(fact.notice, "");
      const saved = JSON.parse(await readFile(cacheFile, "utf8")) as Record<string, { status?: string }>;
      assert.equal(saved["1"]?.status, "ready");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("speaks the species Pokédex line when a form read hangs", async () => {
    const pidgeot = getCatalogueEntry(18);
    assert.ok(pidgeot?.info);
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-form-hang-"));
    const calls = { n: 0 };
    const fetchImpl = (() => {
      calls.n += 1;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    try {
      const spoken = await loadFormSpeech(
        { formId: 10073, speciesId: 18, speciesName: "Pidgeot", formName: "Mega Pidgeot" },
        {
          fetchImpl,
          cacheFile: path.join(dir, "forms.json"),
          biologyCacheFile: path.join(dir, "biology.json"),
          sleep: async () => undefined,
          timeoutMs: 20,
        },
      );
      assert.equal(calls.n, WIKI_TIMEOUT_TRIES * 2);
      assert.match(spoken.speech, /^Mega Pidgeot\./);
      assert.ok(spoken.speech.includes(pidgeot.info));
      assert.notEqual(spoken.speech, "Mega Pidgeot.");
      assert.equal(spoken.notice, WIKI_DEX_NOTE);
      await assert.rejects(readFile(path.join(dir, "forms.json"), "utf8"));
      await assert.rejects(readFile(path.join(dir, "biology.json"), "utf8"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses cached form prose when the live form read times out", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-form-disk-"));
    const cacheFile = path.join(dir, "forms.json");
    await writeFile(
      cacheFile,
      JSON.stringify({
        "10073": {
          formId: 10073,
          formName: "Mega Pidgeot",
          speciesName: "Pidgeot",
          page: "Pidgeot_(Pokémon)",
          url: "https://bulbapedia.bulbagarden.net/wiki/Pidgeot_(Pokémon)#Forms",
          status: "ready",
          blocks: [{ kind: "paragraph", text: "Cached Mega Pidgeot prose about the long wings stays on the track." }],
          fetchedAt: "2020-01-01T00:00:00.000Z",
          revision: 9,
        },
      }),
    );
    const calls = { n: 0 };
    const fetchImpl = (() => {
      calls.n += 1;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    try {
      const spoken = await loadFormSpeech(
        { formId: 10073, speciesId: 18, speciesName: "Pidgeot", formName: "Mega Pidgeot" },
        {
          fetchImpl,
          cacheFile,
          biologyCacheFile: path.join(dir, "biology.json"),
          sleep: async () => undefined,
          timeoutMs: 20,
        },
      );
      assert.equal(calls.n, WIKI_TIMEOUT_TRIES);
      assert.match(spoken.speech, /Cached Mega Pidgeot prose about the long wings/);
      assert.equal(spoken.notice, "");
      assert.match(spoken.speech, /^Mega Pidgeot\./);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
