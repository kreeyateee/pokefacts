import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dexBlurb, pickDexEntry, threeClues, type FlavorSource, type MonSheet } from "./dex-facts";
import { buildKidCard, kidCardsFromDex } from "./kid-cards";
import { pronounce } from "./pronounce";

const BANNED = [/kill/i, /death/i, /quarry/i, /stat total/i, /capture rate/i, /base stat/i];

const WAILORD: FlavorSource[] = [
  {
    version: "diamond",
    text: "The biggest of all Pokémon. It can dive to a depth of almost 10,000 feet on only one breath.",
  },
  {
    version: "alpha-sapphire",
    text: "When chasing prey, Wailord herds them by leaping out of the water and making a humongous splash. It is breathtaking to see this Pokémon leaping out of the sea with others in its pod.",
  },
  {
    version: "ultra-moon",
    text: "When a small Wailmer is attacked by Sharpedo or Dhelmise, its whole pod works together to protect it.",
  },
];

function entry(name: string): FlavorSource[] {
  return [
    {
      version: "shield",
      text: `${name} keeps a quiet habit written in the Pokédex. Trainers notice this habit the moment they meet it. The rest of the entry is short and plain.`,
    },
    {
      version: "sun",
      text: `Old notes say ${name} wanders far from home. That line is older, so a newer entry wins.`,
    },
  ];
}

function sheet(id: number, name: string, entries: FlavorSource[]): MonSheet {
  const wailord = name === "Wailord";
  return {
    id,
    name,
    genus: wailord ? "Float Whale Pokémon" : "Seed Pokémon",
    types: wailord ? ["water"] : ["grass", "poison"],
    heightDecimetres: wailord ? 145 : 7,
    weightHectograms: wailord ? 3980 : 69,
    stats: [
      { name: "hit points", value: wailord ? 170 : 45 },
      { name: "attack", value: 49 },
      { name: "defense", value: 49 },
      { name: "special attack", value: 65 },
      { name: "special defense", value: 65 },
      { name: "speed", value: 45 },
    ],
    abilityName: wailord ? "Water Veil" : "Overgrow",
    abilityEffect: wailord
      ? "Prevents burns."
      : "Powers up Grass-type moves when the Pokémon's HP is low.",
    evolution: wailord
      ? "Wailmer becomes Wailord at level 40."
      : `${name} becomes Ivysaur at level 16.`,
    habitat: "Look for it in grassland.",
    entries,
  };
}

function fixtureSheets(): MonSheet[] {
  const ids = [
    [1, "Bulbasaur"],
    [4, "Charmander"],
    [7, "Squirtle"],
    [25, "Pikachu"],
    [133, "Eevee"],
    [39, "Jigglypuff"],
    [143, "Snorlax"],
    [94, "Gengar"],
    [321, "Wailord"],
  ] as const;
  return ids.map(([id, name]) => sheet(id, name, name === "Wailord" ? WAILORD : entry(name)));
}

describe("Pokédex entries", () => {
  it("speaks the newest English entry and skips feet when a later entry exists", () => {
    const chosen = pickDexEntry(WAILORD);
    assert.equal(chosen.version, "Ultra Moon");
    assert.match(chosen.text, /whole pod works together/);
    assert.doesNotMatch(chosen.text, /feet/);
  });

  it("hides the answer name inside three Pokédex clues", () => {
    const clues = threeClues("Bulbasaur", entry("Bulbasaur"));
    assert.equal(clues.length, 3);
    for (const clue of clues) assert.doesNotMatch(clue, /Bulbasaur/);
  });

  it("keeps a dex entry to name, type, description, and size", () => {
    const text = dexBlurb(
      {
        ...sheet(1, "Bulbasaur", entry("Bulbasaur")),
        evolution:
          "Eevee becomes Vaporeon with a Water Stone. Eevee becomes Jolteon with a Thunder Stone. Eevee becomes Flareon with a Fire Stone. Eevee becomes Espeon by leveling up once it is very happy during the day.",
      },
      "1",
    );
    assert.match(text, /^This is Bulbasaur\. It is number 1\./);
    assert.match(text, /It is a Grass and Poison type\./);
    assert.match(text, /It is the Seed Pokémon\./);
    assert.match(text, /It weighs 6\.9 kilograms\. It is 70 centimetres tall\./);
    assert.match(text, /Its ability is Overgrow\. It powers up Grass-type moves when its hit points are low\./);
    const lowHealth = dexBlurb(
      {
        ...sheet(1, "Bulbasaur", entry("Bulbasaur")),
        abilityEffect: "Strengthens Grass moves to inflict 1.5× damage at 1/3 max HP or less.",
      },
      "1",
    );
    assert.match(lowHealth, /one and a half times the damage when a third of its hit points are left/);
    assert.doesNotMatch(lowHealth, /inflict 1\./);
    const fragment = dexBlurb(
      {
        ...sheet(25, "Pikachu", [
          {
            version: "yellow",
            text: "Possesses cheek sacs in which it stores electricity. This clever forest-dweller roasts tough berries.",
          },
        ]),
        genus: "Mouse Pokémon",
        types: ["electric"],
        heightDecimetres: 4,
        weightHectograms: 60,
        abilityName: "Static",
        abilityEffect: "Has a 30% chance of paralyzing attacking Pokémon on contact.",
        evolution: "Pichu becomes Pikachu by leveling up once it is very happy.",
      },
      "4",
    );
    assert.match(fragment, /It possesses cheek sacs/);
    assert.match(fragment, /It is an Electric type\./);
    assert.match(fragment, /It has a 30 percent chance of paralyzing a Pokémon that attacks it\./);
    assert.match(text, /It can become Vaporeon, Jolteon, Flareon, and others\./);
    assert.match(text, /It lives in grassland\./);
    assert.doesNotMatch(text, /\bmetres\b|Attack |briefing/);
    assert.ok(text.length < 1100);
  });

  it("respells the names the narrator gets wrong", () => {
    const spoken = pronounce(
      "Venusaur, Charmeleon, Wartortle, Blastoise, Eevee, Gengar, and Wailord.",
    );
    assert.equal(
      spoken,
      "Vee nuh sore, Char me lee un, War tore tull, Blast oyss, Ee vee, Gang gar, and Way lord.",
    );
  });
});

