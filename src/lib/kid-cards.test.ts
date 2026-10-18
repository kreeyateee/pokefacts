import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { listMonSheets } from "./catalogue-db";
import { dexBlurb, pickDexEntry, threeClues, type FlavorSource, type MonSheet } from "./dex-facts";
import {
  buildKidCard,
  bulkProgressLabel,
  chaptersForCries,
  countSpokenTracks,
  factPoolFromCards,
  factsBulkPlaylists,
  factsPlaylistUpload,
  guessPlayOrder,
  guessPoolFromCards,
  guessUpload,
  kidCardsFromDex,
  LILY_VOICE_ID,
  mulberry32,
  pokedexUpload,
  randomGuessCard,
  randomPokedexCard,
  shadowPixelPath,
  YOTO_TRACK_LIMIT,
} from "./kid-cards";
import { pronounce } from "./pronounce";
import {
  afterRejectedPlaylist,
  applyFinishedAudio,
  bulkFailureText,
  factsBulkUpload,
  renderJobs,
  type PlaylistUpload,
  type SavedCardMap,
} from "./yoto-send";
import { POST as postJob } from "../app/api/yoto/job/route";

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

  it("hides the answer name inside three Pokédex clues", () => {
    const clues = threeClues("Bulbasaur", entry("Bulbasaur"));
    assert.equal(clues.length, 3);
    for (const clue of clues) assert.doesNotMatch(clue, /Bulbasaur/);
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

  it("writes original clues when the Pokédex has fewer than three sentences", () => {
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
    for (const clue of clues) assert.doesNotMatch(clue, /Mew/i);
    assert.doesNotThrow(() =>
      threeClues("Mr. Mime", [
        {
          version: "red",
          text: "Mr. Mime is a master of pantomime and can make walls of thin air.",
        },
      ]),
    );
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
    assert.equal(cards[1]?.title, "Guess Who");
  });

  it("tells the child how to use the player before any facts", () => {
    for (const card of cards) {
      const start = card.chapters[0];
      assert.equal(start?.overlay, "Go");
      const script = start?.tracks.map((track) => track.text).join(" ") ?? "";
      assert.match(script, /picture/i);
      assert.match(script, /press/i);
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
    assert.equal(guess[0]?.libraryTitle, "Guess Who");
    assert.equal(guess[0]?.rangeLabel, "Guess Who 1-49");
    assert.equal(guess[20]?.rangeLabel, "Guess Who 981-1025");
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
      for (const chapter of card.chapters) {
        if (!chapter.dexId) continue;
        const clue = chapter.tracks[0]?.text ?? "";
        assert.doesNotMatch(clue, new RegExp(escapeRegExp(chapter.title), "i"));
        assert.match(chapter.tracks[1]?.text ?? "", /^It is /);
      }
    }
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
      const upstream = JSON.parse(posted) as { title?: string; cardId?: string; metadata?: { title?: string } };
      assert.equal(upstream.title, "Pokefacts 1");
      assert.equal(upstream.metadata?.title, "Pokefacts 1");
      assert.equal(Object.hasOwn(upstream, "cardId"), false);
      const body = (await response.json()) as { status?: string; result?: { cardId?: string; title?: string } };
      assert.equal(body.status, "completed");
      assert.equal(body.result?.cardId, "ab12C");
      assert.equal(body.result?.title, "Pokefacts 1");
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
      assert.doesNotMatch(clue.text, new RegExp(escapeRegExp(name), "i"));
      assert.match(answer.text, new RegExp(`^It is ${escapeRegExp(name)}\\.`));
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
      assert.doesNotMatch(chapter.tracks[0]?.trackUrl ?? "", new RegExp(escapeRegExp(first.chapters[index]?.title ?? "XXXX"), "i"));
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
      assert.doesNotMatch(order.clue[1] ?? "", new RegExp(escapeRegExp(name), "i"));
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
