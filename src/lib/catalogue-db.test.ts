import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { describe, it } from "node:test";

import { getCatalogueEntry, searchCatalogue } from "./catalogue-db";
import { pickCatalogueInfo } from "./catalogue-info";

const COPIED = [/quadrupedal amphibian/i, /introduced in Generation/i, /Bulbapedia/i, /dual-type/i];

describe("catalogue database", () => {
  it("holds every national species and the extra forms", () => {
    const page = searchCatalogue();
    assert.equal(page.species, 1025);
    assert.equal(page.forms, 1351);
    assert.equal(page.total, 1025);
    assert.equal(page.items[0]?.name, "Bulbasaur");
    assert.equal(page.items.length, 40);
  });

  it("finds a species by name or number and can filter by type", () => {
    const byName = searchCatalogue({ q: "wail" });
    assert.equal(byName.items.some((item) => item.name === "Wailord"), true);
    const byNumber = searchCatalogue({ q: "25" });
    assert.equal(byNumber.items[0]?.name, "Pikachu");
    const fire = searchCatalogue({ type: "Fire", generation: 1 });
    assert.ok(fire.total > 0);
    assert.ok(fire.total < 1025);
    for (const item of fire.items) assert.ok(item.types.includes("Fire"));
  });

  it("shows Bulbasaur's PokéAPI Pokédex line, with the Champdex note kept beside it", () => {
    const entry = getCatalogueEntry(1);
    assert.ok(entry);
    assert.deepEqual(entry.types, ["Grass", "Poison"]);
    assert.equal(entry.genus, "Seed Pokémon");
    assert.equal(entry.weightLabel, "6.9 kilograms");
    assert.equal(entry.heightLabel, "70 centimetres");
    assert.equal(
      entry.info,
      "While it is young, it uses the nutrients that are stored in the seed on its back in order to grow.",
    );
    assert.equal(entry.infoVersion, "Shield");
    assert.match(entry.notes ?? "", /large plant bulb sits on its back/);
    assert.doesNotMatch(entry.info, /large plant bulb sits on its back/);
    assert.equal(entry.evolutions[0]?.name, "Ivysaur");
    assert.match(entry.evolutions[0]?.method ?? "", /at level 16/);
    assert.equal(entry.evolutionSet, 1);
    assert.equal(entry.stats.find((stat) => stat.name === "HP")?.value, 45);
    assert.equal(entry.abilities.find((ability) => ability.name === "Overgrow")?.hidden, false);
    assert.match(entry.abilities.find((ability) => ability.name === "Overgrow")?.info ?? "", /Grass-type/);
    assert.equal(entry.abilities.find((ability) => ability.name === "Chlorophyll")?.hidden, true);
    assert.ok(entry.moves.includes("Vine Whip"));
    assert.ok(entry.moves.includes("Tackle"));
    assert.ok(entry.weak.some((match) => match.type === "Fire"));
    for (const pattern of COPIED) assert.doesNotMatch(entry.info, pattern);
  });

  it("records Wailord's size and Eevee's branching evolutions", () => {
    const whale = getCatalogueEntry(321);
    assert.ok(whale);
    assert.equal(whale.weightLabel, "398 kilograms");
    assert.equal(whale.heightLabel, "1450 centimetres");
    assert.match(whale.info, /Wailord watching is a favorite sightseeing activity/);
    assert.match(whale.notes ?? "", /People go to the coast just to watch a group of them/);
    assert.doesNotMatch(whale.info, /humpback|feet|pounds/);
    const eevee = getCatalogueEntry(133);
    assert.ok(eevee);
    assert.ok(eevee.evolutions.length >= 8);
    const names = eevee.evolutions.map((evolution) => evolution.name);
    assert.ok(names.includes("Vaporeon"));
    assert.ok(names.includes("Jolteon"));
    assert.ok(names.includes("Flareon"));
    const farfetchd = getCatalogueEntry(83);
    assert.match(
      farfetchd?.evolutions.find((evolution) => /Sirfetch/.test(evolution.name))?.method ?? "",
      /Galarian Farfetch/,
    );
  });

  it("skips death wording and prefers a metric line over feet or pounds", () => {
    const charizard = getCatalogueEntry(6);
    assert.match(charizard?.info ?? "", /hot enough to melt boulders/);
    assert.doesNotMatch(charizard?.info ?? "", /4,600 feet/);
    assert.equal(charizard?.infoVersion, "Sword");
    const cubone = getCatalogueEntry(104);
    assert.doesNotMatch(cubone?.info ?? "", /\b(dead|deceased|kill)\b/i);
    assert.match(cubone?.info ?? "", /skull it wears on its head/);
    const pikachu = getCatalogueEntry(25);
    assert.equal(pikachu?.infoVersion, "Legends: Arceus");
    assert.match(pikachu?.info ?? "", /^Possesses cheek sacs/);
  });

  it("stores the pokedex shape and a local sprite for every species", () => {
    const database = new DatabaseSync(path.join(process.cwd(), "data", "champdex.sqlite"), {
      readOnly: true,
    });
    const row = database.prepare("SELECT * FROM pokedex WHERE id = 1").get() as {
      height: number;
      weight: number;
      hp: number;
      attack: number;
      defense: number;
      special_attack: number;
      special_defense: number;
      speed: number;
      types: string;
      evo_set: number;
      info: string;
    };
    assert.equal(row.height, 7);
    assert.equal(row.weight, 69);
    assert.equal(row.hp, 45);
    assert.equal(row.attack, 49);
    assert.equal(row.defense, 49);
    assert.equal(row.special_attack, 65);
    assert.equal(row.special_defense, 65);
    assert.equal(row.speed, 45);
    assert.equal(row.types, "Grass,Poison");
    assert.equal(row.evo_set, 1);
    assert.match(row.info, /seed on its back/);
    const moves = database.prepare("SELECT COUNT(*) AS total FROM moves").get() as { total: number };
    const links = database.prepare("SELECT COUNT(*) AS total FROM species_moves").get() as {
      total: number;
    };
    assert.ok(moves.total > 800);
    assert.ok(links.total > 1000);
    database.close();
    for (const id of [1, 25, 1025]) {
      const file = path.join(process.cwd(), "public", "sprites", `${id}.png`);
      assert.equal(existsSync(file), true);
      assert.equal(readFileSync(file).subarray(0, 4).toString("hex"), "89504e47");
    }
  });
});

