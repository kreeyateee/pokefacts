import assert from "node:assert/strict";
import { test } from "node:test";

import { listMonSheets } from "@/lib/catalogue-db";
import { applySpeciesSpeech, buildKidCard, jokePlaylist, kidCardsFromDex, type KidCard } from "@/lib/kid-cards";
import { flat, radioScripts, type RadioKind } from "@/lib/radio/radio-scripts";

const sheets = listMonSheets().filter((sheet) => [1, 25, 94, 150, 151].includes(sheet.id));
const speech = { 25: "Pikachu. Pikachu is an Electric-type Pokémon. It stores electricity in its cheeks." };
const scripts = radioScripts(sheets, speech);

/** The words each track of a card is sent with, exactly as the send route receives them. */
function sent(card: KidCard): Array<{ dexId: number; key: string; text: string }> {
  const content = buildKidCard(card);
  return content.content.chapters.flatMap((chapter, index) => {
    const source = card.chapters[index];
    return (chapter.tracks ?? []).map((track, trackIndex) => ({
      dexId: source?.dexId ?? 0,
      key: source?.tracks[trackIndex]?.key ?? "",
      text: flat(String(track.trackUrl ?? "")),
    }));
  });
}

function expectFound(card: KidCard, kinds: readonly RadioKind[], found = scripts) {
  let checked = 0;
  for (const track of sent(card)) {
    const kind = track.key as RadioKind;
    if (!track.dexId || !kinds.includes(kind)) continue;
    assert.ok(found.get(track.dexId)?.[kind]?.includes(track.text), `${kind} for ${track.dexId} is found by the radio`);
    checked += 1;
  }
  assert.ok(checked > 0, "some tracks were checked");
}

test("finds the fact a Pokefacts card sends, both with the wiki reading and with the card's own blurb", () => {
  const meet = kidCardsFromDex(sheets).find((card) => card.kind === "meet") as KidCard;
  expectFound(meet, ["entry"]);
  expectFound(applySpeciesSpeech(meet, speech), ["entry"]);
});

test("finds the Who's That clues and answer a card sends", () => {
  const guess = kidCardsFromDex(sheets).find((card) => card.kind === "guess") as KidCard;
  expectFound(guess, ["clues", "answer"]);
});

test("finds a Joke Book joke as sent", () => {
  const all = listMonSheets();
  const jokes = jokePlaylist(all);
  expectFound({ ...jokes, chapters: jokes.chapters.slice(0, 5) }, ["joke"], radioScripts(all));
});

test("also looks for recordings made before expression tags, and the old answer wording", () => {
  const answers = scripts.get(25)?.answer ?? [];
  assert.ok(answers.some((text) => text.includes("{")), "the tagged answer");
  assert.ok(answers.some((text) => text.startsWith("It's ") && !text.includes("{")), "the plain answer");
  assert.ok(answers.some((text) => text.startsWith("It is ")), "the answer as it was before 24 October 2026");
});
