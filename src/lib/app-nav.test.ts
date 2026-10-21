import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLLECTION_TABS,
  DEFAULT_COLLECTION,
  PRIMARY_TABS,
  isCollectionKind,
  pageHeading,
  playlistNote,
  primaryTabFor,
} from "./app-nav";

describe("app navigation", () => {
  it("keeps the primary menu to five destinations", () => {
    assert.equal(PRIMARY_TABS.length, 5);
    assert.deepEqual(
      PRIMARY_TABS.map((tab) => tab.id),
      ["facts", "guess", "collections", "catalogue", "music"],
    );
  });

  it("groups forms and special sets under Collection Cards", () => {
    assert.equal(COLLECTION_TABS.length, 6);
    assert.equal(DEFAULT_COLLECTION, "mega");
    assert.equal(isCollectionKind("mega"), true);
    assert.equal(isCollectionKind("mythical"), true);
    assert.equal(isCollectionKind("meet"), false);
    assert.equal(isCollectionKind("guess"), false);
  });

  it("maps the current page to one primary tab", () => {
    assert.equal(primaryTabFor("cards", "meet"), "facts");
    assert.equal(primaryTabFor("cards", "guess"), "guess");
    assert.equal(primaryTabFor("cards", "alola"), "collections");
    assert.equal(primaryTabFor("catalogue", "meet"), "catalogue");
    assert.equal(primaryTabFor("music", "guess"), "music");
    assert.equal(primaryTabFor("setup", "meet"), null);
  });

  it("uses short, matching page titles", () => {
    assert.deepEqual(
      PRIMARY_TABS.map((tab) => tab.label),
      ["Fact Cards", "Who's That Pokémon Cards", "Collection Cards", "Pokédex Cards", "Music"],
    );
    assert.equal(pageHeading({ view: "catalogue", kind: "meet" }).title, "Pokédex Cards");
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
});
