import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextFreeTitle, playlistNamed, titleKey } from "./playlist-names";

describe("playlist names", () => {
  const library = [
    { cardId: "AAAAA", title: "Starter Pokémon" },
    { cardId: "BBBBB", title: "Starter Pokémon 2" },
    { cardId: "CCCCC", title: "Pokefacts 1" },
  ];

  it("spots a name already in the library, whatever the spacing and capitals", () => {
    assert.equal(playlistNamed(library, "starter  pokémon ")?.cardId, "AAAAA");
    assert.equal(playlistNamed(library, "Safari Zone"), undefined);
    assert.equal(playlistNamed(library, "   "), undefined);
    assert.equal(titleKey(" Starter\tPokémon "), "starter pokémon");
  });

  it("counts on to the first free number", () => {
    const taken = library.map((item) => item.title);
    assert.equal(nextFreeTitle("Starter Pokémon", taken), "Starter Pokémon 3");
    assert.equal(nextFreeTitle("Safari Zone", taken), "Safari Zone");
    assert.equal(nextFreeTitle("Safari Zone", ["Safari Zone"]), "Safari Zone 2");
  });

  it("puts the count in brackets when the name already ends in a number", () => {
    assert.equal(nextFreeTitle("Pokefacts 1", ["Pokefacts 1"]), "Pokefacts 1 (2)");
    assert.equal(nextFreeTitle("Pokefacts 1", ["Pokefacts 1", "pokefacts 1 (2)"]), "Pokefacts 1 (3)");
  });
});
