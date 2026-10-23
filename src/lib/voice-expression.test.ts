import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listGigantamaxForms,
  listHisuianForms,
  listLegendarySheets,
  listMegaForms,
  listMonSheets,
  listMythicalSheets,
} from "./catalogue-db";
import {
  applySpeciesSpeech,
  buildKidCard,
  entrySpeech,
  factsPlaylistUpload,
  formPlaylists,
  guessUpload,
  kidCardsFromDex,
  mulberry32,
  POKEDEX_HOWTO,
  randomGuessCard,
  randomPokedexCard,
  factPoolFromCards,
  guessPoolFromCards,
  speciesPlaylists,
  trackSpeech,
  type KidCard,
} from "./kid-cards";
import { PIPER_VOICE_ID } from "./piper-voice";
import { selectionPlaylist, type SelectionSpecies } from "./selection-playlist";
import { spokenWiki } from "./spoken-wiki";
import { expressAnswer, expressClues, expressFact, expressIntro } from "./voice-expression";
import { VOICE_SAMPLE_TEXT, voiceSampleBody } from "./voice-choice";
import { forElevenLabs, hasVoiceTags, withoutVoiceTags } from "./voice-tags";

/** Yoto refuses a spoken track longer than this, counted as sent. */
const YOTO_TEXT_LIMIT = 3000;

const TAG = /\{([a-z]+)\}/g;
const KNOWN_TAGS = new Set([
  "excited",
  "happy",
  "cheerfully",
  "curious",
  "whispers",
  "laughs",
  "chuckles",
  "gasps",
  "surprised",
  "sighs",
  "shouts",
]);

function tagsOf(script: string): string[] {
  return [...script.matchAll(TAG)].map((match) => match[1] ?? "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namesPokemon(name: string, text: string): boolean {
  return new RegExp(`(?:^|(?<=\\s))${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

const FACT =
  "Pikachu. Pikachu is a short, chubby rodent Pokémon. It is covered in yellow fur. It can store enough electricity to light a whole town. It sleeps in trees.";

const sheets = listMonSheets();
const cards = kidCardsFromDex(sheets);

/** Every spoken track a card sends, with the page text it came from. */
function sentTracks(card: KidCard) {
  const built = buildKidCard(card);
  return card.chapters.flatMap((chapter, chapterIndex) =>
    chapter.tracks.map((track, trackIndex) => ({
      chapter,
      track,
      sent: built.content.chapters[chapterIndex]?.tracks[trackIndex]?.trackUrl ?? "",
    })),
  );
}

describe("expressive fact scripts", () => {
  it("opens with a tag on the name and tags a striking line, word for word otherwise", () => {
    const script = expressFact(FACT, { dexId: 25, types: ["Electric"] });
    assert.match(script, /^\{[a-z]+\} Pikachu\. Pikachu is a short/);
    assert.match(script, /\{[a-z]+\} It can store enough electricity/);
    assert.equal(tagsOf(script).length, 2);
    assert.equal(withoutVoiceTags(script), FACT);
    assert.equal(forElevenLabs(script).includes("{"), false);
  });

  it("whispers a Ghost type's name, then brings the voice back", () => {
    const script = expressFact("Gang gar. Gang gar hides in shadows. It is said to steal the warmth from a room.", {
      dexId: 94,
      types: ["Ghost", "Poison"],
    });
    assert.match(script, /^\{whispers\} Gang gar\. \{(curious|cheerfully)\} Gang gar hides/);
    assert.equal(withoutVoiceTags(script), "Gang gar. Gang gar hides in shadows. It is said to steal the warmth from a room.");
  });

  it("never splits a name like Mr. Mime", () => {
    const script = expressFact("Mr. Mime. Mr. Mime is a mime. It is said to build invisible walls. Mr. Mime claps.", {
      dexId: 122,
    });
    assert.equal(script.includes("Mr. {"), false);
    assert.equal(withoutVoiceTags(script), "Mr. Mime. Mr. Mime is a mime. It is said to build invisible walls. Mr. Mime claps.");
  });

  it("is the same script every time for the same Pokémon, and varies across Pokémon", () => {
    assert.equal(expressFact(FACT, { dexId: 25 }), expressFact(FACT, { dexId: 25 }));
    const openers = new Set(sheets.slice(0, 99).map((sheet) => tagsOf(expressFact(FACT, { dexId: sheet.id }))[0]));
    assert.ok(openers.size >= 3, `only ${[...openers].join(", ")}`);
  });

  it("leaves a script that already has tags alone", () => {
    assert.equal(expressFact("{laughs} Ha. Ha. Ha.", { dexId: 1 }), "{laughs} Ha. Ha. Ha.");
  });

  it("tags the how-to tracks", () => {
    assert.equal(
      expressIntro("Pokefacts 1. Turn the wheel. Number 1 is Bulbasaur."),
      "{excited} Pokefacts 1. Turn the wheel. {cheerfully} Number 1 is Bulbasaur.",
    );
    assert.match(expressIntro("Who's That Pokémon, numbers 1-49. Say the name before the count ends."), /^\{curious\} .+\{excited\} Say the name/);
  });
});

describe("expressive Who's That", () => {
  it("builds suspense in the clue and reveals with a tag", () => {
    const clue = "Number 25.\nIt is yellow.\nIt stores electricity.\nIt is shorter than a ruler.\nShout your guess. One. Two. Three.";
    const tagged = expressClues(clue, { dexId: 25 });
    assert.match(tagged, /^\{(curious|cheerfully)\} Number 25\.\n/);
    assert.match(tagged, /\n\{whispers\} It is shorter than a ruler\.\n\{excited\} Shout your guess\./);
    assert.equal(withoutVoiceTags(tagged), clue);
    assert.match(expressAnswer("It's Pikachu! It grows from Pichu.", { dexId: 25 }), /^\{(excited|gasps|happy)\} It's Pikachu!/);
  });

  it("never says the name before the reveal, on every catalogue riddle", () => {
    for (const card of cards.filter((item) => item.kind === "guess")) {
      for (const { chapter, track, sent } of sentTracks(card)) {
        if (!chapter.dexId) continue;
        if (track.key === "clues") {
          assert.equal(namesPokemon(chapter.title, sent), false, `${chapter.title} clue names it`);
          assert.match(sent, /\{whispers\} /);
          assert.match(sent, /\{excited\} Shout your guess\. One\. Two\. Three\.$/);
        } else {
          assert.match(sent, /^\{[a-z]+\} It's /);
          assert.match(track.text, new RegExp(`^It's ${escapeRegExp(chapter.title.replace(/\.$/, ""))}!`));
        }
      }
    }
  });

  it("keeps the random riddle card tagged the same way", () => {
    const card = randomGuessCard(guessPoolFromCards(cards), mulberry32(3));
    const sent = guessUpload(card, {}, {}).content.content.chapters;
    sent.forEach((chapter, index) => {
      const name = card.chapters[index]?.title ?? "";
      assert.equal(namesPokemon(name, chapter.tracks[0]?.trackUrl ?? ""), false);
      assert.match(chapter.tracks[1]?.trackUrl ?? "", /^\{[a-z]+\} It's /);
    });
  });
});

