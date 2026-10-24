import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLLECTION_TABS,
  READY_CATEGORIES,
  SECTIONS,
  isCollectionKind,
  isReadyKind,
  pageHeading,
  playlistNote,
  readSavedTab,
  sectionFor,
  viewForSection,
} from "./app-nav";

describe("app navigation", () => {
  it("splits the menu into ready-made, make your own, adventures, and music", () => {
    assert.deepEqual(
      SECTIONS.map((item) => item.id),
      ["ready", "own", "adventures", "printables", "music"],
    );
    assert.deepEqual(
      SECTIONS.map((item) => item.label),
      ["Ready-made", "Make your own", "Adventures", "Printables", "Music"],
    );
  });

  it("puts every ready-made set on one shelf", () => {
    assert.deepEqual(
      READY_CATEGORIES.map((item) => item.kind),
      ["meet", "quick", "guess", "companion", "starter", "joke", "mega", "gmax", "alola", "hisui", "legendary", "mythical"],
    );
    assert.equal(READY_CATEGORIES.find((item) => item.kind === "quick")?.label, "Quick Pokefacts");
    assert.equal(pageHeading({ view: "cards", kind: "quick" }).title, "Quick Pokefacts");
    // A refresh on Quick Pokefacts opens it again.
    assert.deepEqual(readSavedTab(JSON.stringify({ view: "cards", kind: "quick" })), { view: "cards", kind: "quick" });
    assert.equal(COLLECTION_TABS.length, 9);
    assert.match(pageHeading({ view: "cards", kind: "companion" }).blurb, /the game your child is playing/);
    assert.equal(isCollectionKind("starter"), true);
    assert.match(pageHeading({ view: "cards", kind: "starter" }).blurb, /starter Pokémon, all three steps/);
    assert.equal(isCollectionKind("mega"), true);
    assert.equal(isCollectionKind("mythical"), true);
    assert.equal(isCollectionKind("meet"), false);
    assert.equal(isReadyKind("guess"), true);
    assert.equal(isReadyKind("meet"), true);
  });

  it("maps each page to one section", () => {
    assert.equal(sectionFor("cards"), "ready");
    assert.equal(sectionFor("catalogue"), "own");
    assert.equal(sectionFor("adventures"), "adventures");
    assert.equal(sectionFor("printables"), "printables");
    assert.equal(sectionFor("music"), "music");
    assert.equal(sectionFor("setup"), null);
    assert.equal(viewForSection("own"), "catalogue");
    assert.equal(viewForSection("adventures"), "adventures");
    assert.equal(viewForSection("printables"), "printables");
    assert.equal(viewForSection("music"), "music");
  });

  it("uses short, matching page titles", () => {
    assert.equal(pageHeading({ view: "adventures", kind: "meet" }).title, "Adventures");
    assert.equal(pageHeading({ view: "printables", kind: "meet" }).title, "Printables");
    assert.equal(pageHeading({ view: "setup", kind: "meet" }).title, "How to connect Yoto");
    assert.equal(pageHeading({ view: "catalogue", kind: "meet" }).title, "Make your own");
    assert.equal(pageHeading({ view: "music", kind: "meet" }).title, "Music");
    assert.equal(pageHeading({ view: "music", kind: "meet" }).blurb, "Play songs from the games as YouTube videos.");
    assert.equal(pageHeading({ view: "cards", kind: "guess" }).title, "Who's That Pokémon Cards");
    assert.equal(pageHeading({ view: "cards", kind: "mega", libraryTitle: "Mega Evolutions" }).title, "Mega Evolutions");
    assert.equal(pageHeading({ view: "cards", kind: "meet" }).title, "Fact Cards");
  });

  it("keeps playlist notes to one line", () => {
    assert.equal(
      playlistNote({
        randomGuess: true,
        randomFacts: false,
        splitSet: false,
        formMode: false,
        speciesSet: false,
        rangeLabel: "Who's That Pokémon",
        libraryTitle: "Who's That Pokémon",
        blurb: "",
      }),
      "These 50 riddles. Shuffle draws a new fifty. Send uses this list.",
    );
    assert.match(
      playlistNote({
        randomGuess: false,
        randomFacts: false,
        splitSet: false,
        formMode: false,
        speciesSet: false,
        rangeLabel: "1-100",
        libraryTitle: "Pokefacts 1",
        blurb: "",
      }),
      /1-100/,
    );
  });

  it("brings back the saved tab and ignores anything it does not know", () => {
    assert.deepEqual(readSavedTab('{"view":"catalogue","kind":"meet"}'), { view: "catalogue", kind: "meet" });
    assert.deepEqual(readSavedTab('{"view":"cards","kind":"alola"}'), { view: "cards", kind: "alola" });
    assert.deepEqual(readSavedTab('{"view":"music","kind":"hisui"}'), { view: "music", kind: "hisui" });
    assert.deepEqual(readSavedTab('{"view":"cards","kind":"nonsense"}'), { view: "cards", kind: "meet" });
    assert.equal(readSavedTab('{"view":"attic"}'), null);
    assert.equal(readSavedTab("nope"), null);
    assert.equal(readSavedTab(null), null);
  });
});
