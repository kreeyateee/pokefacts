import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { KidCard } from "./kid-cards";
import {
  autoCover,
  cardCountLabel,
  cardRangeText,
  crowdFor,
  heroInfo,
  heroMon,
  linesFor,
  monsFor,
  suggestedCover,
} from "./sticker-cover";

function card(kind: KidCard["kind"], ids: number[]): KidCard {
  return {
    id: `${kind}-1`,
    kind,
    title: "Test",
    rangeLabel: "Test card",
    libraryTitle: "Test card",
    blurb: "",
    childDoes: "",
    chapters: ids.map((id, index) => ({
      key: `c${id}`,
      title: `Mon ${id}`,
      overlay: String(index + 1),
      picture: "",
      mark: "",
      icon: "",
      dexId: id,
      tracks: [],
    })),
  };
}

function seeded(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe("sticker cover for a card", () => {
  it("offers each Pokémon with its artwork, and riddles as shadows without names", () => {
    const facts = monsFor(card("meet", [1, 2]));
    assert.equal(facts[0]?.name, "Mon 1");
    assert.match(facts[0]?.src ?? "", /artwork/);
    const riddles = monsFor(card("guess", [25]));
    assert.equal(riddles[0]?.name, "Riddle 1");
    assert.match(riddles[0]?.src ?? "", /-shadow\.png$/);
    assert.match(riddles[0]?.art ?? "", /artwork/);
    assert.deepEqual(linesFor(card("guess", [25])), []);
  });

  it("counts and ranges the card for its back", () => {
    assert.equal(cardCountLabel(card("meet", [1, 2, 3])), "3 Pokémon");
    assert.equal(cardCountLabel(card("guess", [5])), "1 riddle");
    assert.equal(cardRangeText(card("meet", [1, 2, 3])), "No. 1 to 3");
    assert.equal(cardRangeText(card("guess", [1, 2, 3])), "Test card");
  });

  it("starts as a group photo with the first Pokémon as the star", () => {
    const cover = suggestedCover(card("meet", [4, 5, 6]));
    assert.equal(cover.style, "photo");
    assert.equal(cover.hero, "c4");
    assert.equal(cover.backMode, "steps");
    assert.equal(heroMon(monsFor(card("meet", [4, 5, 6])), { hero: "nope" })?.key, "c4");
  });

  it("makes a cover with a new star and keeps the child's style, title, and name", () => {
    const item = card("meet", [1, 2, 3, 4]);
    const current = { ...suggestedCover(item), style: "trading" as const, owner: "Misty", title: "Mine" };
    const next = autoCover(item, current, seeded([0.99, 0.1, 0.5, 0.7]));
    assert.notEqual(next.hero, current.hero);
    assert.equal(next.style, "trading");
    assert.equal(next.owner, "Misty");
    assert.equal(next.title, "Mine");
  });

  it("puts everyone in the photo until a crowd is chosen", () => {
    const mons = monsFor(card("meet", [1, 2, 3]));
    assert.equal(crowdFor(mons, { crowd: null }).length, 3);
    assert.deepEqual(
      crowdFor(mons, { crowd: ["c3", "c1"] }).map((mon) => mon.key),
      ["c1", "c3"],
    );
  });

  it("hides the star's details on a riddle card", () => {
    const [mon] = monsFor(card("guess", [25]));
    assert.ok(mon);
    const info = heroInfo(mon, true, { types: ["electric"], genus: "Mouse Pokémon" });
    assert.equal(info.hidden, true);
    assert.equal(info.number, 25);
  });
});