describe("expressive cards", () => {
  const formEntry = (formId: number, speciesId: number, formName: string) => ({
    formId,
    speciesId,
    speciesName: formName,
    formName,
    blocks: [
      {
        kind: "paragraph" as const,
        text: `${formName} is a huge form. It is said to be the strongest of its kind. It glows.`,
      },
    ],
  });

  const everyCard: KidCard[] = [
    ...cards,
    randomPokedexCard(factPoolFromCards(cards), mulberry32(5)),
    ...speciesPlaylists("legendary", listLegendarySheets()),
    ...speciesPlaylists("mythical", listMythicalSheets()),
    ...formPlaylists("mega", listMegaForms().map((form) => formEntry(form.formId, form.speciesId, form.formName))),
    ...formPlaylists("gmax", listGigantamaxForms()),
    ...formPlaylists("hisui", listHisuianForms()),
  ];

  it("tags every spoken track, keeps the page text clean, and stays under Yoto's limit", () => {
    let tracks = 0;
    for (const card of everyCard) {
      for (const { track, sent } of sentTracks(card)) {
        tracks += 1;
        assert.equal(hasVoiceTags(track.text), false, `${card.id} ${track.key} shows a tag`);
        assert.equal(hasVoiceTags(track.spoken), false);
        assert.equal(hasVoiceTags(sent), true, `${card.id} ${track.key} has no tag`);
        assert.ok(sent.length <= YOTO_TEXT_LIMIT, `${card.id} ${track.key} is ${sent.length} long`);
        assert.ok(forElevenLabs(sent).length <= YOTO_TEXT_LIMIT);
        const tags = tagsOf(sent);
        const howTo = sent.includes(POKEDEX_HOWTO.trim());
        assert.ok(tags.length >= 1 && tags.length <= (howTo ? 4 : 3), `${card.id} ${track.key}: ${tags.join(", ")}`);
        for (const tag of tags) assert.ok(KNOWN_TAGS.has(tag), tag);
        assert.equal(withoutVoiceTags(sent), track.spoken, "Piper hears exactly the untagged script");
      }
    }
    assert.ok(tracks > 2000);
  });

  it("builds the same scripts twice", () => {
    const again = kidCardsFromDex(listMonSheets());
    assert.deepEqual(
      again.map((card) => buildKidCard(card)),
      cards.map((card) => buildKidCard(card)),
    );
  });

  it("varies the opening across one Pokefacts card", () => {
    const openers = sentTracks(cards[0] as KidCard)
      .filter(({ chapter }) => chapter.dexId)
      .map(({ sent }) => tagsOf(sent)[0]);
    assert.equal(openers.length, 99);
    const counts = new Map<string, number>();
    for (const tag of openers) counts.set(tag ?? "", (counts.get(tag ?? "") ?? 0) + 1);
    assert.ok(counts.size >= 4, [...counts.keys()].join(", "));
    assert.ok(Math.max(...counts.values()) < 50);
  });

  it("tags the Biology speech the page swaps in, and the random card's how-to", () => {
    const speech = { 25: spokenWiki("Pikachu", [{ kind: "paragraph", text: FACT.slice("Pikachu. ".length) }]) };
    const meet = applySpeciesSpeech(cards[0] as KidCard, speech);
    const pikachu = meet.chapters.find((chapter) => chapter.dexId === 25);
    assert.ok(pikachu?.tracks[0]);
    const sent = trackSpeech(pikachu.tracks[0], pikachu);
    assert.equal(sent, expressFact(FACT, pikachu));
    assert.equal(entrySpeech(FACT, pikachu), sent);
    const withHowTo = entrySpeech(`${POKEDEX_HOWTO}${FACT}`, pikachu);
    assert.equal(withHowTo, `{excited} ${POKEDEX_HOWTO}${sent}`);
  });

  it("sends tags to Piper too, which drops them before it speaks", () => {
    const sent = factsPlaylistUpload(cards[0] as KidCard, {}, undefined, PIPER_VOICE_ID);
    assert.equal(sent.voiceId, PIPER_VOICE_ID);
    const first = sent.content.content.chapters[1]?.tracks[0]?.trackUrl ?? "";
    assert.equal(hasVoiceTags(first), true);
    assert.equal(hasVoiceTags(withoutVoiceTags(first)), false);
  });
});

