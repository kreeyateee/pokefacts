import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bestHit, effectiveness, isPokemonType, TYPES } from "./type-chart";

describe("type chart", () => {
  it("knows the eighteen types", () => {
    assert.equal(TYPES.length, 18);
    assert.ok(isPokemonType("Fairy"));
    assert.ok(!isPokemonType("fire"));
    assert.ok(!isPokemonType("Sound"));
  });

  it("multiplies across both types", () => {
    assert.equal(effectiveness("Water", ["Fire"]), 2);
    assert.equal(effectiveness("Fire", ["Water"]), 0.5);
    assert.equal(effectiveness("Electric", ["Ground"]), 0);
    assert.equal(effectiveness("Ice", ["Ground", "Flying"]), 4);
    assert.equal(effectiveness("Ground", ["Rock", "Flying"]), 0);
    assert.equal(effectiveness("Grass", ["Water", "Poison"]), 1);
    assert.equal(effectiveness("Fire", ["Grass", "Steel"]), 4);
    assert.equal(effectiveness("Normal", ["Normal"]), 1);
  });

  it("finds the hardest hit back", () => {
    assert.equal(bestHit(["Fire", "Flying"], ["Grass"]), 4 / 2);
    assert.equal(bestHit(["Ground"], ["Electric"]), 2);
    assert.equal(bestHit(["Ghost"], ["Normal"]), 0);
    assert.equal(bestHit([], ["Normal"]), 1);
  });
});
