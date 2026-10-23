import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCatalogueEntry } from "./catalogue-db";
import { posterCollection, REGION_POSTERS, STARTER_POSTERS } from "./poster-collections";
import { posterFilename } from "./sticker-layout";

describe("poster collections", () => {
  it("covers every Pokémon once across the regions", () => {
    const ids = REGION_POSTERS.flatMap((region) => region.dexIds);
    assert.equal(ids.length, 1025);
    assert.equal(new Set(ids).size, 1025);
    assert.deepEqual(
      REGION_POSTERS.map((region) => region.dexIds.length),
      [151, 100, 135, 107, 156, 72, 88, 89, 7, 120],
    );
  });

  it("has nine starters for each region and all eighty-one together", () => {
    const [every, ...regions] = STARTER_POSTERS;
    assert.equal(every?.dexIds.length, 81);
    assert.equal(regions.length, 9);
    for (const region of regions) assert.equal(region.dexIds.length, 9);
    assert.deepEqual(posterCollection("starters-kanto")?.dexIds, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("names the saved poster after its title, accents and all", () => {
    assert.equal(posterFilename("Starter Pokémon"), "starter-pokemon-poster-a4.pdf");
    assert.equal(posterFilename("Pokémon of Kanto"), "pokemon-of-kanto-poster-a4.pdf");
  });

  it("starts each starter line on the right Pokémon", () => {
    const firsts = STARTER_POSTERS.slice(1).flatMap((region) => [0, 3, 6].map((index) => region.dexIds[index] ?? 0));
    const names = firsts.map((id) => getCatalogueEntry(id)?.name);
    assert.deepEqual(names.slice(-6), ["Grookey", "Scorbunny", "Sobble", "Sprigatito", "Fuecoco", "Quaxly"]);
    assert.deepEqual(names.slice(0, 3), ["Bulbasaur", "Charmander", "Squirtle"]);
    assert.deepEqual(
      STARTER_POSTERS.slice(1).map((region) => getCatalogueEntry(region.dexIds[8] ?? 0)?.name),
      ["Blastoise", "Feraligatr", "Swampert", "Empoleon", "Samurott", "Greninja", "Primarina", "Inteleon", "Quaquaval"],
    );
  });
});
