import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickDexEntry, threeClues, type FlavorSource } from "./dex-facts";
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

function fixtureDex(): Map<number, FlavorSource[]> {
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
  return new Map(ids.map(([id, name]) => [id, name === "Wailord" ? WAILORD : entry(name)]));
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
  const cards = kidCardsFromDex(fixtureDex());

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
          assert.ok(track.text.length < 700);
          assert.ok(track.spoken.length > 40);
          assert.ok(track.icon.startsWith("yoto:#"));
          for (const banned of BANNED) {
            assert.doesNotMatch(track.text, banned);
            assert.doesNotMatch(track.spoken, banned);
          }
        }
      }
    }
    const wailord = cards[0]?.chapters.find((chapter) => chapter.key === "wailord");
    assert.match(wailord?.tracks[0]?.text ?? "", /When a small Wailmer is attacked/);
    assert.match(wailord?.tracks[0]?.spoken ?? "", /Whale mer/);
    assert.match(wailord?.tracks[0]?.spoken ?? "", /Way lord|Shar pee doh/);
    assert.doesNotMatch(wailord?.tracks[0]?.text ?? "", /humpback|kilograms/);
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
