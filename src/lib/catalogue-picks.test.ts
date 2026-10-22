import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_PICKS,
  isFormPick,
  LAST_SPECIES_ID,
  readCataloguePicks,
  serializeCataloguePicks,
} from "./catalogue-picks";

describe("catalogue picks storage", () => {
  it("keeps the pick, its order, kind, and title through a round trip", () => {
    const picks = { ids: [25, 1, 150], kind: "whos-that" as const, title: "Ash's team" };
    assert.deepEqual(readCataloguePicks(serializeCataloguePicks(picks)), picks);
  });

  it("starts empty when nothing or junk is stored", () => {
    assert.deepEqual(readCataloguePicks(null), EMPTY_PICKS);
    assert.deepEqual(readCataloguePicks("not json"), EMPTY_PICKS);
    assert.deepEqual(readCataloguePicks("[1,2]"), { ...EMPTY_PICKS });
  });

  it("drops ids that are not whole positive numbers, and repeats", () => {
    const raw = JSON.stringify({ ids: [4, "7", 4, 0, -2, 3.5, 9], kind: "facts", title: "" });
    assert.deepEqual(readCataloguePicks(raw).ids, [4, 9]);
  });

  it("keeps picked forms beside species in the order they were picked", () => {
    const picks = { ids: [19, 10091, 6, 10034, 10196], kind: "facts" as const, title: "" };
    assert.deepEqual(readCataloguePicks(serializeCataloguePicks(picks)), picks);
    assert.deepEqual(
      picks.ids.map((id) => isFormPick(id)),
      [false, true, false, true, true],
    );
    assert.equal(isFormPick(LAST_SPECIES_ID), false);
    assert.equal(isFormPick(LAST_SPECIES_ID + 1), true);
  });

  it("still opens a pick saved before forms could be picked", () => {
    const saved = '{"ids":[25,1,150],"kind":"advanced","title":"Old pick"}';
    assert.deepEqual(readCataloguePicks(saved), { ids: [25, 1, 150], kind: "advanced", title: "Old pick" });
  });

  it("falls back to fact cards for an unknown kind and keeps more than one card's worth of ids", () => {
    const ids = Array.from({ length: 300 }, (_, index) => index + 1);
    const picks = readCataloguePicks(JSON.stringify({ ids, kind: "mystery", title: 7 }));
    assert.equal(picks.kind, "facts");
    assert.equal(picks.title, "");
    assert.equal(picks.ids.length, 300);
  });
});
