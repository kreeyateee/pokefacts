import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCatalogueEntry } from "./catalogue-db";
import { heightForUnits, weightForUnits } from "./format";
import { chapterPictureId, chaptersForCries, coverArtworkId, YOTO_TRACK_LIMIT, type KidCard } from "./kid-cards";
import { artworkSrc } from "./page-artwork";
import {
  advancedSpeech,
  factsSpeech,
  formSelection,
  selectionOverlays,
  selectionPickId,
  selectionPlaylist,
  selectionStickerCards,
  selectionUpload,
  speciesSelection,
  type SelectionSpecies,
} from "./selection-playlist";
import { monsFor } from "./sticker-cover";
import { spokenWiki } from "./spoken-wiki";
import { renderJobs } from "./yoto-send";

const LECTURE = /picture changes|Turn to another number|Bulbapedia/i;

function species(id: number, name = `Mon ${id}`): SelectionSpecies {
  return {
    id,
    name,
    types: ["Electric"],
    genus: "Mouse Pokémon",
    habitat: "forest",
    heightLabel: "40 centimetres",
    weightLabel: "6 kilograms",
    abilities: [
      {
        name: "Static",
        info: "Contact may paralyze the attacker.",
        hidden: false,
      },
    ],
    evolvesFrom: id === 25 ? "Pichu" : null,
    evolutions: id === 25 ? [{ name: "Raichu", method: "with a Thunder Stone" }] : [],
    info: "It keeps electricity in its cheeks.",
    biology: [
      { kind: "paragraph", text: "It stores electricity in the pouches in its cheeks." },
      { kind: "paragraph", text: "It raises its tail to check its surroundings." },
      { kind: "paragraph", text: "A third biology paragraph stays unspoken." },
    ],
  };
}