describe("expressive Make your own", () => {
  function species(id: number, name: string, types: string[]): SelectionSpecies {
    return {
      id,
      name,
      types,
      genus: "Mouse Pokémon",
      habitat: "forest",
      heightLabel: "40 centimetres",
      weightLabel: "6 kilograms",
      abilities: [{ name: "Static", info: "Contact may paralyze the attacker.", hidden: false }],
      evolvesFrom: null,
      evolutions: [{ name: "Raichu", method: "with a Thunder Stone" }],
      info: "It keeps electricity in its cheeks.",
      info2: "It is said to make lightning with its tail.",
      color: "Yellow",
      biology: [{ kind: "paragraph", text: FACT.slice("Pikachu. ".length) }],
    };
  }
  const picks = [species(25, "Pikachu", ["Electric"]), species(92, "Gastly", ["Ghost", "Poison"])];

  it("tags Facts and Advanced tracks the way the ready-made cards do", () => {
    for (const kind of ["facts", "advanced"] as const) {
      const { card } = selectionPlaylist(picks, kind);
      for (const { chapter, track, sent } of sentTracks(card)) {
        assert.equal(hasVoiceTags(track.text), false);
        assert.equal(withoutVoiceTags(sent), track.spoken);
        assert.ok(sent.length <= YOTO_TEXT_LIMIT);
        if (chapter.dexId === 92) assert.match(sent, /^\{whispers\} Gastly\./);
        else assert.match(sent, /^\{[a-z]+\} Pikachu\./);
      }
    }
  });

  it("keeps Who's That clues nameless and reveals with a tag", () => {
    const { card } = selectionPlaylist(picks, "whos-that");
    for (const { chapter, track, sent } of sentTracks(card)) {
      if (track.key === "clues") {
        assert.equal(namesPokemon(chapter.title, sent), false);
        assert.match(sent, /\{whispers\} /);
      } else {
        assert.match(sent, new RegExp(`^\\{[a-z]+\\} It's ${chapter.title}!`));
      }
    }
  });
});

describe("expressive voice sample", () => {
  it("shows off the tags, and reads cleanly without them", () => {
    assert.ok(tagsOf(VOICE_SAMPLE_TEXT).length >= 3);
    for (const tag of tagsOf(VOICE_SAMPLE_TEXT)) assert.ok(KNOWN_TAGS.has(tag), tag);
    assert.equal(voiceSampleBody().text, VOICE_SAMPLE_TEXT);
    assert.equal(hasVoiceTags(withoutVoiceTags(VOICE_SAMPLE_TEXT)), false);
    assert.match(withoutVoiceTags(VOICE_SAMPLE_TEXT), /^Pikachu! This Pokémon stores electricity/);
  });
});

describe("Joke Book", () => {
  it("ends each joke with a laugh, once, without touching the page text", async () => {
    const { expressTrack } = await import("./voice-expression");
    const { withoutVoiceTags } = await import("./voice-tags");
    const joke = "Here's a joke about Psyduck. Why is Psyduck always confused? ... It forgot!";
    const sent = expressTrack("joke", joke);
    assert.equal(sent, `${joke} {laughs}`);
    assert.equal(expressTrack("joke", sent), sent);
    assert.equal(withoutVoiceTags(sent), joke);
  });
});
