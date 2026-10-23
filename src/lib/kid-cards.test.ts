import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  listAlolanForms,
  listGigantamaxForms,
  listHisuianForms,
  listLegendarySheets,
  listMegaForms,
  listMonSheets,
  listMythicalSheets,
  listStarterSheets,
} from "./catalogue-db";
import { dexBlurb, pickDexEntry, riddleParts, threeClues, type FlavorSource, type MonSheet } from "./dex-facts";
import {
  applySpeciesSpeech,
  buildKidCard,
  bulkProgressLabel,
  chaptersForCries,
  countSpokenTracks,
  factPoolFromCards,
  factsBulkPlaylists,
  factsPlaylistUpload,
  formPlaylist,
  formPlaylists,
  formPlaylistUpload,
  guessPlayOrder,
  guessPoolFromCards,
  guessUpload,
  kidCardsFromDex,
  LILY_VOICE_ID,
  mulberry32,
  pokedexUpload,
  POKEDEX_HOWTO,
  randomGuessCard,
  randomPokedexCard,
  speciesPlaylists,
  shadowPixelPath,
  YOTO_TRACK_LIMIT,
} from "./kid-cards";
import { spokenWiki } from "./spoken-wiki";
import type { BiologyBlock } from "./catalogue-types";
import { readPngRgba, shadowGrey } from "./pixel-paint";
import { pronounce } from "./pronounce";
import {
  afterRejectedPlaylist,
  appendToPlaylist,
  applyFinishedAudio,
  bulkFailureText,
  contentCreateBody,
  factsBulkUpload,
  finishedPlaylistId,
  freeSlotMessage,
  libraryPlaylists,
  renderJobs,
  retitledUpload,
  uploadForPlaylist,
  type PlaylistUpload,
  type SavedCardMap,
} from "./yoto-send";
import { YOTO_VOICES } from "./yoto-icons";
import { factTrackBody } from "./voice-choice";
import { GET as getMine } from "../app/api/yoto/mine/route";
import { POST as postJob } from "../app/api/yoto/job/route";