describe("catalogue selection playlists", () => {
  it("keeps picked species in order and refuses the 101st", () => {
    const picked = Array.from({ length: 101 }, (_, index) => species(index + 1));
    const built = selectionPlaylist(picked, "facts");
    const ids = built.card.chapters.map((chapter) => chapter.dexId);
    assert.deepEqual(ids, picked.slice(0, 100).map((item) => item.id));
    assert.deepEqual(built.refused, [101]);
    assert.equal(built.card.chapters.flatMap((chapter) => chapter.tracks).length, YOTO_TRACK_LIMIT);
    assert.equal(built.card.chapters.some((chapter) => chapter.dexId === 101), false);

    const ordered = selectionPlaylist([species(25, "Pikachu"), species(1, "Bulbasaur"), species(4, "Charmander")], "facts");
    assert.deepEqual(
      ordered.card.chapters.map((chapter) => chapter.dexId),
      [25, 1, 4],
    );
  });

  it("writes a different script for Who's That Pokémon, Facts, and Advanced facts", () => {
    const pikachu = species(25, "Pikachu");
    const facts = selectionPlaylist([pikachu], "facts");
    const advanced = selectionPlaylist([pikachu], "advanced");
    const whos = selectionPlaylist([pikachu], "whos-that");
    const factText = facts.card.chapters[0]?.tracks[0]?.text ?? "";
    const advancedText = advanced.card.chapters[0]?.tracks[0]?.text ?? "";
    const clue = whos.card.chapters[0]?.tracks[0]?.text ?? "";
    const answer = whos.card.chapters[0]?.tracks[1]?.text ?? "";

    assert.equal(factText, factsSpeech(pikachu));
    assert.equal(factText, spokenWiki("Pikachu", pikachu.biology));
    assert.match(factText, /stores electricity in the pouches/);
    assert.match(factText, /raises its tail/);
    assert.doesNotMatch(factText, /It weighs|third biology paragraph|Bulbapedia/);

    assert.equal(advancedText, advancedSpeech(pikachu));
    assert.notEqual(advancedText, factText);
    assert.match(advancedText, /stores electricity in the pouches/);
    assert.match(advancedText, /It weighs 6 kilograms/);
    assert.match(advancedText, /40 centimetres tall/);
    assert.match(advancedText, /Static/);
    assert.match(advancedText, /Raichu/);
    assert.doesNotMatch(advancedText, /third biology paragraph|Bulbapedia/);

    assert.notEqual(clue, factText);
    assert.notEqual(clue, advancedText);
    assert.doesNotMatch(clue, /Pikachu/i);
    assert.doesNotMatch(`${clue} ${answer}`, LECTURE);
    assert.match(clue, /^Number 25\./);
    assert.match(clue, /Shout your guess\. One\. Two\. Three\./);
    assert.match(answer, /^It is Pikachu\./);
    assert.equal(whos.card.chapters[0]?.tracks.length, 2);
  });

  it("uses the Pokédex line when biology is missing and keeps the clue name-free", () => {
    const pikachu = species(25, "Pikachu");
    pikachu.biology = [];
    const facts = selectionPlaylist([pikachu], "facts");
    const text = facts.card.chapters[0]?.tracks[0]?.text ?? "";
    assert.match(text, /^Pikachu\./);
    assert.match(text, /keeps electricity in its cheeks/);
    assert.notEqual(text, "Pikachu.");
    const advanced = advancedSpeech(pikachu);
    assert.match(advanced, /keeps electricity in its cheeks/);
    assert.match(advanced, /weighs/i);
    const whos = selectionPlaylist([pikachu], "whos-that");
    const clue = whos.card.chapters[0]?.tracks[0]?.text ?? "";
    assert.doesNotMatch(clue, /Pikachu/i);
    const withWiki = species(25, "Pikachu");
    assert.equal(factsSpeech(withWiki), spokenWiki("Pikachu", withWiki.biology));
    assert.equal(factsSpeech(withWiki).includes("keeps electricity in its cheeks"), false);
  });

  it("merges the cry in front of both the Who's That clue and the answer", () => {
    const pikachu = species(25, "Pikachu");
    const built = selectionPlaylist([pikachu], "whos-that", "My Pokémon");
    const chapter = built.card.chapters[0];
    assert.ok(chapter);
    assert.equal(chapter.tracks[0]?.lead, "cry");
    assert.equal(chapter.tracks[1]?.lead, "cry");
    assert.equal(chapter.tracks.filter((track) => track.lead === "cry").length, 2);
    assert.equal(chaptersForCries(built.card).length, 1);
    assert.equal(chapter.tracks[0]?.icon, chapter.icon);
    assert.notEqual(chapter.tracks[1]?.icon, chapter.tracks[0]?.icon);
    assert.doesNotMatch(chapter.tracks[0]?.text ?? "", /Pikachu/i);

    const upload = selectionUpload(built.card, { 25: "pixel-25" }, {
      title: built.title,
      shadowById: { 25: "shadow-25" },
    });
    assert.equal(upload.content.title, "My Pokémon");
    assert.equal(upload.create, true);
    assert.equal(Object.hasOwn(upload.content, "cardId"), false);
    assert.equal(upload.content.metadata?.title, undefined);
    const jobs = renderJobs(built.title, built.card, upload);
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0]?.dexId, 25);
    assert.equal(jobs[1]?.dexId, 25);
    assert.equal(jobs[0]?.name, "Pikachu");
    assert.equal(jobs[1]?.name, "Pikachu");
    assert.doesNotMatch(jobs[0]?.text ?? "", /Pikachu/i);
    assert.match(jobs[1]?.text ?? "", /^It is Pikachu\./);
    assert.doesNotMatch(`${jobs[0]?.text} ${jobs[1]?.text}`, LECTURE);
    const body = JSON.stringify(upload.content);
    assert.equal(body.includes("yoto:#shadow-25"), true);
    assert.equal(body.includes("yoto:#pixel-25"), true);
  });

  it("refuses a 51st Who's That Pokémon because that would be track 101", () => {
    const picked = Array.from({ length: 51 }, (_, index) => species(index + 1, `Species${index + 1}`));
    const built = selectionPlaylist(picked, "whos-that");
    assert.equal(built.card.chapters.length, 50);
    assert.equal(built.card.chapters.flatMap((chapter) => chapter.tracks).length, 100);
    assert.deepEqual(built.refused, [51]);
    assert.equal(built.title, "Who's That Pokémon Cards");
  });

  it("splits a catalogue pick into different sticker cards", () => {
    const picked = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, name: `Mon ${index + 1}` }));
    const cards = selectionStickerCards(picked, "facts", "Garden");
    assert.equal(cards.length, 2);
    assert.equal(cards[0]?.libraryTitle, "Garden 1");
    assert.equal(cards[1]?.libraryTitle, "Garden 2");
    assert.notEqual(cards[0]?.id, cards[1]?.id);
    assert.match(cards[0]?.rangeLabel ?? "", /Mon 1 to Mon 100/);
    assert.match(cards[1]?.rangeLabel ?? "", /Mon 101/);
    assert.equal(cards[0]?.chapters.length, 100);
    assert.equal(cards[1]?.chapters.length, 1);
    assert.equal(cards[0]?.chapters[0]?.dexId, 1);
    assert.equal(cards[1]?.chapters[0]?.dexId, 101);
    assert.equal(cards[1]?.kind, "meet");

    const one = selectionStickerCards([{ id: 25, name: "Pikachu" }, { id: 1, name: "Bulbasaur" }], "facts");
    assert.equal(one.length, 1);
    assert.equal(one[0]?.libraryTitle, "Fact Cards");
    assert.deepEqual(
      one[0]?.chapters.map((chapter) => chapter.dexId),
      [25, 1],
    );

    const riddles = selectionStickerCards(
      Array.from({ length: 51 }, (_, index) => ({ id: index + 1, name: `Secret ${index + 1}` })),
      "whos-that",
    );
    assert.equal(riddles.length, 2);
    assert.equal(riddles[0]?.kind, "guess");
    assert.equal(riddles[0]?.chapters.length, 50);
    assert.equal(riddles[1]?.chapters.length, 1);
    assert.equal(riddles[0]?.rangeLabel.includes("Secret"), false);
    assert.equal(selectionStickerCards([], "facts").length, 0);
  });

  it("reads advanced facts in pounds and feet when imperial is selected", () => {
    const pikachu = species(25, "Pikachu");
    assert.equal(weightForUnits(pikachu.weightLabel, "imperial"), "13 pounds");
    assert.equal(heightForUnits(pikachu.heightLabel, "imperial"), "1 foot 4 inches");
    const text = advancedSpeech(
      { ...pikachu, weightLabel: "6 kilograms", heightLabel: "40 centimetres" },
      "imperial",
    );
    assert.match(text, /It weighs 13 pounds/);
    assert.match(text, /1 foot 4 inches tall/);
    assert.doesNotMatch(text, /kilograms|centimetres/);
    const metric = advancedSpeech(pikachu, "metric");
    assert.match(metric, /6 kilograms/);
    assert.match(metric, /40 centimetres/);
  });
});

