import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/island/route";
import { buildIsland, GIANTS, ISLAND_ENDINGS, islandAdventure, planIsland, type IslandPlan } from "./island";
import { storyCard, storyPixels } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import type { StoryGraph, StoryNode } from "./story-graph";
import { withoutCues } from "./story-sound";
import { speakerLines } from "./story-voices";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 99, 1234];

function byId(graph: StoryGraph): Map<string, StoryNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

/** Sails the voyage, slipping at the stages listed, and returns the ending and how many choices it took. */
function sail(graph: StoryGraph, plan: IslandPlan, slipAt: readonly number[]): { ending: StoryNode; choices: number } {
  const nodes = byId(graph);
  let node = nodes.get(graph.start) as StoryNode;
  let choices = 0;
  for (let steps = 0; steps < 100 && node.kind !== "ending"; steps += 1) {
    if (node.kind === "scene") {
      node = nodes.get(node.next) as StoryNode;
      continue;
    }
    const stage = plan.stages[choices] as IslandPlan["stages"][number];
    const wanted = slipAt.includes(choices) ? stage.slip.label : stage.good.label;
    const side = node.left.label === wanted ? node.left : node.right;
    assert.equal(side.label, wanted, `${node.id} offers ${wanted}`);
    choices += 1;
    node = nodes.get(side.to) as StoryNode;
  }
  return { ending: node, choices };
}

describe("Island Adventure", () => {
  it("is a valid card inside 100 tracks for every seed", () => {
    for (const seed of SEEDS) {
      const graph = islandAdventure({ seed, owner: "Mia" });
      assert.deepEqual(checkStory(graph), [], `seed ${seed}`);
      assert.ok(storyTrackCount(graph) <= 100, `seed ${seed}: ${storyTrackCount(graph)} tracks`);
      assert.doesNotThrow(() => storyCard(graph));
    }
  });

  it("never ends early: every voyage makes all seven choices and reaches the island", () => {
    const plan = planIsland(5);
    const graph = buildIsland(plan, 5);
    for (const slipAt of [[], [0], [1, 3], [0, 2, 4], [0, 1, 2, 3, 4, 5, 6], [6]]) {
      assert.equal(sail(graph, plan, slipAt).choices, 7, `slips at ${slipAt.join(",")}`);
    }
    assert.ok(graph.nodes.every((node) => node.kind !== "ending" || node.ending.number <= ISLAND_ENDINGS.length));
  });

  it("ends by how many slips you made: none is the golden Big Splash, three or more arrive at dawn", () => {
    const plan = planIsland(9);
    const graph = buildIsland(plan, 9);
    const name = (slipAt: number[]) => {
      const { ending } = sail(graph, plan, slipAt);
      return ending.kind === "ending" ? ending.ending : null;
    };
    assert.deepEqual(name([]), { number: 4, name: "The Big Splash", golden: true });
    assert.equal(name([3])?.name, "The Moonlight Song");
    assert.equal(name([6])?.name, "The Moonlight Song", "a slip at the very last choice still counts");
    assert.equal(name([0, 5])?.name, "Home at Last");
    assert.equal(name([0, 2, 4])?.name, "The Long Way Home");
    assert.equal(name([0, 1, 2, 3, 4, 5, 6])?.name, "The Long Way Home");
  });

  it("is different every time: other encounters, other giants, other Mabel moments", () => {
    const keys = new Set(SEEDS.map((seed) => planIsland(seed).stages.map((stage) => stage.key).join(",")));
    assert.ok(keys.size >= 6, `${keys.size} different voyages`);
    const giants = new Set(Array.from({ length: 60 }, (_, seed) => planIsland(seed).giant.name));
    assert.deepEqual([...giants].sort(), GIANTS.map((giant) => giant.name).sort());
    assert.deepEqual(islandAdventure({ seed: 3 }), islandAdventure({ seed: 3 }));
  });

  it("brings a Gigantamax Pokémon to every voyage, and back for the golden ending", () => {
    for (const seed of SEEDS) {
      const plan = planIsland(seed);
      const graph = buildIsland(plan, seed);
      assert.ok(storyPixels(graph).real.includes(plan.giant.formId), `seed ${seed} shows the giant`);
      const golden = byId(graph).get("end4");
      assert.match(golden?.text ?? "", new RegExp(plan.giant.finale.slice(0, 20)));
      assert.ok(graph.nodes.some((node) => node.text.includes(`[cry:${plan.giant.dexId}]`)));
    }
  });

  it("keeps Mabel in every scene, with her song and a moment of hers after each good choice", () => {
    for (let seed = 0; seed < 80; seed += 1) {
      for (const node of islandAdventure({ seed }).nodes) assert.match(node.text, /Mabel/, `seed ${seed} ${node.id}`);
    }
    const graph = islandAdventure({ seed: 7 });
    const sung = graph.nodes.filter((node) => node.text.includes("[cry:321]")).length;
    assert.ok(sung >= 15, `Mabel sings in ${sung} scenes`);
    const goods = graph.nodes.filter((node) => /^s\dg0$/.test(node.id));
    assert.equal(goods.length, 7);
    for (const node of goods) assert.match(node.text, /Mabel/);
  });

  it("gives every line a speaker, and leaves no cue to be read as words", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const graph = islandAdventure({ seed, owner: "Mia" });
      const speakers = new Set<string>();
      for (const node of graph.nodes) {
        for (const line of speakerLines(node.text, graph.cast ?? [])) if ("speaker" in line) speakers.add(line.speaker);
        assert.doesNotMatch(withoutCues(node.text), /\[|\]|\{|\}/, `${node.id} has a cue or gap read as words`);
      }
      assert.deepEqual([...speakers].sort(), ["brine", "narrator", "nell"]);
    }
  });

  it("calls the child by name, or shipmate without one", () => {
    const graph = islandAdventure({ seed: 1, owner: "Mia" });
    assert.match(graph.nodes[0]?.text ?? "", /Now then, Mia, first things first/);
    assert.match(byId(graph).get("end4")?.text ?? "", /you're Captain Mia/);
    assert.deepEqual(graph.slots, ["Mia"]);
    assert.match(islandAdventure({ seed: 1 }).nodes[0]?.text ?? "", /Now then, shipmate/);
  });

  it("serves the route", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/island?seed=5&owner=Mia")).json();
    assert.equal(good.story.id, "island-5");
    assert.equal(GET(new Request("http://localhost/api/adventure/island?seed=x")).status, 400);
  });
});
