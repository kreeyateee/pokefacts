import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/lost/route";
import { effectiveness, isPokemonType } from "../type-chart";
import { withoutVoiceTags } from "../voice-tags";
import { DEFAULT_PARTNER, lostAdventure, planLost, THEMES } from "./lost";
import { storyCard } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import type { StoryGraph, StoryNode } from "./story-graph";
import { pacingProblems, randomPlaythroughs } from "./story-metrics";
import { withoutCues } from "./story-sound";
import { speakerLines } from "./story-voices";

const SEEDS = [1, 2, 3, 4, 5, 42, 99];
const OWNERS = ["", "Mia", "Alexandria", "Maximilian"];
const PARTNERS = [undefined, 25, 4, 7, 1, 94, 95, 143, 16, 147, 133, 150, 50, 208, 215, 700, 129, 74];

const partnerOf = (id: number | undefined) => (id ? { id, name: `Partner${id}` } : undefined);

function byId(graph: StoryGraph): Map<string, StoryNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

/** Plays it through, getting wrong only the choices listed by node id. */
function play(graph: StoryGraph, wrongAt: readonly string[] = []): StoryNode {
  const nodes = byId(graph);
  let node = nodes.get(graph.start) as StoryNode;
  for (let steps = 0; steps < 60 && node.kind !== "ending"; steps += 1) {
    if (node.kind === "scene") {
      node = nodes.get(node.next) as StoryNode;
      continue;
    }
    const right = [node.left, node.right].find((choice) => /(o\d|g\d|g)$/.test(choice.to) && !/w\d$/.test(choice.to));
    const wrong = [node.left, node.right].find((choice) => choice !== right);
    node = nodes.get((wrongAt.includes(node.id) ? wrong : right)?.to ?? node.left.to) as StoryNode;
  }
  return node;
}