describe("cards for ages 8 to 12", () => {
  const cards = kidCardsFromDex(fixtureSheets());

  it("ships facts and guess who", () => {
    assert.deepEqual(
      cards.map((card) => card.id),
      ["meet", "guess"],
    );
    assert.equal(cards[0]?.title, "Facts");
    assert.equal(cards[1]?.title, "Guess Who");
  });

  it("tells the child how to use the player before any facts", () => {
    for (const card of cards) {
      const start = card.chapters[0];
      assert.equal(start?.overlay, "Go");
      const script = start?.tracks.map((track) => track.text).join(" ") ?? "";
      assert.match(script, /picture/i);
      assert.match(script, /press/i);
      assert.ok(card.chapters.length <= 12);
    }
  });

  it("reads a Pokédex entry aloud and keeps the real spelling on the page", () => {
    for (const card of cards) {
      const overlays = new Set<string>();
      for (const chapter of card.chapters) {
        assert.equal(overlays.has(chapter.overlay), false);
        overlays.add(chapter.overlay);
        assert.ok(chapter.icon.startsWith("yoto:#"));
        assert.ok(chapter.picture.length > 0);
        for (const track of chapter.tracks) {
          assert.ok(track.text.length > 40);
          assert.ok(track.text.length < 1100);
          assert.ok(track.spoken.length > 40);
          assert.ok(track.icon.startsWith("yoto:#"));
          for (const banned of BANNED) {
            assert.doesNotMatch(track.text, banned);
            assert.doesNotMatch(track.spoken, banned);
          }
        }
      }
    }
    const bulbasaur = cards[0]?.chapters.find((chapter) => chapter.key === "bulbasaur");
    assert.equal(bulbasaur?.tracks.length, 1);
    const bulba = bulbasaur?.tracks[0]?.text ?? "";
    assert.match(bulba, /It is a Grass and Poison type\./);
    assert.match(bulba, /It is the Seed Pokémon\./);
    assert.match(bulba, /It weighs 6\.9 kilograms\. It is 70 centimetres tall\./);
    assert.match(bulba, /It becomes Ivysaur at level 16\./);
    assert.doesNotMatch(bulba, /\bmetres\b|Attack /);
    const wailord = cards[0]?.chapters.find((chapter) => chapter.key === "wailord");
    const whale = wailord?.tracks[0]?.text ?? "";
    assert.match(whale, /When a small Wailmer is attacked/);
    assert.match(whale, /It is a Water type\./);
    assert.match(whale, /It is the Float Whale Pokémon\./);
    assert.match(whale, /It weighs 398 kilograms\. It is 1450 centimetres tall\./);
    assert.match(whale, /Its ability is Water Veil\./);
    assert.match(wailord?.tracks[0]?.spoken ?? "", /Whale mer/);
    assert.match(wailord?.tracks[0]?.spoken ?? "", /Way lord/);
    assert.doesNotMatch(whale, /humpback|Hit points/);
  });

  it("makes Guess Who a two-part riddle that changes the picture", () => {
    const guess = cards.find((card) => card.id === "guess");
    assert.ok(guess);
    const riddles = guess.chapters.slice(1);
    assert.equal(riddles.length, 9);
    for (const riddle of riddles) {
      assert.equal(riddle.tracks.length, 2);
      assert.match(riddle.tracks[0]?.text ?? "", /One\. Two\. Three\./);
      assert.doesNotMatch(riddle.tracks[0]?.text ?? "", new RegExp(riddle.title, "i"));
      assert.equal(riddle.tracks[0]?.icon, riddle.icon);
      assert.notEqual(riddle.tracks[1]?.icon, riddle.tracks[0]?.icon);
      assert.match(riddle.tracks[1]?.text ?? "", /^It is /);
    }
  });

  it("sends the spoken spelling to Yoto", () => {
    const meet = cards[0];
    assert.ok(meet);
    const payload = buildKidCard(meet, "card-meet");
    assert.equal(payload.cardId, "card-meet");
    assert.equal(payload.title, "Champdex: Pokémon Facts");
    assert.equal(payload.content.chapters.length, meet.chapters.length);
    assert.equal(payload.content.chapters[1]?.title, "Bulbasaur");
    assert.equal(payload.content.chapters[1]?.tracks[0]?.type, "elevenlabs");
    const wailord = payload.content.chapters.find((chapter) => chapter.key === "wailord");
    assert.match(wailord?.tracks[0]?.trackUrl ?? "", /Whale mer/);
  });
});
