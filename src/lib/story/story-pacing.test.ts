import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LILY_VOICE_ID } from "@/lib/kid-cards";
import { safariAdventure } from "@/lib/story/safari";
import { storyCard } from "@/lib/story/story-card";
import { smallStory } from "@/lib/story/story-fixture";
import type { StoryGraph } from "@/lib/story/story-graph";
import {
  listeningRuns,
  narrationSeconds,
  pacingProblems,
  PACING_TARGETS,
  randomPlaythroughs,
  READ_WORDS_PER_SECOND,
  secondsToFirstChoice,
} from "@/lib/story/story-metrics";
import { sentencePieces, trackParts, type VoiceStyle } from "@/lib/story/story-voices";

const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

describe("story pacing", () => {
  it("times the start up to the first question", () => {
    const story = smallStory();
    // "You step into the Safari Zone." then "Something rustles in the grass."
    assert.equal(secondsToFirstChoice(story), (6 + 5) / READ_WORDS_PER_SECOND);
  });

  it("finds each stretch a child listens to without pressing a button, longest first", () => {
    const runs = listeningRuns(smallStory());
    assert.deepEqual(
      runs.map((run) => run.from).sort(),
      ["gate", "lake", "rock"].sort(),
      "the start, and where each button press lands",
    );
    const rock = runs.find((run) => run.from === "rock");
    assert.deepEqual(rock?.nodes, ["rock", "catch"]);
    assert.equal(rock?.endsInEnding, true);
    assert.ok(runs[0] && runs.every((run) => run.seconds <= (runs[0] as { seconds: number }).seconds));
  });

  it("plays at random and shares out the endings", () => {
    const stats = randomPlaythroughs(smallStory(), 1000, 7);
    const total = Object.values(stats.endings).reduce((sum, part) => sum + part, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    assert.ok((stats.endings[1] ?? 0) > 0.4 && (stats.endings[2] ?? 0) > 0.4, JSON.stringify(stats.endings));
    assert.equal(stats.choices, 1);
    assert.deepEqual(randomPlaythroughs(smallStory(), 1000, 7), stats, "the same seed measures the same");
  });

  it("names a slow start and a long wait between choices", () => {
    const story: StoryGraph = {
      ...smallStory(),
      nodes: smallStory().nodes.map((node) =>
        node.id === "gate" || node.id === "rock" ? { ...node, text: words(250) } : node,
      ),
    };
    const problems = pacingProblems(story);
    assert.ok(problems.some((problem) => problem.startsWith("The first question comes after")));
    // rock > catch ends in an ending, so it gets the finale's allowance.
    assert.equal(narrationSeconds(story.nodes.find((node) => node.id === "rock")!, 2) > PACING_TARGETS.finale, true);
    assert.ok(problems.some((problem) => problem.startsWith("rock > catch plays")));
    assert.deepEqual(pacingProblems(smallStory()), []);
  });
});

describe("recording a sentence at a time", () => {
  it("cuts a line at its sentences, and keeps titles, initials and numbers whole", () => {
    assert.deepEqual(sentencePieces("It's a Numel! Its hump is hot. Two! Barnaby had better watch out."), [
      "It's a Numel!",
      "Its hump is hot.",
      "Two!",
      "Barnaby had better watch out.",
    ]);
    assert.deepEqual(sentencePieces("Mr. Mime waves. They are 1.7 metres apart."), [
      "Mr. Mime waves.",
      "They are 1.7 metres apart.",
    ]);
    // "Jr." could end a sentence or not, so it never cuts one.
    assert.deepEqual(sentencePieces("Mime Jr. Sits down."), ["Mime Jr. Sits down."]);
    assert.deepEqual(sentencePieces("Why? ... {laughs} It forgot!"), ["Why? ...", "{laughs} It forgot!"]);
    assert.deepEqual(sentencePieces("One line"), ["One line"]);
    // A tag with nothing after it stays on the sentence before, so Piper is never handed an empty line.
    assert.deepEqual(sentencePieces("Lettuce be friends! {laughs}"), ["Lettuce be friends! {laughs}"]);
    // Tags with words after them belong to those words.
    assert.deepEqual(sentencePieces("Ready? Go! {laughs} {giggles} Off we go."), ["Ready?", "Go!", "{laughs} {giggles} Off we go."]);
    assert.deepEqual(sentencePieces("{laughs}"), ["{laughs}"]);
  });

  it("records each sentence as its own piece, with names still cut out and joined tight", () => {
    const narrator: VoiceStyle = { voiceId: LILY_VOICE_ID, pitch: 0, tempo: 1 };
    const parts = trackParts("Hello, Mia. It's a Numel! Two!", { narrator }, [], (text) => text, {
      slots: ["Mia"],
      sentences: true,
    });
    assert.deepEqual(
      parts?.map((part) => ("text" in part ? [part.text, Boolean(part.tight)] : [])),
      [
        ["Hello,", false],
        ["Mia.", true],
        ["It's a Numel!", false],
        ["Two!", false],
      ],
    );
    const lines = trackParts("Hello, Mia. It's a Numel! Two!", { narrator }, [], (text) => text, { slots: ["Mia"] });
    assert.equal(lines?.filter((part) => "text" in part).length, 3, "by line, the default, is as before");
  });

  it("is chosen per story, and a story recorded by sentence reuses far more between sends", () => {
    const sends = (pieces: "lines" | "sentences") => {
      const recorded = new Set<string>();
      let last = 0;
      for (let send = 0; send < 30; send += 1) {
        const graph = { ...safariAdventure({ seed: 31 + send * 7919 }), pieces };
        last = 0;
        for (const chapter of storyCard(graph, { voiceId: LILY_VOICE_ID }).card.chapters) {
          for (const track of chapter.tracks) {
            for (const part of track.parts ?? []) {
              if (!("text" in part)) continue;
              const key = `${part.voiceId}\n${part.text}`;
              if (!recorded.has(key)) last += 1;
              recorded.add(key);
            }
          }
        }
      }
      return last;
    };
    // Thirty sends is early on; scripts/story-report.ts shows the saving keeps growing (about 13 lines against 40).
    assert.ok(sends("sentences") < sends("lines") * 0.8, `${sends("sentences")} vs ${sends("lines")}`);
  });
});
