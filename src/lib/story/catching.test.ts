import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/catch/route";
import { effectiveness } from "../type-chart";
import { catchAdventure, CATCH_ROUNDS, planCatch } from "./catching";
import { partnerType } from "./lost";
import { storyCard, storyPixels } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import { pacingProblems, randomPlaythroughs, secondsToFirstChoice } from "./story-metrics";

const SEEDS = [1, 2, 3, 4, 5, 42, 99];
const PARTNERS = [undefined, 25, 4, 7, 1, 133, 143, 150, 54, 39, 94, 74, 448, 6];
const OWNERS = ["", "Mia", "Maximilian"];
const partnerOf = (id: number | undefined) => (id ? { id, name: `Partner${id}` } : undefined);

describe("Catch Quest", () => {
  it("is a valid card with an early first question and short waits, for every partner, name and seed", () => {
    for (const partner of PARTNERS) {
      for (const owner of OWNERS) {
        for (const seed of SEEDS) {
          const graph = catchAdventure({ seed, owner, partner: partnerOf(partner) });
          const label = `partner ${partner} owner ${owner} seed ${seed}`;
          assert.deepEqual(checkStory(graph), [], label);
          assert.deepEqual(pacingProblems(graph), [], label);
          assert.ok(secondsToFirstChoice(graph) <= 45, `${label}: first question at ${secondsToFirstChoice(graph)}s`);
          assert.ok(storyTrackCount(graph) <= 100, `${label}: ${storyTrackCount(graph)} tracks`);
        }
      }
    }
    assert.doesNotThrow(() => storyCard(catchAdventure({ seed: 1, owner: "Mia" })));
  });

  it("offers one strong type and one that isn't, and never a wild Pokémon from your own team", () => {
    for (const partner of PARTNERS) {
      for (const seed of SEEDS) {
        const plan = planCatch({ seed, partner: partnerOf(partner) });
        assert.equal(plan.team.length, 3);
        assert.equal(new Set(plan.team.map((mon) => mon.type)).size, 3, "three different types");
        assert.equal(plan.team[0]?.type, partnerType(partner ?? 25));
        assert.equal(plan.rounds.length, CATCH_ROUNDS);
        assert.equal(new Set(plan.rounds.map((round) => round.wild.id)).size, CATCH_ROUNDS);
        for (const { wild, right, wrong } of plan.rounds) {
          assert.ok(effectiveness(right.type, wild.types) >= 2, `${right.name} beats ${wild.name}`);
          assert.ok(effectiveness(wrong.type, wild.types) < 2, `${wrong.name} does not beat ${wild.name}`);
          assert.ok(!plan.team.some((mon) => mon.id === wild.id));
        }
      }
    }
  });

  it("battles, then catches every wild Pokémon with its fact, and attacks with the animation", () => {
    const graph = catchAdventure({ seed: 7, owner: "Mia" });
    const caught = graph.nodes.filter((node) => node.id.includes("k"));
    assert.ok(caught.length >= CATCH_ROUNDS);
    for (const node of caught) {
      assert.match(node.text, /\[throw\].*\[catch\].*You caught .*Did you know\?/);
      assert.deepEqual(node.icon, { pixel: "pokeball-caught" });
    }
    for (const node of graph.nodes) {
      if (node.kind === "scene" && /[yn]$/.test(node.id)) assert.ok(node.icon && "attack" in node.icon && node.icon.attack, node.id);
    }
    assert.ok(storyPixels(graph).attack.length > 0);
    // Every choice says the wild Pokémon's type, so the child can work it out.
    for (const node of graph.nodes) if (node.kind === "choice") assert.match(node.text, /is an? [A-Z]\w+( and [A-Z]\w+)? type/);
    const { endings } = randomPlaythroughs(graph);
    for (const number of [1, 2, 3]) assert.ok((endings[number] ?? 0) > 0.02, `ending ${number}: ${endings[number]}`);
  });

  it("serves the route", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/catch?seed=5&owner=Mia&partner=7")).json();
    assert.equal(good.story.id, "catch-5");
    assert.equal(good.story.title, "Catch Quest");
    assert.match(good.story.nodes[0].text, /You and Squirtle meet Ranger Fern/);
    assert.equal(GET(new Request("http://localhost/api/adventure/catch?seed=x")).status, 400);
  });
});
