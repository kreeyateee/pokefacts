import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { PIPER_SAID_WORDS, piperSpeech } from "./piper-pronounce";
import { pronounce } from "./pronounce";

describe("Piper pronunciation", () => {
  it("respells names as whole words only", () => {
    assert.equal(piperSpeech("Pikachu waves."), "Peekachoo waves.");
    assert.equal(piperSpeech("Pikachuu and Raichu."), "Pikachuu and Raichu.");
    assert.equal(piperSpeech("Captain Mia sails to Miami."), "Captain Mee uh sails to Miami.");
    assert.equal(piperSpeech("Pidgeotto becomes Pidgeot."), "Pidgeoto becomes Pidgey ot.");
    assert.equal(piperSpeech("Kabuto and Kabutops."), "Kabooto and Kabboo tops.");
    assert.equal(piperSpeech("a Pikachu-shaped cloud"), "a Peekachoo-shaped cloud");
    assert.equal(piperSpeech("Bulbasaur and Squirtle."), "Bulbasaur and Squirtle.");
  });

  it("keeps the case of the text around it", () => {
    assert.equal(piperSpeech("PIKACHU used Thunderbolt."), "Peekachoo used Thunderbolt.");
    assert.equal(piperSpeech("a wild pikachu"), "a wild peekachoo");
    assert.equal(piperSpeech("GYARADOS is angry."), "Ghyara dos is angry.");
  });

  it("keeps possessives and plurals", () => {
    assert.equal(piperSpeech("Pikachu's tail"), "Peekachoo's tail");
    assert.equal(piperSpeech("Pikachu’s tail"), "Peekachoo’s tail");
    assert.equal(piperSpeech("two Pikachus"), "two Peekachoos");
    assert.equal(piperSpeech("six Poké Balls"), "six Pohkay Balls");
  });

  it("says the special names", () => {
    assert.equal(piperSpeech("Nidoran♀ and Nidoran♂ and Nidoran"), "Needo ran female and Needo ran male and Needo ran");
    assert.equal(piperSpeech("Mr. Mime and Mr. Rime"), "Mister Mime and Mister Rime");
    assert.equal(piperSpeech("It is Mime Jr.. It grows from Mime Jr. and becomes Mr. Mime."), "It is Mime Junior. It grows from Mime Junior and becomes Mister Mime.");
    assert.equal(piperSpeech("Farfetch’d, Farfetch'd and Sirfetch’d"), "Far fetched, Far fetched and Sir fetched");
    assert.equal(piperSpeech("Porygon, Porygon2 and Porygon-Z"), "Porry gon, Porry gon two and Porry gon zee");
    assert.equal(piperSpeech("Jangmo-o, Hakamo-o and Kommo-o"), "Jangmo-o, Ha ka mo oh and Kommo-o");
    assert.equal(piperSpeech("Flabébé"), "Flah bay bay");
    assert.equal(piperSpeech("Pokémon, Pokédex, Poké Ball"), "Pohkaymonn, Pohkaydex, Pohkay Ball");
    // espeak already reads these well.
    assert.equal(piperSpeech("Ho-Oh and Type: Null"), "Ho-Oh and Type: Null");
  });

  it("spells out signs and short forms from the fact text", () => {
    assert.equal(piperSpeech("It burns at 2,500° F."), "It burns at 2,500 degrees Fahrenheit.");
    assert.equal(piperSpeech("Its breath is -58° F."), "Its breath is -58 degrees Fahrenheit.");
    assert.equal(piperSpeech("It is 30°C."), "It is 30 degrees Celsius.");
    assert.equal(piperSpeech("It boosts Sp. Atk and Sp. Def."), "It boosts Special Attack and Special Defence.");
    assert.equal(piperSpeech("It boosts the Sp. It lives here."), "It boosts the Special. It lives here.");
    assert.equal(piperSpeech("the one-hit KO."), "the one-hit K O.");
    assert.equal(piperSpeech("A UB appeared. It is called a UB."), "An Ultra Beast appeared. It is called an Ultra Beast.");
    assert.equal(piperSpeech("the location... but it waits…"), "the location, but it waits.");
    assert.equal(piperSpeech("strong—when it butts heads"), "strong, when it butts heads");
  });

  it("leaves numbers, decimals and ordinary words alone", () => {
    const fact = "It weighs 6.9 kilograms. It is 130 centimetres tall. It is number 25. Kocho and koala.";
    assert.equal(piperSpeech(fact), fact);
  });

  it("does not change what the Yoto voices are given", () => {
    // pronounce() is the shared step. Its output is cached text for ElevenLabs and must not move.
    assert.equal(pronounce("Charmeleon and Eevee meet Gengar."), "Char me lee un and Ee vee meet Gang gar.");
    assert.equal(pronounce("Pikachu and Pokémon"), "Pikachu and Pokémon");
    // Piper reads pronounce()'s respellings as they are.
    const said = pronounce("Charmeleon, Wartortle, Vaporeon, Raichu and Jigglypuff.");
    assert.equal(piperSpeech(said), said);
  });

  it("changes every word on the checked list, and the IPA snapshot matches the list", () => {
    const file = path.join(import.meta.dirname, "..", "..", "scripts", "piper-ipa.json");
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, { said: string }>;
    for (const word of PIPER_SAID_WORDS) {
      assert.notEqual(piperSpeech(word), word, word);
      assert.equal(saved[word]?.said, piperSpeech(word), `${word}: run npx tsx scripts/piper-phonemes.ts --write`);
    }
    assert.equal(Object.keys(saved).length, PIPER_SAID_WORDS.length);
  });

  it("spells every Pokémon name on the list the way the catalogue does", () => {
    const file = path.join(import.meta.dirname, "..", "data", "species-names.json");
    const names = new Set((JSON.parse(readFileSync(file, "utf8")) as { name: string }[]).map((row) => row.name));
    const words = PIPER_SAID_WORDS.filter((word) => !/\s/.test(word) || names.has(word));
    const extra = ["Nidoran", "Pokémon", "Pokemon", "Pokédex", "Pokedex", "Poké", "Pokéfacts", "Pokefacts", "Hoenn", "Hisui", "Paldea", "Aurelia", "Mia"];
    const unknown = words.filter((word) => !names.has(word) && !extra.includes(word) && !word.includes("'"));
    assert.deepEqual(unknown, []);
  });
});
