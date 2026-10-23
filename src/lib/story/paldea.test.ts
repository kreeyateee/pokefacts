import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/paldea/route";
import { effectiveness, type PokemonType } from "../type-chart";
import { buildPaldea, paldeaAdventure, planPaldea, STARTERS } from "./paldea";
import { storyCard } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import type { StoryGraph, StoryNode } from "./story-graph";
import { withoutCues } from "./story-sound";
import { speakerLines } from "./story-voices";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 42, 99];

function byId(graph: StoryGraph): Map<string, StoryNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

/** Plays a week: picks a starter, then the right move except at the battles listed. */
function play(graph: StoryGraph, starter: 0 | 1 | 2, missAt: readonly number[]): { ending: StoryNode; battles: number } {
  const nodes = byId(graph);
  const starterLabel = `choose ${STARTERS[starter]?.name}`;
  let node = nodes.get(graph.start) as StoryNode;
  let battles = 0;
  for (let steps = 0; steps < 60 && node.kind !== "ending"; steps += 1) {
    if (node.kind === "scene") {
      node = nodes.get(node.next) as StoryNode;
      continue;
    }
    if (node.id === "pick1" || node.id === "pick2") {
      const side = [node.left, node.right].find((choice) => choice.label === starterLabel);
      node = nodes.get(side ? side.to : node.right.to) as StoryNode;
      continue;
    }
    const goodTo = [node.left, node.right].find((choice) => /g\d$/.test(choice.to))?.to as string;
    const slipTo = [node.left, node.right].find((choice) => /b\d$/.test(choice.to))?.to as string;
    node = nodes.get(missAt.includes(battles) ? slipTo : goodTo) as StoryNode;
    battles += 1;
  }
  return { ending: node, battles };
}

describe("Paldea Picnic", () => {
  it("is a valid card inside 100 tracks for every seed", () => {
    for (const seed of SEEDS) {
      const graph = paldeaAdventure({ seed, owner: "Mia" });
      assert.deepEqual(checkStory(graph), [], `seed ${seed}`);
      assert.ok(storyTrackCount(graph) <= 100, `seed ${seed}: ${storyTrackCount(graph)} tracks`);
      assert.doesNotThrow(() => storyCard(graph));
    }
  });

  it("never ends early: every starter fights all three battles and gets to the picnic", () => {
    const graph = paldeaAdventure({ seed: 3 });
    for (const starter of [0, 1, 2] as const) {
      for (const missAt of [[], [0], [1, 2], [0, 1, 2]]) {
        const { ending, battles } = play(graph, starter, missAt);
        assert.equal(battles, 3);
        assert.equal(ending.kind, "ending");
      }
    }
  });

  it("evolves the partner by how the week went: twice and Terastallised, once, or not yet", () => {
    const graph = paldeaAdventure({ seed: 5, owner: "Mia" });
    for (const [index, starter] of STARTERS.entries()) {
      const best = play(graph, index as 0 | 1 | 2, []).ending;
      assert.ok(best.kind === "ending" && best.ending.golden, `${starter.name} golden`);
      assert.match(best.text, new RegExp(`becomes ${starter.final.name}!`));
      assert.match(best.text, /Terastallised/);
      assert.match(best.text, /Mia, you two are best friends/);
      const once = play(graph, index as 0 | 1 | 2, [1]).ending;
      assert.match(once.text, new RegExp(`becomes ${starter.mid.name}!`));
      assert.doesNotMatch(once.text, new RegExp(starter.final.name));
      const notYet = play(graph, index as 0 | 1 | 2, [0, 2]).ending;
      assert.match(notYet.text, /evolve when it's ready/);
    }
    const numbers = graph.nodes.flatMap((node) => (node.kind === "ending" ? [node.ending.number] : []));
    assert.deepEqual(numbers.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("gives Juno the starter that beats yours, and Arlo the other", () => {
    const graph = paldeaAdventure({ seed: 1 });
    const meet = (prefix: string) => byId(graph).get(`${prefix}0`)?.text ?? "";
    assert.match(meet("g"), /Juno grabs Fuecoco/);
    assert.match(meet("f"), /Juno grabs Quaxly/);
    assert.match(meet("w"), /Juno grabs Sprigatito/);
    assert.match(meet("g"), /leaves Quaxly for Arlo/);
  });

  it("makes the first and last battles want the partner's own type, and the middle one the plain move", () => {
    for (const seed of SEEDS) {
      const plan = planPaldea(seed);
      for (const starter of STARTERS) {
        const { first, trick } = plan.picks[starter.key];
        const own = starter.type as PokemonType;
        const types = (foe: { type: string }) => foe.type.split(" and ");
        assert.ok(effectiveness(own, types(first)) >= 2, `${starter.name} beats ${first.name}`);
        assert.ok(effectiveness(own, types(trick)) <= 0.5, `${trick.name} shrugs off ${starter.type}`);
        assert.ok(effectiveness(own, types(starter.titan)) >= 2, `${starter.name} beats ${starter.titan.name}`);
      }
    }
    const seen = new Set(SEEDS.map((seed) => JSON.stringify(planPaldea(seed).picks)));
    assert.ok(seen.size >= 4, "different wild Pokémon from week to week");
  });

  it("gives every line a speaker, and leaves no cue or gap to be read as words", () => {
    for (const seed of [1, 2, 3]) {
      const graph = buildPaldea(planPaldea(seed), "Mia");
      const speakers = new Set<string>();
      for (const node of graph.nodes) {
        for (const line of speakerLines(node.text, graph.cast ?? [])) if ("speaker" in line) speakers.add(line.speaker);
        assert.doesNotMatch(withoutCues(node.text), /\[|\]|\{|\}|undefined/, `${node.id}`);
        assert.doesNotMatch(withoutCues(node.text), /\. [a-z]/, `${node.id} starts a sentence in lower case`);
      }
      assert.deepEqual([...speakers].sort(), ["arlo", "juno", "narrator", "olwen"]);
    }
  });

  it("serves the route", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/paldea?seed=5&owner=Mia")).json();
    assert.equal(good.story.id, "paldea-5");
    assert.equal(good.story.title, "Paldea Picnic");
    assert.equal(GET(new Request("http://localhost/api/adventure/paldea?seed=x")).status, 400);
  });
});