const BANNED = [
  /kill/i,
  /death/i,
  /quarry/i,
  /stat total/i,
  /capture rate/i,
  /base stat/i,
  /Bulbapedia/i,
  /Creative Commons/i,
];

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
    slug: name.toLowerCase(),
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

  it("hides the answer name and keeps both Pokédex lines", () => {
    const clues = threeClues("Bulbasaur", entry("Bulbasaur"));
    assert.equal(clues.length, 2);
    for (const clue of clues) assert.doesNotMatch(clue, /Bulbasaur/);
    assert.match(clues[0] ?? "", /quiet habit/);
    assert.match(clues[1] ?? "", /wanders far from home/);
  });

  it("keeps a dex entry to name, type, description, and size", () => {
    const text = dexBlurb(
      {
        ...sheet(50, "Bulbasaur", entry("Bulbasaur")),
        evolution:
          "Eevee becomes Vaporeon with a Water Stone. Eevee becomes Jolteon with a Thunder Stone. Eevee becomes Flareon with a Fire Stone. Eevee becomes Espeon by leveling up once it is very happy during the day.",
      },
      "1",
    );
    assert.match(text, /^Bulbasaur\. It is number 1\./);
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
        ...sheet(26, "Pikachu", [
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
    assert.ok(text.length < 2800);
    assert.match(text, /keeps a quiet habit/);
    assert.match(text, /wanders far from home/);
    const fromDex = dexBlurb(sheet(1, "Bulbasaur", entry("Bulbasaur")), "1");
    assert.match(fromDex, /keeps a quiet habit/);
    assert.doesNotMatch(fromDex, /large plant bulb on its back/);
    const authored = dexBlurb({ ...sheet(1, "Bulbasaur", []), entries: [] }, "1");
    assert.match(authored, /large plant bulb on its back/);
  });

  it("writes the type, the Pokédex line, and a size picture", () => {
    const clues = threeClues(
      "Mew",
      [
        {
          version: "red",
          text: "So rare that it is still said to be a mirage by many experts.",
        },
      ],
      {
        types: ["psychic"],
        genus: "New Species Pokémon",
        heightDecimetres: 4,
        weightHectograms: 40,
        habitat: null,
      },
    );
    assert.equal(clues.length, 3);
    assert.match(clues[0] ?? "", /It is a Psychic type\./);
    assert.match(clues[1] ?? "", /mirage/);
    assert.match(clues[2] ?? "", /about as tall as a cat/);
    for (const clue of clues) assert.doesNotMatch(clue, /\bMew\b/i);
    const mime = threeClues("Mr. Mime", [
      {
        version: "red",
        text: "Mr. Mime is a master of pantomime and can make walls of thin air.",
      },
    ]);
    assert.equal(mime.length, 1);
    assert.match(mime[0] ?? "", /master of pantomime/);
    assert.doesNotMatch(mime[0] ?? "", /Mr\. Mime/);
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
      ["meet-1", "guess-1"],
    );
    assert.equal(cards[0]?.kind, "meet");
    assert.equal(cards[1]?.kind, "guess");
    assert.equal(cards[0]?.title, "Pokefacts");
    assert.equal(cards[1]?.title, "Who's That Pokémon");
  });

  it("tells the child how to use the player before any facts", () => {
    for (const card of cards) {
      const start = card.chapters[0];
      assert.equal(start?.overlay, "Go");
      const script = start?.tracks.map((track) => track.text).join(" ") ?? "";
      assert.match(script, /picture/i);
      assert.match(script, /press/i);
      assert.doesNotMatch(script, /playlist/i);
      assert.ok(countSpokenTracks(card.chapters) <= YOTO_TRACK_LIMIT);
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
          assert.ok(track.text.length < 2800);
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
    assert.equal(bulbasaur?.sprite, "/artwork/1.webp");
    const bulba = bulbasaur?.tracks[0]?.text ?? "";
    assert.match(bulba, /It is a Grass and Poison type\./);
    assert.match(bulba, /It is the Seed Pokémon\./);
    assert.match(bulba, /It weighs 6\.9 kilograms\. It is 70 centimetres tall\./);
    assert.match(bulba, /It becomes Ivysaur at level 16\./);
    assert.doesNotMatch(bulba, /\bmetres\b|Attack /);
    const wailord = cards[0]?.chapters.find((chapter) => chapter.key === "wailord");
    const whale = wailord?.tracks[0]?.text ?? "";
    assert.match(whale, /whole pod works together/);
    assert.match(whale, /It is a Water type\./);
    assert.match(whale, /It is the Float Whale Pokémon\./);
    assert.match(whale, /It weighs 398 kilograms\. It is 1450 centimetres tall\./);
    assert.match(whale, /Its ability is Water Veil\./);
    assert.match(wailord?.tracks[0]?.spoken ?? "", /Whale mer/);
    assert.match(wailord?.tracks[0]?.spoken ?? "", /Way lord/);
    assert.doesNotMatch(whale, /humpback|Hit points/);
  });

  it("makes Guess Who a two-part riddle that changes the picture", () => {
    const guess = cards.find((card) => card.kind === "guess");
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
    assertGuessScriptsStayShort(guess.chapters);
  });

  it("sends the spoken spelling to Yoto", () => {
    const meet = cards[0];
    assert.ok(meet);
    const payload = buildKidCard(meet, "card-meet");
    assert.equal(payload.cardId, "card-meet");
    assert.equal(payload.title, meet.libraryTitle);
    assert.match(payload.title, /^Pokefacts 1$/);
    assert.equal(payload.metadata.title, payload.title);
    assert.doesNotMatch(payload.title, /[–—]|Champdex/);
    assert.equal(payload.content.chapters.length, meet.chapters.length);
    assert.equal(payload.content.chapters[1]?.title, "Bulbasaur");
    assert.equal(payload.content.chapters[1]?.tracks[0]?.type, "elevenlabs");
    const wailord = payload.content.chapters.find((chapter) => chapter.key === "wailord");
    assert.match(wailord?.tracks[0]?.trackUrl ?? "", /Whale mer/);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clueNamesPokemon(name: string, text: string): boolean {
  const token = escapeRegExp(name);
  return new RegExp(`(?:^|(?<=\\s))${token}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

const GUESS_LECTURE = /picture changes|Turn to another number/i;

function assertGuessScriptsStayShort(
  chapters: Array<{ dexId?: number; tracks: Array<{ text: string; spoken: string }> }>,
) {
  for (const chapter of chapters) {
    for (const track of chapter.tracks) {
      assert.doesNotMatch(track.text, GUESS_LECTURE);
      assert.doesNotMatch(track.spoken, GUESS_LECTURE);
    }
    if (!chapter.dexId) continue;
    const clue = chapter.tracks[0]?.text ?? "";
    const answer = chapter.tracks[1]?.text ?? "";
    assert.match(clue, new RegExp(`^Number ${chapter.dexId}\\.`));
    assert.match(clue, /Shout your guess\. One\. Two\. Three\.$/);
    const parts = riddleParts(clue);
    assert.equal(parts.countdown, "Shout your guess. One. Two. Three.");
    assert.ok(parts.clues.length >= 2 && parts.clues.length <= 4);
    for (const line of parts.clues) {
      assert.equal(answer.includes(line), false);
    }
  }
}

function spokenTracks(card: { chapters: Array<{ tracks: unknown[] }> }): number {
  return countSpokenTracks(card.chapters);
}

describe("every national species", () => {
  const sheets = listMonSheets();
  const cards = kidCardsFromDex(sheets);
  const facts = cards.filter((card) => card.kind === "meet");
  const guess = cards.filter((card) => card.kind === "guess");

  it("splits the dex into 11 Facts cards and 21 Guess Who cards", () => {
    assert.equal(sheets.length, 1025);
    assert.equal(facts.length, 11);
    assert.equal(guess.length, 21);
    assert.equal(facts[0]?.rangeLabel, "Pokefacts 1 (1-99)");
    assert.equal(facts[0]?.libraryTitle, "Pokefacts 1");
    assert.equal(facts[1]?.libraryTitle, "Pokefacts 2");
    assert.equal(facts[10]?.libraryTitle, "Pokefacts 11");
    assert.equal(facts[10]?.rangeLabel, "Pokefacts 11 (991-1025)");
    assert.equal(guess[0]?.libraryTitle, "Who's That Pokémon");
    assert.equal(guess[0]?.rangeLabel, "Who's That Pokémon 1-49");
    assert.equal(guess[20]?.rangeLabel, "Who's That Pokémon 981-1025");
    for (const card of facts) {
      const payload = buildKidCard(card);
      assert.equal(payload.title, card.libraryTitle);
      assert.equal(payload.metadata.title, payload.title);
      assert.match(payload.title, /^Pokefacts \d+$/);
      assert.doesNotMatch(`${payload.title} ${payload.metadata.title}`, /[–—]|Champdex/);
    }
    assert.equal(spokenTracks(facts[0]!), 100);
    assert.equal(spokenTracks(facts[10]!), 36);
    assert.equal(spokenTracks(guess[0]!), 99);
    assert.equal(spokenTracks(guess[20]!), 91);
  });

  it("keeps every playlist at or under 100 tracks and uses each id once", () => {
    const expected = Array.from({ length: 1025 }, (_, index) => index + 1);
    for (const group of [facts, guess]) {
      const ids = group.flatMap((card) =>
        card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.dexId] : [])),
      );
      assert.deepEqual(ids, expected);
      for (const card of group) {
        assert.ok(spokenTracks(card) <= YOTO_TRACK_LIMIT);
        assert.ok(spokenTracks(card) > 0);
      }
    }
  });

  it("still reads Bulbasaur in metric, and hides the name on a clue track", () => {
    const bulbasaur = facts[0]?.chapters.find((chapter) => chapter.dexId === 1);
    const text = bulbasaur?.tracks[0]?.text ?? "";
    assert.match(text, /It is a Grass and Poison type\./);
    assert.match(text, /It weighs 6\.9 kilograms\. It is 70 centimetres tall\./);
    assert.match(text, /nutrients that are stored in the seed on its back/);
    assert.doesNotMatch(text, /\bHP\b|\bAttack\b|feet|pounds/);
    const riddle = guess[0]?.chapters.find((chapter) => chapter.dexId === 1);
    assert.ok(riddle);
    assert.equal(riddle.tracks[0]?.icon, riddle.icon);
    assert.match(riddle.tracks[0]?.text ?? "", /One\. Two\. Three\./);
    assert.doesNotMatch(riddle.tracks[0]?.text ?? "", /Bulbasaur/i);
    assert.match(riddle.tracks[1]?.text ?? "", /^It is Bulbasaur\./);
    assert.notEqual(riddle.tracks[1]?.icon, riddle.tracks[0]?.icon);
    for (const card of guess) {
      assertGuessScriptsStayShort(card.chapters);
      for (const chapter of card.chapters) {
        if (!chapter.dexId) continue;
        const clue = chapter.tracks[0]?.text ?? "";
        const sheet = sheets.find((item) => item.id === chapter.dexId);
        const hidden = [chapter.title, sheet?.evolvesFrom, ...(sheet?.evolvesInto ?? [])].filter(
          (name): name is string => Boolean(name),
        );
        for (const name of hidden) assert.equal(clueNamesPokemon(name, clue), false, `${chapter.dexId} ${name}`);
        assert.match(clue, /\btype\b/i);
        assert.match(clue, /tall as|shorter than|taller than|heavy as|heavier than|lighter than/);
        assert.match(chapter.tracks[1]?.text ?? "", /^It is /);
        assert.equal(chapter.tracks[0]?.lead, "cry");
        assert.equal(chapter.tracks[1]?.lead, "cry");
      }
    }
  });

  it("speaks a short Croconaw riddle and does not repeat the dex line", () => {
    const croconaw = sheets.find((sheet) => sheet.id === 159);
    assert.ok(croconaw);
    const riddle = guess.flatMap((card) => card.chapters).find((chapter) => chapter.dexId === 159);
    assert.ok(riddle);
    const clue = riddle.tracks[0]?.text ?? "";
    const answer = riddle.tracks[1]?.text ?? "";
    const flavor = croconaw.entries.map((entry) => entry.text).join(" ");
    const parts = riddleParts(clue);
    assert.match(clue, /^Number 159\./);
    assert.equal(parts.countdown, "Shout your guess. One. Two. Three.");
    assert.match(parts.clues[0] ?? "", /Water type/);
    assert.match(parts.clues.at(-1) ?? "", /tall|heavy|lighter|shorter/);
    assert.ok((parts.clues[1] ?? "").length > 20);
    assert.equal(answer, "It is Croconaw. It grows from Totodile and becomes Feraligatr.");
    assert.doesNotMatch(clue, /\bCroconaw\b/i);
    assert.match(answer, /^It is Croconaw\./);
    assert.equal(answer.includes(flavor), false);
    assert.doesNotMatch(`${clue} ${answer}`, GUESS_LECTURE);
    assert.equal(riddle.tracks[0]?.lead, "cry");
    assert.equal(riddle.tracks[1]?.lead, "cry");
    for (const line of parts.clues) {
      assert.equal(answer.includes(line), false);
    }
  });

  it("reads Virizion as colour and type, two Pokédex lines, then size", () => {
    const riddle = guess.flatMap((card) => card.chapters).find((chapter) => chapter.dexId === 640);
    assert.ok(riddle);
    const parts = riddleParts(riddle.tracks[0]?.text ?? "");
    assert.deepEqual(parts.clues, [
      "It is green, and it is a Grass and Fighting type.",
      "It darts around opponents with a flurry of quick movements, slicing them up with its horns.",
      "It fought humans in order to protect its friends. Legends about it continue to be passed down.",
      "It is about as tall as a doorway and about as heavy as a motorbike.",
    ]);
    assert.equal(parts.countdown, "Shout your guess. One. Two. Three.");
    assert.equal(clueNamesPokemon("Virizion", riddle.tracks[0]?.text ?? ""), false);
  });
});

function pngInfoFile(file: string) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

function pngInfo(id: number) {
  return pngInfoFile(`public/pixels/${id}.png`);
}

describe("pixel icons for the Yoto screen", () => {
  it("keeps every icon's background clear and fades every shadow from grey to near-black", () => {
    const files = readdirSync("public/pixels").filter((name) => name.endsWith(".png"));
    assert.equal(files.length, 2050);
    for (const name of files) {
      const decoded = readPngRgba(readFileSync(`public/pixels/${name}`));
      assert.equal(decoded.width, 16, name);
      assert.equal(decoded.height, 16, name);
      let lit = 0;
      for (let index = 0; index < decoded.rgba.length; index += 4) {
        const alpha = decoded.rgba[index + 3];
        assert.ok(alpha === 0 || alpha === 255, `${name} has a half-clear pixel`);
        if (alpha === 0) continue;
        lit += 1;
        if (!name.endsWith("-shadow.png")) continue;
        const [red, green, blue] = decoded.rgba.subarray(index, index + 3);
        const grey = shadowGrey(Math.floor(index / 64));
        assert.ok(red === green && green === blue, `${name} shadow has colour`);
        assert.ok(Math.abs((red ?? 0) - grey) <= 1, `${name} shadow is not the grey for its row`);
      }
      assert.ok(lit > 0 && lit < 256, `${name} needs a creature and a clear background`);
    }
    const bulbasaur = readPngRgba(readFileSync("public/pixels/1.png"));
    let occupiedRows = 0;
    for (let y = 0; y < 16; y += 1) {
      if (bulbasaur.rgba.subarray(y * 64, y * 64 + 64).some((value, i) => i % 4 === 3 && value === 255)) {
        occupiedRows += 1;
      }
    }
    assert.ok(occupiedRows >= 12, `Bulbasaur should fill the Yoto face, not sit in a few pixels (${occupiedRows} rows).`);
  });
});

describe("random Pokedex playlist", () => {
  const pool = factPoolFromCards(kidCardsFromDex(listMonSheets()));

  it("sends 100 unique Pokémon with their pixels and Lily’s voice", () => {
    const first = randomPokedexCard(pool, mulberry32(1));
    const same = randomPokedexCard(pool, mulberry32(1));
    const second = randomPokedexCard(pool, mulberry32(2));
    const ids = first.chapters.map((chapter) => chapter.dexId);
    assert.equal(ids.length, 100);
    assert.equal(new Set(ids).size, 100);
    for (const id of ids) {
      assert.equal(typeof id, "number");
      assert.ok(id !== undefined && id >= 1 && id <= 1025);
      const png = pngInfo(id as number);
      assert.deepEqual(png, { width: 16, height: 16, colorType: 6 });
    }
    assert.deepEqual(
      same.chapters.map((chapter) => chapter.dexId),
      ids,
    );
    assert.notDeepEqual(
      second.chapters.map((chapter) => chapter.dexId),
      ids,
    );
    assert.equal(first.chapters[0]?.sprite, `/artwork/${first.chapters[0]?.dexId}.webp`);
    assert.equal(countSpokenTracks(first.chapters), 100);
    assert.equal(first.chapters.some((chapter) => chapter.key === "start"), false);

    const media = Object.fromEntries(ids.map((id) => [id, `pixel-${id}`]));
    const sent = pokedexUpload(first, media);
    assert.equal(sent.voiceId, LILY_VOICE_ID);
    assert.equal(sent.voiceId, "pFZP5JQG7iQjIQuC4Bku");
    assert.equal(sent.content.content.chapters.length, 100);
    sent.content.content.chapters.forEach((chapter, index) => {
      const id = Number(chapter.overlayLabel);
      assert.equal(chapter.display.icon16x16, `yoto:#pixel-${id}`);
      assert.equal(chapter.tracks.length, 1);
      const track = chapter.tracks[0];
      assert.equal(track?.type, "elevenlabs");
      assert.equal(track?.voiceId, LILY_VOICE_ID);
      assert.equal(track?.display.icon16x16, `yoto:#pixel-${id}`);
      assert.match(track?.trackUrl ?? "", /kilograms/);
      assert.match(track?.trackUrl ?? "", /centimetres/);
      assert.ok((track?.trackUrl.length ?? 0) <= 3000);
      if (index === 0) assert.match(track?.trackUrl ?? "", /drawn at random/);
    });
    const again = pokedexUpload(first, media);
    assert.deepEqual(
      again.content.content.chapters.map((chapter) => chapter.overlayLabel),
      sent.content.content.chapters.map((chapter) => chapter.overlayLabel),
    );
  });

  it("the job route accepts this 100-Pokémon playlist", async () => {
    const card = randomPokedexCard(pool, mulberry32(4));
    const ids = card.chapters.map((chapter) => chapter.dexId ?? 0);
    const sent = pokedexUpload(
      card,
      Object.fromEntries(ids.map((id) => [id, `pixel-${id}`])),
    );
    const original = globalThis.fetch;
    let url = "";
    globalThis.fetch = async (input) => {
      url = String(input);
      return new Response(JSON.stringify({ jobId: "job-100", status: "queued" }), { status: 202 });
    };
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"x".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sent),
        }),
      );
      assert.equal(response.status, 202);
      assert.match(url, /voiceId=pFZP5JQG7iQjIQuC4Bku/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("returns Yoto's raw 400 body instead of hiding it", async () => {
    const card = randomPokedexCard(pool, mulberry32(4));
    const ids = card.chapters.map((chapter) => chapter.dexId ?? 0);
    const sent = pokedexUpload(
      card,
      Object.fromEntries(ids.map((id) => [id, `pixel-${id}`])),
    );
    const yotoBody = JSON.stringify({ message: "Request failed with status code 400" });
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(yotoBody, { status: 400 });
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"x".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sent),
        }),
      );
      assert.equal(response.status, 400);
      const payload = (await response.json()) as { message?: string; yotoBody?: string };
      assert.equal(payload.yotoBody, yotoBody);
      assert.match(payload.message ?? "", /Request failed with status code 400/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("bulk Facts upload", () => {
  const cards = kidCardsFromDex(listMonSheets());
  const bulk = factsBulkPlaylists(cards);

  it("names the first playlist Pokefacts 1 and does not say Facts 1", () => {
    const first = bulk[0];
    assert.ok(first);
    const progress = bulkProgressLabel(1, bulk.length);
    const sent = factsPlaylistUpload(first, { 1: "pixel" });
    assert.equal(progress, "Recording Pokefacts 1 of 11");
    assert.equal(sent.content.title, "Pokefacts 1");
    assert.equal(sent.content.metadata.title, "Pokefacts 1");
    assert.equal(sent.content.cardId, undefined);
    const shown = `${progress} ${sent.content.title} ${first.rangeLabel}`;
    assert.equal(shown.includes("Facts 1"), false);
    assert.equal(shown.includes("Recording Facts"), false);
    assert.equal(shown.includes("Facts 1–99"), false);
    assert.equal(shown.includes("–"), false);
    const replaced = factsPlaylistUpload(first, { 1: "pixel" }, "ab12C");
    assert.equal(replaced.content.title, "Pokefacts 1");
    assert.equal(replaced.content.cardId, "ab12C");
    const stale = factsPlaylistUpload(first, { 1: "pixel" }, "deleted-card");
    assert.equal(stale.content.cardId, undefined);
    const bulkBody = factsBulkUpload(first, { 1: "pixel" });
    assert.equal(bulkBody.create, true);
    assert.equal(bulkBody.content.title, "Pokefacts 1");
    assert.equal(bulkBody.content.metadata?.title, "Pokefacts 1");
    assert.equal(Object.hasOwn(bulkBody.content, "cardId"), false);
    assert.equal(JSON.stringify(bulkBody.content).includes('"cardId"'), false);
  });

  it("drops a stored card id on a 400 and retries that playlist as a create", () => {
    const yotoBody = JSON.stringify({ message: "Request failed with status code 400" });
    const store: SavedCardMap = {};
    const created: string[] = [];
    for (const card of bulk) store[card.id] = "ab12C";
    for (const card of bulk) {
      let upload: PlaylistUpload = factsPlaylistUpload(card, { 1: "pixel" }, store[card.id]);
      let saved: SavedCardMap = { ...store };
      let retried = false;
      let placed = false;
      while (!placed) {
        if (upload.content.cardId) {
          const decision = afterRejectedPlaylist({
            playlistId: card.id,
            upload,
            status: 400,
            body: { message: "Request failed with status code 400", yotoBody },
            store: saved,
            retried,
          });
          saved = decision.store;
          if (!Object.hasOwn(saved, card.id)) delete store[card.id];
          assert.equal(decision.action, "retry-create");
          if (decision.action !== "retry-create") break;
          assert.equal(Object.hasOwn(decision.store, card.id), false);
          assert.equal(decision.upload.create, true);
          assert.equal(Object.hasOwn(decision.upload.content, "cardId"), false);
          assert.equal(decision.upload.content.title, card.libraryTitle);
          upload = decision.upload;
          retried = true;
          continue;
        }
        assert.equal(upload.content.title, card.libraryTitle);
        assert.equal(Object.hasOwn(upload.content, "cardId"), false);
        created.push(upload.content.title ?? "");
        placed = true;
      }
    }
    assert.deepEqual(
      created,
      Array.from({ length: 11 }, (_, index) => `Pokefacts ${index + 1}`),
    );
    assert.equal(created[0], "Pokefacts 1");
    assert.equal(Object.keys(store).length, 0);
    const stopped = bulkFailureText({
      headline: "Recording Pokefacts 1 of 11",
      rangeLabel: bulk[0]?.rangeLabel ?? "",
      reason: `Request failed with status code 400 ${yotoBody}`,
      createdTitles: [],
    });
    assert.equal(stopped.includes("already in your library"), false);
    assert.match(stopped, /Request failed with status code 400/);
    assert.match(stopped, /\{"message":"Request failed with status code 400"\}/);
  });

  it("turns a 502 HTML body into a short timeout and does not claim playlist 1 was saved", () => {
    const html =
      "<!DOCTYPE html><html><head><title>trycloudflare.com | 502: Bad gateway</title></head><body>Error code 502</body></html>";
    const message = bulkFailureText({
      headline: "Recording Pokefacts 1 of 11",
      rangeLabel: "Pokefacts 1 (1-99)",
      reason: html,
      createdTitles: [],
      playlistIndex: 1,
      gateway: true,
    });
    assert.match(message, /The public link timed out or the server was unreachable\. Retry\./);
    assert.equal(message.includes("already in your library"), false);
    assert.equal(message.includes("<!DOCTYPE"), false);
    assert.equal(message.includes("·"), false);
    const plain = bulkFailureText({
      headline: "Recording Pokefacts 1 of 11",
      rangeLabel: bulk[0]?.rangeLabel ?? "",
      reason: "Yoto did not accept this card.",
      createdTitles: [],
      playlistIndex: 1,
    });
    assert.equal(plain.includes("already in your library"), false);
    const later = bulkFailureText({
      headline: "Recording Pokefacts 2 of 11",
      rangeLabel: bulk[1]?.rangeLabel ?? "",
      reason: "Yoto did not accept this card.",
      createdTitles: ["Pokefacts 1"],
      playlistIndex: 2,
    });
    assert.match(later, /Playlists before this one are already in your library/);
    const gatewayLater = bulkFailureText({
      headline: "Recording Pokefacts 2 of 11",
      rangeLabel: bulk[1]?.rangeLabel ?? "",
      reason: html,
      createdTitles: ["Pokefacts 1"],
      playlistIndex: 2,
      gateway: true,
    });
    assert.equal(gatewayLater.includes("already in your library"), false);
    assert.equal(gatewayLater.includes("<!DOCTYPE"), false);
  });

  it("sends Pokefacts 1 to Yoto with no card id when the bulk flag is set", async () => {
    const first = bulk[0];
    assert.ok(first);
    const created = factsBulkUpload(first, { 1: "pixel" });
    const sneaky = { ...created, content: { ...created.content, cardId: "ab12C" } };
    const original = globalThis.fetch;
    let posted = "";
    globalThis.fetch = async (_input, init) => {
      posted = String(init?.body ?? "");
      return new Response(JSON.stringify({ jobId: "job-facts", status: "queued" }), { status: 202 });
    };
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"x".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sneaky),
        }),
      );
      assert.equal(response.status, 202);
      const upstream = JSON.parse(posted) as { title?: string; cardId?: string; metadata?: { title?: string } };
      assert.equal(upstream.title, "Pokefacts 1");
      assert.equal(upstream.metadata?.title, "Pokefacts 1");
      assert.equal(Object.hasOwn(upstream, "cardId"), false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("creates Pokefacts 1 from one finished track at a time and sends no card id", async () => {
    const first = bulk[0];
    assert.ok(first);
    const script = factsBulkUpload(first, { 1: "pixel" });
    const jobs = renderJobs(first.libraryTitle, first, script);
    assert.equal(jobs.filter((job) => job.dexId).length, 99);
    assert.equal(jobs[12]?.progress, "Pokefacts 1, track 12 of 99");
    assert.equal(jobs[0]?.progress, "Pokefacts 1, introduction");
    const audio = Object.fromEntries(
      jobs.map((job, index) => [
        job.key,
        {
          trackUrl: `yoto:#${String(index).padStart(43, "a")}`,
          duration: 2,
          fileSize: 8,
          format: "mp3",
          channels: "mono" as const,
        },
      ]),
    );
    const upload = applyFinishedAudio(script, audio);
    assert.equal(upload.create, true);
    assert.equal(upload.content.title, "Pokefacts 1");
    assert.equal(upload.content.metadata?.title, "Pokefacts 1");
    assert.equal(Object.hasOwn(upload.content, "cardId"), false);
    const tracks = (
      upload.content.content as { chapters: Array<{ tracks: Array<{ type?: string; trackUrl?: string; display?: { icon16x16?: string } }> }> }
    ).chapters.flatMap((chapter) => chapter.tracks);
    assert.ok(tracks.length <= YOTO_TRACK_LIMIT);
    assert.ok(tracks.every((track) => track.type === "audio" && track.trackUrl?.startsWith("yoto:#")));
    const sneaky = { ...upload, content: { ...upload.content, cardId: "ab12C" } };
    const original = globalThis.fetch;
    let url = "";
    let posted = "";
    globalThis.fetch = async (input, init) => {
      url = String(input);
      posted = String(init?.body ?? "");
      return new Response(JSON.stringify({ card: { cardId: "ab12C", title: "Pokefacts 1" } }), { status: 200 });
    };
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"x".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sneaky),
        }),
      );
      assert.equal(response.status, 200);
      assert.equal(url, "https://api.yotoplay.com/content");
      const upstream = JSON.parse(posted) as {
        title?: string;
        cardId?: string;
        metadata?: { title?: string; media?: { duration?: number; fileSize?: number } };
        content?: {
          chapters?: Array<{
            key?: string;
            tracks?: Array<{ uid?: string; type?: string; trackUrl?: string }>;
          }>;
        };
      };
      assert.equal(upstream.title, "Pokefacts 1");
      assert.equal(Object.hasOwn(upstream.metadata ?? {}, "title"), false);
      assert.equal(typeof upstream.metadata?.media?.duration, "number");
      assert.equal(Object.hasOwn(upstream, "cardId"), false);
      const postedTracks = upstream.content?.chapters?.flatMap((chapter) => chapter.tracks ?? []) ?? [];
      assert.ok(postedTracks.length > 0);
      assert.ok(postedTracks.every((track) => Boolean(track.uid) && (track.uid?.length ?? 0) <= 20 && track.type === "audio"));
      assert.ok(upstream.content?.chapters?.every((chapter) => (chapter.key?.length ?? 0) <= 20 && (chapter.key?.length ?? 0) > 0));
      const body = (await response.json()) as { status?: string; result?: { cardId?: string; title?: string } };
      assert.equal(body.status, "completed");
      assert.equal(body.result?.cardId, "ab12C");
      assert.equal(body.result?.title, "Pokefacts 1");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("builds a Yoto create body the content API accepts and does not claim a card without an id", () => {
    const icon = "yoto:#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const created = contentCreateBody({
      title: "Pokefacts 1",
      cardId: "ab12C",
      metadata: { title: "Pokefacts 1", description: "Cry, then Lily." },
      content: {
        chapters: [
          {
            key: "this-chapter-key-is-way-too-long",
            title: "Bulbasaur",
            display: { icon16x16: icon },
            tracks: [
              {
                key: "this-track-key-is-also-too-long",
                title: "Bulbasaur",
                trackUrl: "yoto:#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                type: "audio",
                format: "opus",
                channels: 1,
                duration: 12,
                fileSize: 3400,
                display: { icon16x16: icon },
                voiceId: "pFZP5JQG7iQjIQuC4Bku",
              },
            ],
          },
        ],
      },
    });
    assert.equal(Object.hasOwn(created, "cardId"), false);
    assert.equal(Object.hasOwn(created.metadata ?? {}, "title"), false);
    const chapter = (created.content as { chapters: Array<{ key: string; tracks: Array<{ key: string; uid?: string; voiceId?: string; format?: string; channels?: string }> }> }).chapters[0];
    assert.ok(chapter);
    assert.ok(chapter.key.length <= 20);
    assert.ok((chapter.tracks[0]?.key.length ?? 0) <= 20);
    assert.equal(chapter.tracks[0]?.uid, chapter.tracks[0]?.key);
    assert.equal(chapter.tracks[0]?.voiceId, undefined);
    assert.equal(chapter.tracks[0]?.format, "opus");
    assert.equal(chapter.tracks[0]?.channels, "mono");
    assert.throws(() =>
      contentCreateBody({
        title: "Pokefacts 1",
        content: {
          chapters: [
            {
              key: "start",
              title: "Start",
              display: { icon16x16: "/pixels/1.png" },
              tracks: [],
            },
          ],
        },
      }),
      /picture/,
    );
    assert.equal(finishedPlaylistId({ status: "completed", create: true, fallback: "ab12C" }), undefined);
    assert.equal(finishedPlaylistId({ status: "completed", cardId: "ab12C", create: true }), "ab12C");
    assert.equal(finishedPlaylistId({ status: "completed", cardId: "not-a-card", create: true, fallback: "ab12C" }), undefined);
  });

  it("shows Yoto's create error and does not treat it as a new card", async () => {
    const first = bulk[0];
    assert.ok(first);
    const script = factsBulkUpload(first, { 1: "a".repeat(43) });
    const jobs = renderJobs(first.libraryTitle, first, script);
    const audio = Object.fromEntries(
      jobs.map((job, index) => [
        job.key,
        { trackUrl: `yoto:#${String(index).padStart(43, "b")}`, duration: 2, fileSize: 8, format: "opus", channels: "mono" as const },
      ]),
    );
    const upload = applyFinishedAudio(script, audio);
    const yotoBody = JSON.stringify({ error: { code: "bad-request", message: "metadata.title is not allowed" } });
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(yotoBody, { status: 400 });
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: { Authorization: `Bearer ${"x".repeat(24)}`, "Content-Type": "application/json" },
          body: JSON.stringify(upload),
        }),
      );
      assert.equal(response.ok, false);
      const body = (await response.json()) as { message?: string; error?: string; yotoBody?: string };
      assert.match(`${body.message} ${body.error} ${body.yotoBody}`, /metadata\.title is not allowed/);
      assert.equal(body.message?.includes("in your Yoto library"), false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("covers every national id once and keeps each playlist at or under 100 tracks", () => {
    assert.equal(bulk.length, 11);
    const ids = bulk.flatMap((card) =>
      card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.dexId] : [])),
    );
    assert.deepEqual(
      ids,
      Array.from({ length: 1025 }, (_, index) => index + 1),
    );
    for (const card of bulk) {
      assert.equal(
        chaptersForCries(card).length,
        card.chapters.filter((chapter) => chapter.dexId).length,
      );
      assert.ok(countSpokenTracks(card.chapters) <= YOTO_TRACK_LIMIT);
      assert.ok(countSpokenTracks(card.chapters) > 0);
      const media = Object.fromEntries(
        card.chapters.flatMap((chapter) => (chapter.dexId ? [[chapter.dexId, `pixel-${chapter.dexId}`]] : [])),
      );
      const sent = factsPlaylistUpload(card, media);
      assert.equal(sent.voiceId, LILY_VOICE_ID);
      assert.ok(sent.content.content.chapters.length <= YOTO_TRACK_LIMIT);
      const tracks = sent.content.content.chapters.flatMap((chapter) => chapter.tracks);
      assert.ok(tracks.length <= YOTO_TRACK_LIMIT);
      for (const chapter of sent.content.content.chapters) {
        for (const track of chapter.tracks) {
          assert.equal(track.type, "elevenlabs");
          assert.equal(track.voiceId, LILY_VOICE_ID);
        }
        const id = Number(chapter.overlayLabel);
        if (!Number.isInteger(id) || id < 1) continue;
        assert.equal(chapter.display.icon16x16, `yoto:#pixel-${id}`);
        assert.equal(chapter.tracks[0]?.display.icon16x16, `yoto:#pixel-${id}`);
        assert.match(chapter.tracks[0]?.trackUrl ?? "", /kilograms/);
      }
    }
  });
});

