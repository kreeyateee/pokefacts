import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/play/route";
import { withoutVoiceTags } from "../voice-tags";
import { playAdventure, planPlay, PLAY_ROUNDS } from "./play";
import { storyCard } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import { pacingProblems, randomPlaythroughs, secondsToFirstChoice } from "./story-metrics";
import { withoutCues } from "./story-sound";

const SEEDS = [1, 2, 3, 4, 5, 42, 99];
const PARTNERS = [undefined, 25, 4, 7, 1, 133, 143, 150, 54, 39];
const OWNERS = ["", "Mia", "Maximilian"];
const partnerOf = (id: number | undefined) => (id ? { id, name: `Partner${id}` } : undefined);

describe("Friendly Battles", () => {
  it("is a valid card with an early first question and short waits, for every partner, name and seed", () => {
    for (const partner of PARTNERS) {
      for (const owner of OWNERS) {
        for (const seed of SEEDS) {
          const graph = playAdventure({ seed, owner, partner: partnerOf(partner) });
          const label = `partner ${partner} owner ${owner} seed ${seed}`;
          assert.deepEqual(checkStory(graph), [], label);
          assert.deepEqual(pacingProblems(graph), [], label);
          assert.ok(secondsToFirstChoice(graph) <= 25, `${label}: first question at ${secondsToFirstChoice(graph)}s`);
          assert.ok(storyTrackCount(graph) <= 100, label);
        }
      }
    }
    assert.doesNotThrow(() => storyCard(playAdventure({ seed: 1, owner: "Mia" })));
  });

  it("is gentle: nobody loses, no sad sounds, and every sentence is short", () => {
    for (const seed of SEEDS) {
      const graph = playAdventure({ seed, owner: "Mia" });
      for (const node of graph.nodes) {
        assert.doesNotMatch(node.text, /\[(fizzle|escape|run)\]/, `${node.id} plays a sad sound`);
        assert.doesNotMatch(withoutCues(node.text), /\b(lose|lost|loses|wrong|faint\w*|hurt|crying|sad)\b/i, `${node.id} talks about losing`);
        const sentences = withoutVoiceTags(withoutCues(node.text)).split(/(?<=[.!?])['’]?\s+/);
        for (const sentence of sentences) {
          const words = sentence.split(/\s+/).filter(Boolean).length;
          assert.ok(words <= 14, `${node.id}: "${sentence}" is ${words} words`);
        }
      }
      // Both buttons are always happy: each leads to a cheer.
      const byId = new Map(graph.nodes.map((node) => [node.id, node]));
      for (const node of graph.nodes) {
        if (node.kind !== "choice") continue;
        for (const side of [node.left, node.right]) assert.match(byId.get(side.to)?.text ?? "", /\[cheer\]/, `${side.to} cheers`);
      }
    }
  });

  it("plays with six different friends, never the child's own partner, and reaches every ending", () => {
    for (const partner of PARTNERS) {
      const plan = planPlay({ seed: 3, partner: partnerOf(partner) });
      assert.equal(plan.friends.length, PLAY_ROUNDS);
      assert.equal(new Set(plan.friends.map((friend) => friend.id)).size, PLAY_ROUNDS);
      assert.ok(plan.friends.every((friend) => friend.id !== (partner ?? 25)));
    }
    const { endings } = randomPlaythroughs(playAdventure({ seed: 1 }));
    for (const number of [1, 2, 3]) assert.ok((endings[number] ?? 0) > 0.05, `ending ${number}: ${endings[number]}`);
  });

  it("serves the route", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/play?seed=5&owner=Mia&partner=7")).json();
    assert.equal(good.story.id, "play-5");
    assert.equal(good.story.title, "Friendly Battles");
    assert.match(good.story.nodes[0].text, /You and Squirtle are at the Play Park/);
    assert.equal(GET(new Request("http://localhost/api/adventure/play?seed=x")).status, 400);
  });
});
