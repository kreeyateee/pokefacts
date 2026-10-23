import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { asPartner, partnerParam, readFavourites, withFavourite, writeFavourites } from "./favourites";

describe("favourites", () => {
  it("keeps up to three real Pokémon, in order, without repeats", () => {
    assert.deepEqual(readFavourites("[25, 133, 25, 4, 7]"), [25, 133, 4]);
    assert.deepEqual(readFavourites('[0, 2000, "25", 1.5, 151]'), [151]);
    assert.deepEqual(readFavourites("not json"), []);
    assert.deepEqual(readFavourites(null), []);
    assert.equal(writeFavourites([25, 25, 133]), "[25,133]");
  });

  it("adds at the end until the list is full, and moves the partner to the front", () => {
    assert.deepEqual(withFavourite([25], 133), [25, 133]);
    assert.deepEqual(withFavourite([25, 133, 4], 7), [25, 133, 4]);
    assert.deepEqual(withFavourite([25], 25), [25]);
    assert.deepEqual(asPartner([25, 133, 4], 4), [4, 25, 133]);
  });

  it("only passes a real species to an adventure as the partner", () => {
    assert.equal(partnerParam("25"), 25);
    assert.equal(partnerParam("0"), undefined);
    assert.equal(partnerParam("1026"), undefined);
    assert.equal(partnerParam("25; drop"), undefined);
    assert.equal(partnerParam(null), undefined);
  });
});