describe("random Guess Who", () => {
  const cards = kidCardsFromDex(listMonSheets());
  const pool = guessPoolFromCards(cards);

  it("always includes the child's favourites, mixed in among the fifty", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const card = randomGuessCard(pool, mulberry32(seed), [25, 133, 7]);
      const ids = card.chapters.map((chapter) => chapter.dexId);
      assert.equal(ids.length, 50);
      assert.equal(new Set(ids).size, 50);
      for (const id of [25, 133, 7]) assert.ok(ids.includes(id), `seed ${seed} has ${id}`);
    }
    const spots = [1, 2, 3, 4, 5].map((seed) => randomGuessCard(pool, mulberry32(seed), [25]).chapters.findIndex((c) => c.dexId === 25));
    assert.ok(new Set(spots).size > 1, "the favourite is not always in the same place");
  });

  it("draws 50 unique riddles, hides the name, and uses the shadow then the real pixel", () => {
    const first = randomGuessCard(pool, mulberry32(7));
    const same = randomGuessCard(pool, mulberry32(7));
    const second = randomGuessCard(pool, mulberry32(8));
    assert.equal(first.id, "guess-random");
    assert.equal(first.chapters.length, 50);
    assert.equal(countSpokenTracks(first.chapters), 100);
    assert.equal(first.chapters.some((chapter) => chapter.key === "start"), false);
    const ids = first.chapters.map((chapter) => chapter.dexId);
    assert.equal(new Set(ids).size, 50);
    assert.deepEqual(same.chapters.map((chapter) => chapter.dexId), ids);
    assert.notDeepEqual(
      second.chapters.map((chapter) => chapter.dexId),
      ids,
    );

    const real: Record<number, string> = {};
    const shadow: Record<number, string> = {};
    for (const chapter of first.chapters) {
      const id = chapter.dexId;
      assert.equal(typeof id, "number");
      assert.ok(id !== undefined && id >= 1 && id <= 1025);
      const name = chapter.title;
      const clue = chapter.tracks[0];
      const answer = chapter.tracks[1];
      assert.ok(clue);
      assert.ok(answer);
      assert.match(clue.text, /One\. Two\. Three\./);
      assert.equal(clueNamesPokemon(name, clue.text), false);
      assert.match(answer.text, new RegExp(`^It is ${escapeRegExp(name)}\\.`));
      assert.doesNotMatch(`${clue.text} ${answer.text} ${clue.spoken} ${answer.spoken}`, GUESS_LECTURE);
      const parts = riddleParts(clue.text);
      assert.equal(parts.countdown, "Shout your guess. One. Two. Three.");
      assert.ok(parts.clues.length >= 2 && parts.clues.length <= 4);
      for (const line of parts.clues) {
        assert.equal(answer.text.includes(line), false);
      }
      assert.equal(chapter.icon, shadowPixelPath(id as number));
      assert.equal(clue.icon, `/pixels/${id}-shadow.png`);
      assert.equal(answer.icon, `/pixels/${id}.png`);
      assert.equal(chapter.sprite, `/pixels/${id}-shadow.png`);
      const shadowPng = pngInfoFile(`public/pixels/${id}-shadow.png`);
      const realPng = pngInfo(id as number);
      assert.deepEqual(shadowPng, { width: 16, height: 16, colorType: 6 });
      assert.deepEqual(realPng, { width: 16, height: 16, colorType: 6 });
      assert.notDeepEqual(
        readFileSync(`public/pixels/${id}-shadow.png`),
        readFileSync(`public/pixels/${id}.png`),
      );
      real[id as number] = `pixel-${id}`;
      shadow[id as number] = `shadow-${id}`;
    }

    const sent = guessUpload(first, real, shadow);
    assert.equal(sent.voiceId, LILY_VOICE_ID);
    assert.equal(sent.content.content.chapters.length, 50);
    const sentTracks = sent.content.content.chapters.flatMap((chapter) => chapter.tracks);
    assert.equal(sentTracks.length, 100);
    sent.content.content.chapters.forEach((chapter, index) => {
      const id = first.chapters[index]?.dexId;
      assert.equal(chapter.title.startsWith("Riddle "), true);
      assert.equal(chapter.display.icon16x16, `yoto:#shadow-${id}`);
      assert.equal(chapter.tracks[0]?.display.icon16x16, `yoto:#shadow-${id}`);
      assert.equal(chapter.tracks[1]?.display.icon16x16, `yoto:#pixel-${id}`);
      assert.equal(chapter.tracks[0]?.voiceId, LILY_VOICE_ID);
      assert.equal(chapter.tracks[1]?.voiceId, LILY_VOICE_ID);
      assert.equal(chapter.tracks[0]?.type, "elevenlabs");
      assert.equal(clueNamesPokemon(first.chapters[index]?.title ?? "XXXX", chapter.tracks[0]?.trackUrl ?? ""), false);
      assert.match(chapter.tracks[1]?.trackUrl ?? "", /^It is /);
    });
  });

  it("plays the cry before the clue and before the answer, and keeps the name off the clue", () => {
    const card = randomGuessCard(pool, mulberry32(7));
    assert.equal(chaptersForCries(card).length, 50);
    assert.equal(countSpokenTracks(card.chapters), 100);
    for (const chapter of card.chapters) {
      const order = guessPlayOrder(chapter);
      const name = chapter.title;
      assert.equal(order.clue[0], "cry");
      assert.equal(order.answer[0], "cry");
      assert.equal(clueNamesPokemon(name, order.clue[1] ?? ""), false);
      assert.match(order.answer[1] ?? "", new RegExp(`^It is ${escapeRegExp(name)}\\.`));
      assert.equal(chapter.tracks[0]?.lead, "cry");
      assert.equal(chapter.tracks[1]?.lead, "cry");
      assert.equal(chapter.tracks[0]?.icon.includes("-shadow"), true);
      assert.equal(chapter.tracks[1]?.icon, `/pixels/${chapter.dexId}.png`);
    }
  });
});