describe("Find Your Trainer", () => {
  it("is a valid, well-paced card for every partner, owner and seed", () => {
    for (const partner of PARTNERS) {
      for (const owner of OWNERS) {
        for (const seed of SEEDS) {
          const graph = lostAdventure({ seed, owner, partner: partnerOf(partner) });
          const label = `partner ${partner} owner ${owner} seed ${seed}`;
          assert.deepEqual(checkStory(graph), [], label);
          assert.deepEqual(pacingProblems(graph), [], label);
          assert.ok(storyTrackCount(graph) <= 100, `${label}: ${storyTrackCount(graph)} tracks`);
        }
      }
    }
    assert.doesNotThrow(() => storyCard(lostAdventure({ seed: 1, owner: "Mia", partner: partnerOf(25) })));
  });

  it("you play as your partner, or Pikachu without one, in a dungeon that suits its type", () => {
    const place = (id?: number) => planLost({ seed: 1, partner: partnerOf(id) }).theme.place;
    assert.equal(planLost({ seed: 1 }).partner, DEFAULT_PARTNER);
    assert.equal(place(), "the Old Power Plant");
    assert.equal(place(4), "the Ember Tunnels");
    assert.equal(place(7), "the Crystal Grotto");
    assert.equal(place(1), "the Tangled Wood");
    assert.equal(place(94), "the Hollow Tower");
    assert.equal(place(95), "the Deep Mines");
    assert.equal(place(16), "the Sky Ruins");
    assert.equal(place(133), "the Bramble Maze");
    assert.equal(new Set(THEMES.flatMap((theme) => theme.types)).size, 18, "every type has a dungeon");
    const start = lostAdventure({ seed: 1, owner: "Mia", partner: { id: 4, name: "Charmander" } }).nodes[0]?.text ?? "";
    assert.match(start, /^You are Charmander, the Lizard Pokémon\./);
    assert.match(start, /You and Mia were exploring the old volcano/);
  });

  it("is fair: the clue on every floor points to the right way, and the wild Pokémon is one your type beats", () => {
    for (const seed of SEEDS) {
      const graph = lostAdventure({ seed, owner: "Mia", partner: partnerOf(25) });
      for (const node of graph.nodes) {
        if (node.kind !== "choice" || !/^(start|f\dp\d)$/.test(node.id)) continue;
        const right = [node.left, node.right].find((choice) => !/w\d$/.test(choice.to));
        const way = right?.label.replace(/^take /, "") ?? "";
        const clue = /(?:From|coming from|At the start of) (the [a-z ]+?)[,.]/.exec(node.text)?.[1];
        assert.equal(clue, way, `${node.id} clue points to ${way}`);
      }
      const plan = planLost({ seed, partner: partnerOf(25) });
      assert.ok(effectiveness(plan.type, plan.wild.types) >= 2, `${plan.wild.name} is weak to ${plan.type}`);
    }
    // A Normal type beats nothing, so its wild Pokémon is a fair fight and the words don't say otherwise.
    const normal = planLost({ seed: 3, partner: partnerOf(133) });
    assert.equal(normal.type, "Normal");
    assert.equal(effectiveness("Normal", normal.wild.types), 1);
    const graph = lostAdventure({ seed: 3, partner: partnerOf(133) });
    assert.doesNotMatch(graph.nodes.map((node) => node.text).join(" "), /super effective/);
  });

  it("never ends early, rewards a perfect run with the golden ending, and lets you catch up", () => {
    const graph = lostAdventure({ seed: 2, owner: "Mia", partner: partnerOf(25) });
    const golden = play(graph);
    assert.ok(golden.kind === "ending" && golden.ending.golden, "a perfect run is golden");
    assert.match(golden.text, /Can I come too/);
    const oneSlip = play(graph, ["start"]);
    assert.ok(oneSlip.kind === "ending" && !oneSlip.ending.golden);
    assert.equal(oneSlip.kind === "ending" && oneSlip.ending.number, 3, "one wrong turn, then everything right");
    const worst = play(graph, ["start", "f1o1", "f2p2", "f2o2", "f3p2", "f3o2", "boss2"]);
    assert.equal(worst.kind === "ending" && worst.ending.number, 1);
    const { endings } = randomPlaythroughs(graph);
    for (const number of [1, 2, 3]) assert.ok((endings[number] ?? 0) >= 0.15, `ending ${number}: ${endings[number]}`);
    assert.ok((endings[4] ?? 0) > 0 && (endings[4] ?? 0) < 0.05, `golden ${endings[4]}`);
  });

  it("gives every line a speaker, hides tags on the page, and never evolves your partner", () => {
    for (const partner of [25, 4, 133]) {
      const graph = lostAdventure({ seed: 1, owner: "Mia", partner: partnerOf(partner) });
      const speakers = new Set<string>();
      for (const node of graph.nodes) {
        for (const line of speakerLines(node.text, graph.cast ?? [])) if ("speaker" in line) speakers.add(line.speaker);
        const shown = withoutVoiceTags(withoutCues(node.text));
        assert.doesNotMatch(shown, /[{}[\]]|undefined/, node.id);
        assert.doesNotMatch(node.text, /evolv/i, `${node.id} never evolves the partner`);
      }
      assert.deepEqual([...speakers].sort(), ["boss", "guide", "narrator"]);
    }
  });

  it("finds someone else to play a part when the partner is that very Pokémon", () => {
    const snorlax = planLost({ seed: 1, partner: { id: 143, name: "Snorlax" } });
    assert.notEqual(snorlax.theme.sleeper.id, 143);
    const diglett = planLost({ seed: 1, partner: { id: 50, name: "Diglett" } });
    assert.notEqual(diglett.theme.guide.id, 50);
    const onix = planLost({ seed: 1, partner: { id: 95, name: "Onix" } });
    assert.notEqual(onix.theme.boss.id, 95);
    assert.ok(isPokemonType(onix.type));
  });

  it("serves the route", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/lost?seed=5&owner=Mia&partner=4")).json();
    assert.equal(good.story.id, "lost-5");
    assert.equal(good.story.title, "Find Your Trainer");
    assert.match(good.story.nodes[0].text, /You are Charmander/);
    assert.equal(GET(new Request("http://localhost/api/adventure/lost?seed=x")).status, 400);
  });
});
