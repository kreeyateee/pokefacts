import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCatalogueEntry, listMonSheets } from "./catalogue-db";
import { JOKES, jokesFor, toldBy } from "./jokes";
import { countSpokenTracks, jokePlaylist, mulberry32 } from "./kid-cards";
import { gymAdventure } from "./story/gym";
import { islandAdventure } from "./story/island";
import { lostAdventure } from "./story/lost";
import { PRIZES } from "./story/safari-words";
import { paldeaAdventure } from "./story/paldea";
import { safariAdventure } from "./story/safari";
import { speakerLines } from "./story/story-voices";

describe("Pokémon jokes", () => {
  it("has plenty, one Pokémon picture each, each a question with a punchline", () => {
    assert.ok(JOKES.length >= 60);
    assert.equal(new Set(JOKES.map((joke) => joke.dexId)).size, JOKES.length);
    for (const joke of JOKES) {
      const name = getCatalogueEntry(joke.dexId)?.name.replace(".", "") ?? "";
      assert.ok(name, `${joke.dexId} is a Pokémon`);
      assert.match(joke.setup, /\?$/);
      assert.match(joke.punchline, /[!?.]$/);
      assert.doesNotMatch(`${joke.setup} ${joke.punchline}`, /["“”‘’]|\d/);
    }
  });

  it("reads cleanly in a character's voice, with every line theirs", () => {
    const cast = [{ id: "ronnie", name: "Ronnie", voices: ["x"] }];
    for (const joke of JOKES) {
      const lines = speakerLines(toldBy("Ronnie", joke), cast);
      const spoken = lines.flatMap((line) => ("speaker" in line ? [line] : []));
      assert.ok(spoken.some((line) => line.speaker === "ronnie" && line.text.includes(joke.punchline)), joke.setup);
    }
  });

  it("makes a Joke Book card: one track each, the cry first, inside a card", () => {
    const card = jokePlaylist(listMonSheets());
    assert.equal(card.kind, "joke");
    assert.equal(card.chapters.length, JOKES.length);
    assert.ok(countSpokenTracks(card.chapters) <= 100);
    assert.ok(card.chapters.every((chapter) => chapter.tracks[0]?.lead === "cry" && chapter.dexId));
    assert.match(card.chapters[0]?.tracks[0]?.text ?? "", /^Here's a joke about Pikachu\. .+\?.*\.\.\. .+!$/);
    // A joke about Ghost Pokémon in general doesn't claim to be about Gastly, whose picture it shows.
    assert.match(card.chapters.find((chapter) => chapter.dexId === 92)?.tracks[0]?.text ?? "", /^Here's a joke\. Why are Ghost/);
  });

  it("picks jokes in a repeatable order, and can leave some Pokémon out", () => {
    assert.deepEqual(jokesFor(mulberry32(3)), jokesFor(mulberry32(3)));
    assert.ok(jokesFor(mulberry32(3), [25, 143]).every((joke) => joke.dexId !== 25 && joke.dexId !== 143));
  });

  it("never tells the same joke twice on one card, whichever way the story goes", () => {
    const partners = [undefined, { id: 25, name: "Pikachu" }, { id: 909, name: "Fuecoco" }, { id: 143, name: "Snorlax" }];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const partner of partners) {
        for (const graph of [
          islandAdventure({ seed, partner }),
          safariAdventure({ seed, partner }),
          gymAdventure({ seed, partner }),
          paldeaAdventure({ seed, partner }),
          lostAdventure({ seed, partner }),
        ]) {
          for (const joke of JOKES) {
            const told = graph.nodes.filter((node) => node.text.includes(joke.setup)).map((node) => node.id);
            assert.ok(told.length <= 1, `${graph.title} seed ${seed}: "${joke.setup}" is told in ${told.join(", ")}`);
          }
        }
      }
    }
  });

  it("gives every Safari ending its own joke and its own prize", () => {
    const graph = safariAdventure({ seed: 4 });
    const endings = graph.nodes.filter((node) => node.kind === "ending");
    assert.equal(endings.length, 4);
    // Each ending's prize comes from its own pool: something to take home, a bigger one the better the day.
    endings.forEach((node, index) => {
      const pool = PRIZES[index + 1] ?? [];
      assert.ok(pool.some((prize) => node.text.includes(prize)), `ending ${index + 1} gives a prize from its pool`);
    });
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => safariAdventure({ seed }).nodes.find((node) => node.id === "end1")?.text));
    assert.ok(seen.size > 1, "the same ending gives different prizes on different cards");
    const jokes = endings.filter((node) => node.text.includes("Want to hear a joke?"));
    assert.equal(jokes.length, 3, "the golden ending is a celebration, not a joke");
    assert.match(endings[1]?.text ?? "", /Barnaby grins\. '/, "Barnaby tells the joke on his bad day");
  });

  it("puts a joke in every adventure", () => {
    for (const graph of [
      islandAdventure({ seed: 2 }),
      safariAdventure({ seed: 2 }),
      gymAdventure({ seed: 2 }),
      paldeaAdventure({ seed: 2 }),
      lostAdventure({ seed: 2 }),
    ]) {
      assert.ok(
        graph.nodes.some((node) => node.text.includes("Want to hear a joke?")),
        `${graph.title} has a joke`,
      );
    }
  });
});
