import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { forElevenLabs, isExpression, withoutVoiceTags } from "../voice-tags";
import { gymAdventure } from "./gym";
import { islandAdventure } from "./island";
import { lostAdventure } from "./lost";
import { paldeaAdventure } from "./paldea";
import { safariAdventure } from "./safari";
import { storyCard } from "./story-card";
import { checkStory } from "./story-check";
import type { StoryGraph } from "./story-graph";
import { castVoices, fallbackVoices, NARRATOR, speakerLines, trackParts, type StoryCharacter } from "./story-voices";

const ADVENTURES: Array<[string, (input: { seed: number; owner?: string }) => StoryGraph]> = [
  ["Safari", safariAdventure],
  ["Gym", gymAdventure],
  ["Island", islandAdventure],
  ["Paldea", paldeaAdventure],
  ["Find Your Trainer", lostAdventure],
];

const CAST: StoryCharacter[] = [
  { id: "ronnie", name: "Ronnie", voices: ["x"], pronoun: "he" },
  { id: "juno", name: "Juno", voices: ["y"], pronoun: "she" },
];

describe("Expression in the adventures", () => {
  it("gives every adventure tags, a few to a track, and only ones the voices know", () => {
    for (const [title, make] of ADVENTURES) {
      for (const seed of [1, 2, 3]) {
        const graph = make({ seed, owner: "Mia" });
        const tags = graph.nodes.flatMap((node) => [...node.text.matchAll(/\{([^}]*)\}/g)].map((match) => match[1] ?? ""));
        assert.ok(tags.length >= 8, `${title} seed ${seed} has ${tags.length} tags`);
        assert.ok(tags.every(isExpression), `${title}: ${tags.filter((tag) => !isExpression(tag))}`);
        for (const node of graph.nodes) {
          const count = (node.text.match(/\{[a-z]+\}/g) ?? []).length;
          assert.ok(count <= 4, `${title} ${node.id} has ${count} tags`);
        }
      }
    }
  });

  it("lets the characters speak in their own voices: every quote is a whole sentence of its own", () => {
    // A recording changes voice only where a sentence ends, so "'Gotcha,' says Marigold." is read by the
    // narrator. The stories put the speaker first ("Marigold grins. 'Gotcha!'"), and this keeps it so.
    const words = (text: string) => withoutVoiceTags(text).split(/\s+/).filter(Boolean).length;
    for (const [title, make] of ADVENTURES) {
      const graph = make({ seed: 1, owner: "Mia" });
      const cast = graph.cast ?? [];
      const voices = castVoices("pFZP5JQG7iQjIQuC4Bku", cast);
      const narrator = voices[NARRATOR] as { voiceId: string; pitch: number };
      let quoted = 0;
      let voiced = 0;
      for (const node of graph.nodes) {
        for (const line of speakerLines(node.text, cast)) if ("speaker" in line && line.speaker !== NARRATOR) quoted += words(line.text);
        for (const part of trackParts(node.text, voices, cast) ?? []) {
          if ("text" in part && (part.voiceId !== narrator.voiceId || part.pitch !== narrator.pitch)) voiced += words(part.text);
        }
      }
      assert.ok(voiced / quoted >= 0.95, `${title}: only ${Math.round((100 * voiced) / quoted)}% of the characters' lines are in their own voices`);
    }
  });

  it("puts each tag in the voice of whoever says the words, never the narrator's", () => {
    for (const [title, make] of ADVENTURES) {
      const graph = make({ seed: 2, owner: "Mia" });
      for (const node of graph.nodes) {
        for (const line of speakerLines(node.text, graph.cast ?? [])) {
          if ("speaker" in line && /\{/.test(line.text)) assert.notEqual(line.speaker, NARRATOR, `${title} ${node.id}: ${line.text}`);
        }
      }
    }
  });

  it("keeps the tags out of the page and away from Piper, and sends them to the Yoto voices", () => {
    for (const [title, make] of ADVENTURES) {
      const { card } = storyCard(make({ seed: 3, owner: "Mia" }));
      for (const track of card.chapters.flatMap((chapter) => chapter.tracks)) {
        assert.doesNotMatch(track.text, /[{}]/, `${title} ${track.title} shows a tag`);
        assert.doesNotMatch(track.text, /(^|\s)'\s/, `${title} ${track.title} leaves a gap after a quote`);
        for (const part of track.parts ?? []) {
          if (!("text" in part)) continue;
          assert.ok(withoutVoiceTags(part.text).trim(), `${title} ${track.title} has a part with nothing to say`);
        }
      }
    }
    assert.equal(forElevenLabs("'{gasps} Look!'"), "'[gasps] Look!'");
  });

  it("keeps a tag with its sentence, and never cuts a name out of it", () => {
    const voices = castVoices("x", CAST);
    const parts = trackParts("'{gasps} Mia! You did it!' says Juno.", voices, CAST, undefined, {
      slots: ["Mia"],
      fallback: fallbackVoices(CAST),
    });
    const spoken = (parts ?? []).flatMap((part) => ("text" in part ? [part.text] : []));
    // "You did it!" and "says Juno." are one sentence, so the narrator reads them together.
    assert.deepEqual(spoken, ["{gasps} Mia!", "You did it! says Juno."]);
  });

  it("still finds the speaker when the tag comes after the words", () => {
    const lines = speakerLines("'Why?' says Ronnie. 'Because! {laughs}' says Ronnie, and everyone laughs.", CAST);
    const punchline = lines.find((line) => "speaker" in line && line.text.includes("Because!"));
    assert.ok(punchline && "speaker" in punchline);
    assert.equal(punchline.speaker, "ronnie");
    assert.match(punchline.text, /\{laughs\}$/);
  });

  it("flags a tag the voices do not know, and one with no words to act on", () => {
    const story: StoryGraph = {
      id: "t",
      title: "Test",
      description: "A test.",
      start: "a",
      nodes: [
        { id: "a", kind: "scene", title: "A", text: "'{shouts} Go!' says Ronnie. {sneezes} Hello.", next: "b" },
        { id: "b", kind: "ending", title: "B", text: "It ends. [cheer] {laughs} [ending]", ending: { number: 1, name: "End", golden: false } },
      ],
      cast: CAST,
    };
    const problems = checkStory(story).join(" ");
    assert.match(problems, /\{sneezes\}, which is not an expression/);
    assert.match(problems, /expression tag with no words/);
    assert.doesNotMatch(problems, /\{shouts\}/);
  });
});
