import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/nursery/route";
import { withoutVoiceTags } from "../voice-tags";
import { nurseryAdventure, NURSERY_ROUNDS, planNursery } from "./nursery";
import { storyCard } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import { pacingProblems, randomPlaythroughs, secondsToFirstChoice } from "./story-metrics";
import { withoutCues } from "./story-sound";

const SEEDS = [1, 2, 3, 4, 5, 42, 99];
const PARTNERS = [undefined, 25, 4, 7, 1, 133, 143, 172, 175, 39];
const OWNERS = ["", "Mia", "Maximilian"];
const partnerOf = (id: number | undefined) => (id ? { id, name: `Partner${id}` } : undefined);

describe("Pokémon Nursery", () => {
  it("is a valid card with an early first question and short waits, for every partner, name and seed", () => {
    for (const partner of PARTNERS) {
      for (const owner of OWNERS) {
        for (const seed of SEEDS) {
          const graph = nurseryAdventure({ seed, owner, partner: partnerOf(partner) });
          const label = `partner ${partner} owner ${owner} seed ${seed}`;
          assert.deepEqual(checkStory(graph), [], label);
          assert.deepEqual(pacingProblems(graph), [], label);
          assert.ok(secondsToFirstChoice(graph) <= 25, `${label}: first question at ${secondsToFirstChoice(graph)}s`);
          assert.ok(storyTrackCount(graph) <= 100, label);
        }
      }
    }
    assert.doesNotThrow(() => storyCard(nurseryAdventure({ seed: 1, owner: "Mia" })));
  });

  it("is gentle: no battles, no sad sounds, a fact for every baby, and every sentence is short", () => {
    for (const seed of SEEDS) {
      const graph = nurseryAdventure({ seed, owner: "Mia" });
      for (const node of graph.nodes) {
        assert.doesNotMatch(node.text, /\[(fizzle|escape|run|hit|throw|catch)\]/, `${node.id} plays a battle or sad sound`);
        assert.doesNotMatch(withoutCues(node.text), /\b(lose|lost|loses|wrong|faint\w*|hurt|crying|sad|battle)\b/i, `${node.id}`);
        const sentences = withoutVoiceTags(withoutCues(node.text)).split(/(?<=[.!?])['’]?\s+/);
        for (const sentence of sentences) {
          const words = sentence.split(/\s+/).filter(Boolean).length;
          assert.ok(words <= 14, `${node.id}: "${sentence}" is ${words} words`);
        }
        if (node.kind === "scene") assert.match(node.text, /Did you know\?/, `${node.id} tells a fact`);
      }
      const byId = new Map(graph.nodes.map((node) => [node.id, node]));
      for (const node of graph.nodes) {
        if (node.kind !== "choice") continue;
        for (const side of [node.left, node.right]) assert.match(byId.get(side.to)?.text ?? "", /is happy\. \[cheer\]/, `${side.to} ends happy`);
      }
    }
  });

  it("looks after five different babies with five different needs, never the child's own partner, and reaches every ending", () => {
    for (const partner of PARTNERS) {
      const plan = planNursery({ seed: 3, partner: partnerOf(partner) });
      assert.equal(new Set(plan.babies.map((baby) => baby.id)).size, NURSERY_ROUNDS);
      assert.equal(new Set(plan.needs.map((need) => need.key)).size, NURSERY_ROUNDS);
      assert.ok(plan.babies.every((baby) => baby.id !== (partner ?? 25)));
    }
    const { endings } = randomPlaythroughs(nurseryAdventure({ seed: 1 }));
    for (const number of [1, 2, 3]) assert.ok((endings[number] ?? 0) > 0.05, `ending ${number}: ${endings[number]}`);
  });

  it("serves the route", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/nursery?seed=5&owner=Mia&partner=7")).json();
    assert.equal(good.story.id, "nursery-5");
    assert.equal(good.story.title, "Pokémon Nursery");
    assert.match(good.story.nodes[0].text, /You and Squirtle visit the Pokémon Nursery/);
    assert.equal(GET(new Request("http://localhost/api/adventure/nursery?seed=x")).status, 400);
  });
});
