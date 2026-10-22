import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeChain, type EvolutionNode } from "./evolution";

describe("evolution lines", () => {
  it("speaks a branch the way a champion would", () => {
    const chain: EvolutionNode = {
      species: { name: "eevee", url: "" },
      evolution_details: [],
      evolves_to: [
        {
          species: { name: "vaporeon", url: "" },
          evolution_details: [
            {
              min_level: null,
              trigger: { name: "use-item" },
              item: { name: "water-stone" },
              held_item: null,
              known_move: null,
              min_happiness: null,
              min_affection: null,
              time_of_day: "",
              location: null,
              known_move_type: null,
              party_species: null,
              trade_species: null,
              gender: null,
              relative_physical_stats: null,
              needs_overworld_rain: false,
              turn_upside_down: false,
            },
          ],
          evolves_to: [],
        },
        {
          species: { name: "jolteon", url: "" },
          evolution_details: [
            {
              min_level: null,
              trigger: { name: "use-item" },
              item: { name: "thunder-stone" },
              held_item: null,
              known_move: null,
              min_happiness: null,
              min_affection: null,
              time_of_day: "",
              location: null,
              known_move_type: null,
              party_species: null,
              trade_species: null,
              gender: null,
              relative_physical_stats: null,
              needs_overworld_rain: false,
              turn_upside_down: false,
            },
          ],
          evolves_to: [],
        },
      ],
    };
    const spoken = describeChain(chain, "eevee");
    assert.match(spoken, /Eevee becomes Vaporeon with a Water Stone/);
    assert.match(spoken, /Eevee becomes Jolteon with a Thunder Stone/);
  });

  it("says when a Pokémon does not evolve", () => {
    const chain: EvolutionNode = {
      species: { name: "farfetchd", url: "" },
      evolution_details: [],
      evolves_to: [],
    };
    assert.equal(describeChain(chain, "farfetchd"), "Farfetch'd does not evolve.");
  });
});
