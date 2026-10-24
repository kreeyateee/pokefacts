import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/paldea/route";
import { effectiveness, type PokemonType } from "../type-chart";
import { buildPaldea, MENUS, paldeaAdventure, planPaldea, STARTERS } from "./paldea";
import { storyCard } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import { pacingProblems, randomPlaythroughs } from "./story-metrics";
import type { StoryGraph, StoryNode } from "./story-graph";
import { withoutCues } from "./story-sound";
import { speakerLines } from "./story-voices";
import { withoutVoiceTags } from "../voice-tags";

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
    // The twins' silly choice before the secret ending: both buttons go the same way.
    if (/t\d$/.test(node.id)) {
      node = nodes.get(node.right.to) as StoryNode;
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

  it("has a secret ending when the child's favourite is the starter they choose: both evolve twice, and the picnic explodes", () => {
    for (const [index, starter] of STARTERS.entries()) {
      const graph = paldeaAdventure({ seed: 5, owner: "Mia", partner: { id: starter.id, name: starter.name } });
      assert.deepEqual(checkStory(graph), []);
      assert.ok(storyTrackCount(graph) <= 100);
      const meeting = byId(graph).get(`${["g", "f", "w"][index]}0`)?.text ?? "";
      assert.match(meeting, new RegExp(`Your ${starter.name} from home sniffs the new ${starter.name}`));
      for (const missAt of [[], [1], [0, 2]]) {
        const { ending } = play(graph, index as 0 | 1 | 2, missAt);
        assert.ok(ending.kind === "ending" && ending.ending.name.includes("Secret"), `${starter.name} ${missAt}`);
        const twins = byId(graph).get(`${["g", "f", "w"][index]}t${Math.min(missAt.length, 2)}`)?.text ?? "";
        assert.match(twins, new RegExp(`Two ${starter.mid.name}! .*Two ${starter.final.name}!`));
        assert.match(ending.text, /\[hit\]/, "something explodes");
        assert.match(ending.text, /\[cheer\]/, "and everyone cheers");
        const { card } = storyCard(graph);
        const shown = card.chapters.flatMap((chapter) => chapter.tracks).find((track) => track.title === ending.title)?.text ?? "";
        assert.doesNotMatch(shown, /\{|\}|' Two/, "no tags or gaps on the page");
      }
      assert.match(play(graph, index as 0 | 1 | 2, []).ending.text, /both of them Terastallise/);
      // Someone else's favourite gets the usual picnic.
      const other = STARTERS[(index + 1) % 3] as (typeof STARTERS)[number];
      const plain = paldeaAdventure({ seed: 5, partner: { id: other.id, name: other.name } });
      assert.doesNotMatch(play(plain, index as 0 | 1 | 2, []).ending.text, /Secret|Two /);
    }
  });

  it("keeps a child pressing buttons: no long stretches of listening, with or without twins", () => {
    for (const seed of SEEDS) {
      assert.deepEqual(pacingProblems(paldeaAdventure({ seed, owner: "Mia" })), [], `seed ${seed}`);
      for (const starter of STARTERS) {
        const twins = paldeaAdventure({ seed, owner: "Mia", partner: { id: starter.id, name: starter.name } });
        assert.deepEqual(pacingProblems(twins), [], `seed ${seed} with two ${starter.name}`);
      }
    }
    const { endings } = randomPlaythroughs(paldeaAdventure({ seed: 1 }));
    for (let number = 1; number <= 9; number += 1) assert.ok((endings[number] ?? 0) > 0.01, `ending ${number}: ${endings[number]}`);
  });

  it("makes something different to eat on different cards, and sticks to it all the way through", () => {
    const menus = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const plan = planPaldea(seed);
      menus.add(plan.menu.dish);
      for (const partner of [undefined, { id: 909, name: "Fuecoco" }, { id: 906, name: "Sprigatito" }]) {
        const all = paldeaAdventure({ seed, owner: "Mia", partner }).nodes.map((node) => node.text).join(" ");
        assert.ok(all.includes(plan.menu.dish), `seed ${seed} makes ${plan.menu.dish}`);
        assert.ok(all.includes(plan.menu.first.food) && all.includes(plan.menu.cave.food), `seed ${seed} fetches its own ingredients`);
        for (const other of MENUS) {
          if (other === plan.menu) continue;
          assert.ok(!all.includes(other.dish), `seed ${seed} (${plan.menu.dish}) also mentions ${other.dish}`);
          if (other.first.spot !== plan.menu.first.spot) assert.ok(!all.includes(other.first.spot), `seed ${seed} mentions ${other.first.spot}`);
          if (other.cave.spot !== plan.menu.cave.spot) assert.ok(!all.includes(other.cave.spot), `seed ${seed} mentions ${other.cave.spot}`);
        }
      }
    }
    assert.deepEqual([...menus].sort(), MENUS.map((menu) => menu.dish).sort(), "every menu turns up");
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
        const shown = withoutVoiceTags(withoutCues(node.text));
        assert.doesNotMatch(shown, /\[|\]|\{|\}|undefined/, `${node.id}`);
        assert.doesNotMatch(shown, /\. [a-z]/, `${node.id} starts a sentence in lower case`);
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
