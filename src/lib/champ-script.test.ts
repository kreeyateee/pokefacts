import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildChampBrief } from "./champ-script";
import { describeChain, type EvolutionNode } from "./evolution";
import type { Dossier } from "./types";
import { buildChampCard } from "./yoto-card";

function dossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 1,
    name: "Bulbasaur",
    slug: "bulbasaur",
    genus: "Seed Pokémon",
    types: ["grass", "poison"],
    height: "0.7 meters, about 2 feet 4 inches",
    weight: "6.9 kilograms, about 15 pounds",
    abilities: [
      {
        name: "Overgrow",
        hidden: false,
        effect: "Powers up Grass-type moves when the Pokémon's HP is low.",
      },
      {
        name: "Chlorophyll",
        hidden: true,
        effect: "Doubles Speed in sunshine.",
      },
    ],
    habitat: "Look for it in grassland.",
    growth: "medium slow",
    catchLine: "Catching it is a real test. Bring your best ball.",
    captureRate: 45,
    isLegendary: false,
    isMythical: false,
    isBaby: false,
    flavor: [
      {
        version: "Scarlet",
        text: "While it is young, it uses the nutrients that are stored in the seed on its back in order to grow.",
      },
      {
        version: "Red",
        text: "A strange seed was planted on its back at birth. The plant sprouts and grows with this Pokémon.",
      },
    ],
    evolution:
      "Bulbasaur becomes Ivysaur at level 16. Ivysaur becomes Venusaur at level 32.",
    stats: [
      { slug: "hp", name: "hit points", value: 45 },
      { slug: "attack", name: "attack", value: 49 },
      { slug: "defense", name: "defense", value: 49 },
      { slug: "special-attack", name: "special attack", value: 65 },
      { slug: "special-defense", name: "special defense", value: 65 },
      { slug: "speed", name: "speed", value: 45 },
    ],
    statTotal: 318,
    artwork: "https://example.com/1.png",
    cry: null,
    region: "Kanto",
    ...overrides,
  };
}

describe("champion briefings", () => {
  it("reads the call, the measure, and the line", () => {
    const brief = buildChampBrief(dossier());
    assert.equal(brief.tracks.length, 3);
    const call = brief.tracks[0]?.text ?? "";
    const measure = brief.tracks[1]?.text ?? "";
    const line = brief.tracks[2]?.text ?? "";
    assert.match(call, /Bulbasaur\. National number 1\. The Seed Pokémon\./);
    assert.match(call, /Grass and Poison/);
    assert.match(call, /Scarlet entry says/);
    assert.match(call, /from Red, still holds/);
    assert.match(measure, /0\.7 meters/);
    assert.match(measure, /Overgrow/);
    assert.match(measure, /hidden ability, Chlorophyll/);
    assert.match(measure, /grassland/);
    assert.match(line, /Ivysaur at level 16/);
    assert.match(line, /Special attack leads at 65/);
    assert.match(line, /totals 318/);
    for (const track of brief.tracks) {
      assert.ok(track.text.length < 3000);
      assert.doesNotMatch(track.text, /POKéMON/);
    }
  });

  it("flags legendaries and babies", () => {
    const legendary = buildChampBrief(
      dossier({ name: "Mewtwo", isLegendary: true, genus: "Genetic Pokémon" }),
    );
    assert.match(legendary.tracks[0]?.text ?? "", /legendary/i);
    const baby = buildChampBrief(
      dossier({ name: "Pichu", isBaby: true, genus: "Tiny Mouse Pokémon" }),
    );
    assert.match(baby.tracks[0]?.text ?? "", /baby Pokémon/);
  });
});

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

describe("Yoto card payload", () => {
  it("builds an ElevenLabs chapter with a type icon", () => {
    const card = buildChampCard([dossier()], "card-1");
    assert.equal(card.cardId, "card-1");
    assert.equal(card.title, "Champdex: Bulbasaur");
    const chapter = card.content.chapters[0];
    assert.ok(chapter);
    assert.equal(chapter.tracks.length, 3);
    assert.equal(chapter.display.icon16x16.startsWith("yoto:#"), true);
    assert.ok(chapter.tracks.every((track) => track.type === "elevenlabs"));
    assert.match(chapter.tracks[0]?.trackUrl ?? "", /National number 1/);
    assert.equal(chapter.tracks[1]?.display.icon16x16.includes("gTMbacpoe"), true);
  });
});