describe("Yoto playlist limit", () => {
  function chapter(extra = 0) {
    const tracks = [
      {
        type: "elevenlabs",
        trackUrl: "Bulbasaur. It is a Grass and Poison type. It weighs 6.9 kilograms.",
      },
    ];
    for (let index = 0; index < extra; index += 1) {
      tracks.push({
        type: "elevenlabs",
        trackUrl: `Extra line ${index}. It is 70 centimetres tall.`,
      });
    }
    return { tracks };
  }

  async function send(chapters: unknown[]) {
    return postJob(
      new Request("http://localhost/api/yoto/job", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"x".repeat(24)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voiceId: "pFZP5JQG7iQjIQuC4Bku",
          content: { title: "Facts", content: { chapters } },
        }),
      }),
    );
  }

  it("accepts a 99-chapter facts card and rejects 101 tracks", async () => {
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response(JSON.stringify({ jobId: "job-1", status: "queued" }), { status: 202 });
    };
    try {
      const accepted = await send(Array.from({ length: 99 }, () => chapter()));
      assert.equal(accepted.status, 202);
      assert.equal(called, true);

      called = false;
      const full = await send(Array.from({ length: 100 }, () => chapter()));
      assert.equal(full.status, 202);
      assert.equal(called, true);

      called = false;
      const rejected = await send([
        ...Array.from({ length: 99 }, () => chapter()),
        chapter(1),
      ]);
      assert.equal(rejected.status, 400);
      const body = (await rejected.json()) as { error?: string };
      assert.match(body.error ?? "", /100 tracks/);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

const MEGA_VENUSAUR: BiologyBlock[] = [
  { kind: "heading", level: 4, text: "Mega Venusaur" },
  {
    kind: "paragraph",
    text: "Mega Venusaur's flower grows more prominent, and two smaller pink flowers bloom, one on its forehead and one on its rear.",
  },
  {
    kind: "paragraph",
    text: "Mega Venusaur's legs and back have become sturdier to support the extra weight of the flower.",
  },
  { kind: "paragraph", text: "A third Mega Venusaur paragraph about brambles should stay unspoken." },
];

const GMAX_CHARIZARD: BiologyBlock[] = [
  { kind: "heading", level: 4, text: "Gigantamax Charizard" },
  { kind: "paragraph", text: "Gigantamax Charizard's belly is now white instead of its normal cream coloration." },
  { kind: "paragraph", text: "Its wings burn hotter while it is this size." },
  { kind: "heading", level: 3, text: "Physiology" },
  { kind: "paragraph", text: "Charizard is a draconic, bipedal Pokémon. This species Biology sentence must stay unspoken." },
];

describe("biology speech and form playlists", () => {
  it("uses the first two biology paragraphs for a fact and leaves the dex blurb off", () => {
    const cards = kidCardsFromDex(fixtureSheets());
    const facts = cards[0];
    assert.ok(facts);
    const speech = spokenWiki("Bulbasaur", [
      { kind: "paragraph", text: "One. The first biology paragraph is about the bulb." },
      { kind: "paragraph", text: "Two. The second biology paragraph is about the sun." },
      { kind: "paragraph", text: "Three. The third biology paragraph is about the soil." },
    ]);
    const next = applySpeciesSpeech(facts, { 1: speech });
    const text = next.chapters.find((chapter) => chapter.dexId === 1)?.tracks[0]?.text ?? "";
    assert.match(text, /first biology paragraph is about the bulb/);
    assert.match(text, /second biology paragraph is about the sun/);
    assert.doesNotMatch(text, /third biology paragraph|Bulbapedia|kilograms|Creative Commons/i);
    const untouched = next.chapters.find((chapter) => chapter.dexId === 4)?.tracks[0]?.text ?? "";
    assert.match(untouched, /kilograms/);
    const guess = cards.find((card) => card.kind === "guess");
    assert.ok(guess);
    assert.equal(applySpeciesSpeech(guess, { 1: speech }), guess);

    const random = randomPokedexCard(factPoolFromCards(cards), mulberry32(3));
    const firstId = random.chapters[0]?.dexId ?? 0;
    const applied = applySpeciesSpeech(random, { [firstId]: "Pikachu. It stores electricity in its cheeks." });
    assert.match(applied.chapters[0]?.tracks[0]?.text ?? "", new RegExp(`^${POKEDEX_HOWTO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(applied.chapters[0]?.tracks[0]?.text ?? "", /stores electricity/);
    assert.doesNotMatch(applied.chapters[0]?.tracks[0]?.text ?? "", /kilograms/);
  });

  it("sends Mega Evolutions with Charizard, no card id, and the form's own prose", () => {
    const forms = listMegaForms();
    const live = formPlaylist("mega", forms);
    assert.equal(live.libraryTitle, "Mega Evolutions");
    assert.ok(live.chapters.some((chapter) => chapter.title === "Mega Charizard X"));
    assert.ok(live.chapters.some((chapter) => chapter.title === "Mega Charizard Y"));
    assert.ok(live.chapters.some((chapter) => chapter.title === "Mega Meowstic (Male)"));
    assert.ok(live.chapters.some((chapter) => chapter.title === "Mega Meowstic (Female)"));
    assert.equal(live.chapters.some((chapter) => chapter.title === "Mega Meowstic"), false);
    assert.ok(live.chapters.length <= YOTO_TRACK_LIMIT);
    assert.equal(chaptersForCries(live).length, live.chapters.length);
    const megaX = live.chapters.find((chapter) => chapter.title === "Mega Charizard X");
    const megaY = live.chapters.find((chapter) => chapter.title === "Mega Charizard Y");
    assert.equal(megaX?.formId, 10034);
    assert.equal(megaY?.formId, 10035);
    const sentLive = formPlaylistUpload(
      live,
      { 10034: "mega-x-pixel", 10035: "mega-y-pixel", 6: "char-pixel" },
      "deleted-card",
    );
    assert.equal(sentLive.content.title, "Mega Evolutions");
    assert.equal(sentLive.content.metadata?.title, "Mega Evolutions");
    assert.equal(sentLive.content.cardId, undefined);
    assert.equal(Object.hasOwn(sentLive.content, "cardId"), false);
    assert.equal(megaX?.sprite, "/api/artwork/form/10034");
    assert.equal(megaX?.tracks[0]?.icon, "/api/artwork/form/10034");
    assert.equal(megaY?.tracks[0]?.icon, "/api/artwork/form/10035");
    const charizard = sentLive.content.content.chapters.find((chapter) => chapter.title === "Mega Charizard X");
    const charizardY = sentLive.content.content.chapters.find((chapter) => chapter.title === "Mega Charizard Y");
    assert.equal(charizard?.tracks[0]?.display.icon16x16, "yoto:#mega-x-pixel");
    assert.equal(charizardY?.tracks[0]?.display.icon16x16, "yoto:#mega-y-pixel");
    assert.equal(charizard?.tracks[0]?.voiceId, LILY_VOICE_ID);
    assert.equal(live.chapters.find((chapter) => chapter.title === "Mega Charizard X")?.tracks[0]?.lead, "cry");

    const card = formPlaylist("mega", [
      {
        formId: 10033,
        speciesId: 3,
        speciesName: "Venusaur",
        formName: "Mega Venusaur",
        blocks: MEGA_VENUSAUR,
      },
    ]);
    assert.equal(card.chapters[0]?.sprite, "/api/artwork/form/10033");
    assert.equal(card.chapters[0]?.icon, "/api/artwork/form/10033");
    assert.equal(card.chapters[0]?.tracks[0]?.icon, "/api/artwork/form/10033");
    const spoken = card.chapters[0]?.tracks[0]?.text ?? "";
    assert.match(spoken, /flower grows more prominent/);
    assert.match(spoken, /sturdier to support the extra weight/);
    assert.doesNotMatch(spoken, /squat, quadrupedal|brambles should stay|Bulbapedia|Creative Commons/i);
  });

  it("sends Gigantamax with Charizard and that form's prose, not the species Biology", () => {
    const forms = listGigantamaxForms();
    const live = formPlaylist("gmax", forms);
    assert.equal(live.libraryTitle, "Gigantamax");
    assert.ok(
      live.chapters.some((chapter) =>
        ["Gigantamax Charizard", "Gigantamax Pikachu", "Gigantamax Butterfree"].includes(chapter.title),
      ),
    );
    assert.ok(live.chapters.length <= YOTO_TRACK_LIMIT);
    assert.equal(chaptersForCries(live).length, live.chapters.length);
    const chapter = live.chapters.find((item) => item.title === "Gigantamax Charizard");
    assert.equal(chapter?.formId, 10196);
    const sent = formPlaylistUpload(live, { 10196: "gmax-charizard", 6: "char-pixel" });
    assert.equal(sent.content.title, "Gigantamax");
    assert.equal(sent.content.metadata?.title, "Gigantamax");
    assert.equal(Object.hasOwn(sent.content, "cardId"), false);
    assert.equal(sent.voiceId, LILY_VOICE_ID);
    assert.equal(chapter?.tracks[0]?.lead, "cry");
    assert.equal(chapter?.dexId, 6);
    assert.equal(chapter?.sprite, "/api/artwork/form/10196");
    assert.equal(chapter?.tracks[0]?.icon, "/api/artwork/form/10196");
    const uploadedGmax = sent.content.content.chapters.find((item) => item.title === "Gigantamax Charizard");
    assert.equal(uploadedGmax?.tracks[0]?.display.icon16x16, "yoto:#gmax-charizard");

    const card = formPlaylist("gmax", [
      {
        formId: 10196,
        speciesId: 6,
        speciesName: "Charizard",
        formName: "Gigantamax Charizard",
        blocks: GMAX_CHARIZARD,
      },
    ]);
    assert.equal(card.chapters[0]?.sprite, "/api/artwork/form/10196");
    assert.equal(card.chapters[0]?.tracks[0]?.icon, "/api/artwork/form/10196");
    const spoken = card.chapters[0]?.tracks[0]?.spoken ?? "";
    assert.match(spoken, /belly is now white/);
    assert.match(spoken, /wings burn hotter/);
    assert.doesNotMatch(spoken, /draconic, bipedal|Bulbapedia|Creative Commons/i);
  });

  it("sends Alolan and Hisuian forms with that form's artwork", () => {
    const alolan = listAlolanForms();
    const alola = formPlaylists("alola", alolan);
    assert.equal(alola.length, 1);
    assert.equal(alola[0]?.libraryTitle, "Alolan forms");
    assert.equal(alola[0]?.chapters.length, 18);
    assert.ok((alola[0] ? countSpokenTracks(alola[0].chapters) : 0) <= YOTO_TRACK_LIMIT);
    const rattata = alola[0]?.chapters.find((chapter) => chapter.title === "Alolan Rattata");
    assert.equal(rattata?.sprite, "/api/artwork/form/10091");
    assert.equal(rattata?.tracks[0]?.icon, "/api/artwork/form/10091");
    assert.equal(rattata?.tracks[0]?.lead, "cry");
    assert.equal(rattata?.formId, 10091);
    assert.equal(rattata?.dexId, 19);
    const sent = formPlaylistUpload(alola[0] as NonNullable<(typeof alola)[0]>, {
      10091: "alolan-rattata",
      19: "rattata-pixel",
    });
    assert.equal(sent.content.title, "Alolan forms");
    const uploaded = sent.content.content.chapters.find((chapter) => chapter.title === "Alolan Rattata");
    assert.equal(uploaded?.tracks[0]?.display.icon16x16, "yoto:#alolan-rattata");

    const hisui = formPlaylists("hisui", listHisuianForms());
    assert.equal(hisui.length, 1);
    assert.equal(hisui[0]?.chapters.length, 16);
    const growlithe = hisui[0]?.chapters.find((chapter) => chapter.title === "Hisuian Growlithe");
    assert.equal(growlithe?.sprite, "/api/artwork/form/10229");
    assert.equal(growlithe?.tracks[0]?.icon, "/api/artwork/form/10229");
    assert.equal(growlithe?.formId, 10229);

    const twins = formPlaylists("alola", [
      { formId: 1, speciesId: 6, speciesName: "Charizard", formName: "Alolan Charizard X" },
      { formId: 2, speciesId: 6, speciesName: "Charizard", formName: "Alolan Charizard Y" },
    ]);
    assert.equal(twins[0]?.chapters.map((chapter) => chapter.title).join("|"), "Alolan Charizard X|Alolan Charizard Y");
    assert.equal(twins[0]?.chapters[0]?.icon, "/api/artwork/form/1");
    assert.equal(twins[0]?.chapters[1]?.icon, "/api/artwork/form/2");
    assert.equal(twins[0]?.chapters[1]?.overlay, "6b");
  });

  it("splits a form list past 100 tracks and keeps one form per species on the first card", () => {
    const forms = Array.from({ length: 101 }, (_, index) => ({
      formId: 40000 + index,
      speciesId: index + 1,
      speciesName: `Species ${index + 1}`,
      formName: `Alolan Species ${index + 1}`,
    }));
    const split = formPlaylists("alola", forms);
    assert.equal(split.length, 2);
    assert.equal(countSpokenTracks(split[0]?.chapters ?? []), 100);
    assert.equal(countSpokenTracks(split[1]?.chapters ?? []), 1);
    assert.match(split[0]?.blurb ?? "", /Yoto holds 100 tracks, so Alolan forms are split into 2 playlists/);
    assert.equal(split[0]?.rangeLabel, "Alolan forms 1 (1-100)");
    assert.equal(split[0]?.libraryTitle, "Alolan forms 1");
    assert.equal(split[1]?.id, "alolan-forms-2");
    for (const card of split) assert.ok(countSpokenTracks(card.chapters) <= YOTO_TRACK_LIMIT);

    const paired = [];
    for (let species = 1; species <= 100; species += 1) {
      paired.push({
        formId: species,
        speciesId: species,
        speciesName: `Species ${species}`,
        formName: `Alolan Species ${species}`,
      });
      paired.push({
        formId: 1000 + species,
        speciesId: species,
        speciesName: `Species ${species}`,
        formName: `Alolan Species ${species} Extra`,
      });
    }
    const cards = formPlaylists("hisui", paired);
    assert.equal(cards.length, 2);
    assert.equal(cards[0]?.chapters.length, 100);
    assert.equal(new Set(cards[0]?.chapters.map((chapter) => chapter.dexId)).size, 100);
    assert.equal(cards[1]?.chapters.length, 100);
    assert.match(cards[0]?.blurb ?? "", /Hisuian forms are split into 2 playlists/);
  });

  it("builds cry-first legendary and mythical playlists from species artwork", () => {
    const legendarySheets = listLegendarySheets();
    const legendary = speciesPlaylists("legendary", legendarySheets);
    assert.equal(legendary.length, 1);
    assert.equal(legendary[0]?.libraryTitle, "Legendary Pokémon");
    assert.equal(legendary[0]?.chapters.length, 71);
    assert.equal(chaptersForCries(legendary[0] as NonNullable<(typeof legendary)[0]>).length, 71);
    const articuno = legendary[0]?.chapters.find((chapter) => chapter.title === "Articuno");
    assert.equal(articuno?.sprite, "/artwork/144.webp");
    assert.equal(articuno?.tracks[0]?.icon, "/pixels/144.png");
    assert.equal(articuno?.tracks[0]?.lead, "cry");
    assert.equal(articuno?.formId, undefined);
    const spoken = applySpeciesSpeech(legendary[0] as NonNullable<(typeof legendary)[0]>, {
      150: "Mewtwo. It was created by science.",
    });
    assert.match(spoken.chapters.find((chapter) => chapter.dexId === 150)?.tracks[0]?.text ?? "", /created by science/);
    assert.equal(
      spoken.chapters.find((chapter) => chapter.dexId === 144)?.tracks[0]?.text,
      articuno?.tracks[0]?.text,
    );

    const mythical = speciesPlaylists("mythical", listMythicalSheets());
    assert.equal(mythical.length, 1);
    assert.equal(mythical[0]?.chapters.length, 23);
    const mew = mythical[0]?.chapters.find((chapter) => chapter.title === "Mew");
    assert.equal(mew?.sprite, "/artwork/151.webp");
    assert.equal(mew?.tracks[0]?.icon, "/pixels/151.png");
    assert.equal(mew?.tracks[0]?.lead, "cry");
    assert.equal(mythical[0]?.chapters.some((chapter) => chapter.title === "Mewtwo"), false);

    const overflow = speciesPlaylists("legendary", listMonSheets().slice(0, 101));
    assert.equal(overflow.length, 2);
    assert.equal(countSpokenTracks(overflow[0]?.chapters ?? []), 100);
    assert.equal(countSpokenTracks(overflow[1]?.chapters ?? []), 1);
    assert.match(overflow[0]?.blurb ?? "", /Legendary Pokémon are split into 2 playlists/);
    assert.equal(overflow[0]?.rangeLabel, "Legendary Pokémon 1 (1-100)");
    assert.equal(overflow[0]?.chapters[0]?.sprite, "/artwork/1.webp");
    assert.equal(overflow[0]?.chapters[0]?.tracks[0]?.icon, "/pixels/1.png");
    for (const card of overflow) assert.ok(countSpokenTracks(card.chapters) <= YOTO_TRACK_LIMIT);
  });

  it("puts all 81 starter Pokémon on one card, cry first, from Bulbasaur to Quaquaval", () => {
    const starters = speciesPlaylists("starter", listStarterSheets());
    assert.equal(starters.length, 1);
    const card = starters[0] as NonNullable<(typeof starters)[0]>;
    assert.equal(card.id, "starters");
    assert.equal(card.kind, "starter");
    assert.equal(card.libraryTitle, "Starter Pokémon");
    assert.equal(card.rangeLabel, "Starter Pokémon");
    assert.equal(card.chapters.length, 81);
    assert.equal(countSpokenTracks(card.chapters), 81);
    assert.equal(chaptersForCries(card).length, 81);
    assert.deepEqual(
      [card.chapters[0]?.title, card.chapters[3]?.title, card.chapters[80]?.title],
      ["Bulbasaur", "Charmander", "Quaquaval"],
    );
    assert.ok(card.chapters.some((chapter) => chapter.title === "Pikachu") === false, "Pikachu is not a starter line");
    const spoken = applySpeciesSpeech(card, { 7: "Squirtle. It shelters in its shell." });
    assert.match(spoken.chapters.find((chapter) => chapter.dexId === 7)?.tracks[0]?.text ?? "", /shelters in its shell/);
  });
});

describe("voice and playlist build-up", () => {
  const george = YOTO_VOICES[1]?.id ?? "";
  const icon = "yoto:#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const oldUrl = "yoto:#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const newUrl = "yoto:#ccccccccccccccccccccccccccccccccccccccccccc";

  it("puts the selected voice on the track payload", () => {
    assert.equal(george, "JBFqnCBsd6RMkjVDRZzb");
    const track = factTrackBody({
      text: "Ivysaur waits in the grass.",
      title: "Ivysaur",
      dexId: 2,
      name: "Ivysaur",
      voiceId: george,
    });
    assert.equal(track.voiceId, george);
    const card = {
      id: "meet-1",
      kind: "meet" as const,
      title: "Pokefacts",
      rangeLabel: "Pokefacts 1 (1-1)",
      libraryTitle: "Pokefacts 1",
      blurb: "Facts.",
      childDoes: "Listen.",
      chapters: [
        {
          key: "bulbasaur",
          title: "Bulbasaur",
          overlay: "1",
          picture: "this Pokémon",
          mark: "1",
          icon: "/pixels/1.png",
          dexId: 1,
          tracks: [
            {
              key: "entry",
              title: "Bulbasaur",
              text: "Bulbasaur waits.",
              spoken: "Bulbasaur waits.",
              icon: "/pixels/1.png",
              overlay: "1",
            },
          ],
        },
      ],
    };
    const sent = factsPlaylistUpload(card, { 1: "pixel" }, undefined, george);
    assert.equal(sent.voiceId, george);
    assert.equal(sent.content.content.chapters[0]?.tracks[0]?.voiceId, george);
  });

  it("lists real playlist titles and turns a missing scope into the reconnect message", async () => {
    const listed = libraryPlaylists({
      cards: [
        { cardId: "ab12C", title: "Bedtime" },
        { cardId: "nope", title: "Skip me" },
        { cardId: "de34F", metadata: { title: "Car rides" } },
      ],
    });
    assert.deepEqual(
      listed.map((item) => item.title),
      ["Bedtime", "Car rides"],
    );
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "The user does not have the required scope(s): 'family:library:view'." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    try {
      const response = await getMine(
        new Request("http://localhost/api/yoto/mine", {
          headers: { Authorization: `Bearer ${"x".repeat(24)}` },
        }),
      );
      const body = (await response.json()) as { message?: string };
      assert.equal(body.message, "Reconnect Yoto. The saved login is missing permission.");
      assert.equal(JSON.stringify(body).includes("family:library:view"), false);
      assert.equal(JSON.stringify(body).includes("<"), false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("appends to the chosen playlist and sends no card id for a new playlist", async () => {
    const addition: PlaylistUpload = {
      voiceId: george,
      append: true,
      content: {
        title: "Pokefacts extra",
        cardId: "ab12C",
        metadata: { description: "More facts.", title: "do not keep" },
        content: {
          chapters: [
            {
              key: "ivysaur",
              title: "Ivysaur",
              overlayLabel: "2",
              display: { icon16x16: icon },
              tracks: [
                {
                  key: "entry",
                  title: "Ivysaur",
                  trackUrl: newUrl,
                  type: "audio",
                  duration: 3,
                  fileSize: 9,
                  format: "mp3",
                  channels: "mono",
                  display: { icon16x16: icon },
                },
              ],
            },
          ],
        },
      },
    };
    const created = uploadForPlaylist(addition, "");
    assert.equal(created.create, true);
    assert.equal(created.append, false);
    assert.equal(Object.hasOwn(created.content, "cardId"), false);
    const kept = uploadForPlaylist(addition, "ab12C");
    assert.equal(kept.append, true);
    assert.equal(kept.content.cardId, "ab12C");
    assert.equal(kept.create, undefined);

    const replaced = uploadForPlaylist(addition, "ab12C", "replace");
    assert.equal(replaced.replace, true);
    assert.equal(replaced.append, false);
    assert.equal(replaced.create, undefined);
    assert.equal(replaced.content.cardId, "ab12C");
    assert.equal(uploadForPlaylist(addition, "", "replace").replace, undefined, "no card to replace makes a new one");
    const renamed = retitledUpload(addition, "Bedtime 2");
    assert.equal(renamed.content.title, "Bedtime 2");
    assert.equal(addition.content.title === "Bedtime 2", false, "the original is left alone");

    // The job route sends the new tracks with the old card id, so Yoto replaces that playlist in place.
    const realFetch = globalThis.fetch;
    let replacedBody: { cardId?: string; content?: { chapters?: unknown[] } } | null = null;
    globalThis.fetch = async (_input, init) => {
      replacedBody = JSON.parse(String(init?.body ?? "null")) as typeof replacedBody;
      return new Response(JSON.stringify({ card: { cardId: "ab12C" } }), { status: 200 });
    };
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: { Authorization: `Bearer ${"x".repeat(24)}`, "Content-Type": "application/json" },
          body: JSON.stringify(replaced),
        }),
      );
      assert.equal(response.status, 200);
      const sentBody = replacedBody as { cardId?: string; content?: { chapters?: unknown[] } } | null;
      assert.equal(sentBody?.cardId, "ab12C");
      assert.equal(sentBody?.content?.chapters?.length, 1, "only the new tracks");
      assert.match(JSON.stringify(await response.json()), /ab12C/);
    } finally {
      globalThis.fetch = realFetch;
    }

    const merged = appendToPlaylist(
      {
        cardId: "ab12C",
        title: "Bedtime",
        metadata: { title: "Bedtime", description: "Already there." },
        content: {
          chapters: [
            {
              key: "old",
              title: "Old story",
              tracks: [{ key: "old-1", uid: "old-1", title: "Keep me", type: "audio", trackUrl: oldUrl, duration: 2, fileSize: 4 }],
            },
          ],
        },
      },
      addition.content,
    );
    assert.equal(merged.cardId, "ab12C");
    assert.equal(merged.title, "Bedtime");
    assert.equal(Object.hasOwn(merged.metadata ?? {}, "title"), false);
    const chapters = (merged.content as { chapters: Array<{ tracks: Array<{ trackUrl?: string }> }> }).chapters;
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0]?.tracks[0]?.trackUrl, oldUrl);
    assert.equal(chapters[1]?.tracks[0]?.trackUrl, newUrl);

    assert.throws(
      () =>
        appendToPlaylist(
          {
            cardId: "ab12C",
            title: "Bedtime",
            content: {
              chapters: [
                {
                  key: "old",
                  title: "Old",
                  tracks: Array.from({ length: 100 }, (_, index) => ({ key: `old${index}`, trackUrl: oldUrl })),
                },
              ],
            },
          },
          addition.content,
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, freeSlotMessage(0, 1));
        assert.match(error.message, /0 free slots left/);
        return true;
      },
    );

    const original = globalThis.fetch;
    let posted = "";
    let sawGet = false;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/content/ab12C") && (!init?.method || init.method === "GET")) {
        sawGet = true;
        return Response.json({
          card: {
            cardId: "ab12C",
            title: "Bedtime",
            metadata: { title: "Bedtime", description: "Already there." },
            content: {
              chapters: [
                {
                  key: "old",
                  title: "Old story",
                  tracks: [{ key: "old-1", uid: "old-1", title: "Keep me", type: "audio", trackUrl: oldUrl, duration: 2, fileSize: 4 }],
                },
              ],
            },
          },
        });
      }
      if (url === "https://api.yotoplay.com/content" && init?.method === "POST") {
        posted = String(init.body ?? "");
        return Response.json({ card: { cardId: "ab12C", title: "Bedtime" } });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"x".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(kept),
        }),
      );
      assert.equal(response.status, 200);
      assert.equal(sawGet, true);
      const upstream = JSON.parse(posted) as {
        cardId?: string;
        title?: string;
        metadata?: { title?: string };
        content?: { chapters?: Array<{ tracks?: Array<{ trackUrl?: string }> }> };
      };
      assert.equal(upstream.cardId, "ab12C");
      assert.equal(upstream.title, "Bedtime");
      assert.equal(Object.hasOwn(upstream.metadata ?? {}, "title"), false);
      const sentChapters = upstream.content?.chapters ?? [];
      assert.equal(sentChapters[0]?.tracks?.[0]?.trackUrl, oldUrl);
      assert.equal(sentChapters.at(-1)?.tracks?.[0]?.trackUrl, newUrl);
      const body = (await response.json()) as { status?: string; updated?: boolean; result?: { cardId?: string } };
      assert.equal(body.status, "completed");
      assert.equal(body.updated, true);
      assert.equal(body.result?.cardId, "ab12C");

      posted = "";
      globalThis.fetch = async (input, init) => {
        posted = String(init?.body ?? "");
        return Response.json({ card: { cardId: "zz99Z", title: "Pokefacts extra" } });
      };
      const fresh = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"x".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(created),
        }),
      );
      assert.equal(fresh.status, 200);
      const createdBody = JSON.parse(posted) as { cardId?: string };
      assert.equal(Object.hasOwn(createdBody, "cardId"), false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
