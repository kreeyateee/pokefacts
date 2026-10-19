import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chaptersForCries, YOTO_TRACK_LIMIT } from "./kid-cards";
import {
  advancedSpeech,
  factsSpeech,
  selectionPlaylist,
  selectionUpload,
  type SelectionSpecies,
} from "./selection-playlist";
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
    assert.equal(built.title, "Who's That Pokémon");
  });
});