describe("Pokédex line picker", () => {
  it("skips kill and death wording, and prefers metric when both exist", () => {
    const chosen = pickCatalogueInfo([
      {
        text: "The skull of its deceased mother.",
        rank: 40,
        version: "Violet",
      },
      {
        text: "Its wings can carry this Pokémon close to an altitude of 4,600 feet.",
        rank: 30,
        version: "Shield",
      },
      {
        text: "It spits fire that is hot enough to melt boulders.",
        rank: 29,
        version: "Sword",
      },
    ]);
    assert.equal(chosen?.text, "It spits fire that is hot enough to melt boulders.");
    assert.equal(chosen?.version, "Sword");
  });

  it("keeps a newer line that only mentions feet as body parts", () => {
    const chosen = pickCatalogueInfo([
      {
        text: "Its short feet are tipped with suction pads that help it climb.",
        rank: 30,
        version: "Shield",
      },
      {
        text: "It releases a horrible stench from the antenna on its head.",
        rank: 29,
        version: "Sword",
      },
    ]);
    assert.equal(chosen?.version, "Shield");
  });

  it("keeps a feet measurement when every line uses one", () => {
    const chosen = pickCatalogueInfo([
      {
        text: "It can scale a tower of more than 2,000 feet in a minute.",
        rank: 5,
        version: "Alpha Sapphire",
      },
    ]);
    assert.match(chosen?.text ?? "", /2,000 feet/);
  });

  it("does not skip a line just because it says lives", () => {
    const chosen = pickCatalogueInfo([
      { text: "It lives in forests with the rest of its group.", rank: 10, version: "Diamond" },
    ]);
    assert.match(chosen?.text ?? "", /lives in forests/);
  });
});
