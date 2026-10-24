import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCatalogueEntry, listMonSheets } from "./catalogue-db";
import { JOKES, jokesFor, toldBy } from "./jokes";
import { countSpokenTracks, jokePlaylist, mulberry32 } from "./kid-cards";
import { gymAdventure } from "./story/gym";
import { islandAdventure } from "./story/island";
import { lostAdventure } from "./story/lost";
import { paldeaAdventure } from "./story/paldea";
import { safariAdventure } from "./story/safari";
import { speakerLines } from "./story/story-voices";

describe("Pokémon jokes", () => {
  it("has about fifty, one per Pokémon, each naming its Pokémon and ending properly", () => {
    assert.ok(JOKES.length >= 45);
    assert.equal(new Set(JOKES.map((joke) => joke.dexId)).size, JOKES.length);
    for (const joke of JOKES) {
      const name = getCatalogueEntry(joke.dexId)?.name.replace(".", "") ?? "";
      assert.ok(name, `${joke.dexId} is a Pokémon`);
      assert.ok(joke.setup.includes(name.split(" ")[0] as string), `${joke.setup} names ${name}`);
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
    assert.match(card.chapters[0]?.tracks[0]?.text ?? "", /^Here's a joke about Psyduck\. .+\?.*\.\.\. .+!$/);
  });

  it("picks jokes in a repeatable order, and can leave some Pokémon out", () => {
    assert.deepEqual(jokesFor(mulberry32(3)), jokesFor(mulberry32(3)));
    assert.ok(jokesFor(mulberry32(3), [25, 143]).every((joke) => joke.dexId !== 25 && joke.dexId !== 143));
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