type SentChapter = {
  title: string;
  display: { icon16x16: string };
  tracks: Array<{ title: string; display: { icon16x16: string } }>;
};

function sentChapters(upload: ReturnType<typeof selectionUpload>): SentChapter[] {
  return (upload.content.content as { chapters: SentChapter[] }).chapters;
}

describe("picked forms in a catalogue playlist", () => {
  const rattata = getCatalogueEntry(19);
  const charizard = getCatalogueEntry(6);
  const alolanSpeech = "Alolan Rattata. It lives in cities and eats leftover food at night.";

  function rows(): SelectionSpecies[] {
    assert.ok(rattata && charizard);
    const alolan = formSelection(rattata, 10091, alolanSpeech);
    const megaX = formSelection(charizard, 10034, "Mega Charizard X. Its flames turn blue.");
    assert.ok(alolan && megaX);
    return [speciesSelection(rattata, species(19).biology), alolan, megaX];
  }

  it("takes a form's own name, types, and size, keeps the species number, and leaves abilities out", () => {
    assert.ok(rattata);
    const alolan = formSelection(rattata, 10091, alolanSpeech);
    const listed = rattata.forms.find((form) => form.id === 10091);
    assert.ok(alolan && listed);
    assert.equal(alolan.id, 19);
    assert.equal(alolan.formId, 10091);
    assert.equal(alolan.name, "Alolan Rattata");
    assert.equal(alolan.speciesName, "Rattata");
    assert.deepEqual(alolan.types, listed.types);
    assert.ok(alolan.types.includes("Dark"));
    assert.equal(alolan.heightLabel, listed.heightLabel);
    assert.equal(alolan.weightLabel, listed.weightLabel);
    assert.deepEqual(alolan.abilities, []);
    assert.equal(alolan.color, null);
    assert.equal(alolan.info, rattata.info);
    assert.equal(alolan.speech, alolanSpeech);
    assert.equal(selectionPickId(alolan), 10091);
    // A reading that is only the name is not a description, so the Pokédex line is read instead.
    const bare = formSelection(rattata, 10091, "Alolan Rattata.");
    assert.equal(bare?.speech, undefined);
    assert.match(factsSpeech(bare as SelectionSpecies), /^Alolan Rattata\. \S/);
    // Mega Charizard X is not one of Rattata's forms.
    assert.equal(formSelection(rattata, 10034, "Mega Charizard X."), null);
  });

  it("builds form tracks the way the form collections do, in the order the child set", () => {
    const built = selectionPlaylist(rows(), "facts", "Mixed");
    const chapters = built.card.chapters;
    assert.deepEqual(
      chapters.map((chapter) => [chapter.key, chapter.title, chapter.dexId, chapter.formId, chapter.overlay]),
      [
        ["sel-19", "Rattata", 19, undefined, "19"],
        ["sel-10091", "Alolan Rattata", 19, 10091, "19b"],
        ["sel-10034", "Mega Charizard X", 6, 10034, "6"],
      ],
    );
    const form = chapters[1];
    assert.equal(form?.tracks[0]?.title, "Alolan Rattata");
    assert.equal(form?.tracks[0]?.text, alolanSpeech);
    assert.equal(form?.tracks[0]?.lead, "cry");
    assert.equal(form?.icon, "/api/artwork/form/10091");
    assert.equal(form?.sprite, "/api/artwork/form/10091");
    assert.equal(form?.tracks[0]?.icon, "/api/artwork/form/10091");
    assert.equal(chapterPictureId(form ?? {}), 10091);
    assert.equal(chapters[0]?.icon, "/pixels/19.png");

    const upload = selectionUpload(
      built.card,
      { 19: "pixel-19", 10091: "pixel-10091", 10034: "pixel-10034" },
      { title: built.title },
    );
    const sent = sentChapters(upload);
    assert.deepEqual(
      sent.map((chapter) => [chapter.title, chapter.display.icon16x16, chapter.tracks[0]?.display.icon16x16]),
      [
        ["Rattata", "yoto:#pixel-19", "yoto:#pixel-19"],
        ["Alolan Rattata", "yoto:#pixel-10091", "yoto:#pixel-10091"],
        ["Mega Charizard X", "yoto:#pixel-10034", "yoto:#pixel-10034"],
      ],
    );
    assert.equal(sent[1]?.tracks[0]?.title, "Alolan Rattata");
    const jobs = renderJobs(built.title, built.card, upload);
    assert.deepEqual(
      jobs.map((job) => [job.dexId, job.name]),
      [
        [19, "Rattata"],
        [19, "Alolan Rattata"],
        [6, "Mega Charizard X"],
      ],
    );
    assert.match(jobs[1]?.text ?? "", /leftover food/);
    assert.deepEqual(
      chaptersForCries(built.card).map((item) => item.dexId),
      [19, 19, 6],
    );
    const [first, , last] = rows();
    const formFirst = selectionPlaylist([last as SelectionSpecies, first as SelectionSpecies], "facts");
    assert.equal(coverArtworkId(formFirst.card), 10034);
  });

  it("reads a form's own size and type in advanced facts, without the species ability", () => {
    const alolan = rows()[1] as SelectionSpecies;
    const text = advancedSpeech(alolan);
    assert.match(text, /^Alolan Rattata\. It lives in cities/);
    assert.match(text, new RegExp(`It weighs ${weightForUnits(alolan.weightLabel, "metric")}`));
    assert.match(text, /Dark/);
    assert.doesNotMatch(text, /Its ability is/);
  });

  it("keeps both names out of a form riddle and answers with the form's pixel", () => {
    const alolan = rows()[1] as SelectionSpecies;
    const built = selectionPlaylist([alolan], "whos-that");
    const chapter = built.card.chapters[0];
    assert.ok(chapter);
    const clue = chapter.tracks[0]?.text ?? "";
    const answer = chapter.tracks[1]?.text ?? "";
    assert.match(clue, /^Number 19\./);
    assert.doesNotMatch(clue, /Rattata|Alolan/i);
    assert.match(answer, /^It is Alolan Rattata\./);
    assert.equal(chapter.icon, "/pixels/19-shadow.png");
    assert.equal(chapter.tracks[1]?.icon, "/api/artwork/form/10091");
    const upload = selectionUpload(built.card, { 10091: "pixel-10091" }, {
      title: built.title,
      shadowById: { 19: "shadow-19" },
    });
    const tracks = sentChapters(upload)[0]?.tracks ?? [];
    assert.equal(tracks[0]?.display.icon16x16, "yoto:#shadow-19");
    assert.equal(tracks[1]?.display.icon16x16, "yoto:#pixel-10091");
  });

  it("numbers a form after its species, and two forms of one species apart", () => {
    assert.deepEqual(
      selectionOverlays([{ id: 678, formId: 10314 }, { id: 678, formId: 10326 }, { id: 678 }, { id: 6, formId: 10034 }]),
      ["678b", "678c", "678", "6"],
    );
  });

  it("refuses a form past the card by its form id", () => {
    const picked = [...Array.from({ length: 100 }, (_, index) => species(index + 1)), rows()[1] as SelectionSpecies];
    assert.deepEqual(selectionPlaylist(picked, "facts").refused, [10091]);
  });

  it("puts a form's own artwork on the sticker cards", () => {
    const cards = selectionStickerCards(
      [
        { id: 10091, name: "Alolan Rattata", speciesId: 19 },
        { id: 19, name: "Rattata", speciesId: 19 },
      ],
      "facts",
    );
    assert.equal(cards.length, 1);
    const card = cards[0] as KidCard;
    assert.deepEqual(
      card.chapters.map((chapter) => [chapter.dexId, chapter.formId]),
      [
        [19, 10091],
        [19, undefined],
      ],
    );
    const mons = monsFor(card);
    assert.deepEqual(
      mons.map((mon) => [mon.name, mon.art, mon.dexId]),
      [
        ["Alolan Rattata", "/api/artwork/form/10091", 19],
        ["Rattata", artworkSrc(19), 19],
      ],
    );
    assert.notEqual(mons[0]?.key, mons[1]?.key);
    const speciesOnly = selectionStickerCards([{ id: 19, name: "Rattata" }], "facts");
    const formOnly = selectionStickerCards([{ id: 10091, name: "Alolan Rattata", speciesId: 19 }], "facts");
    assert.notEqual(speciesOnly[0]?.id, formOnly[0]?.id);
  });
});
