import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET as gymRoute } from "../../app/api/adventure/gym/route";
import { GET as islandRoute } from "../../app/api/adventure/island/route";
import { partnerFor, sayableName } from "./adventure-route";
import { gymAdventure, loadBattlePool, planGym } from "./gym";
import { islandAdventure } from "./island";
import { paldeaAdventure } from "./paldea";
import { planSafari, loadSafariPool, safariAdventure } from "./safari";
import { checkStory, storyTrackCount } from "./story-check";
import type { StoryGraph } from "./story-graph";
import { speakerLines } from "./story-voices";

const PIKACHU = { id: 25, name: "Pikachu" };
const MEWTWO = { id: 150, name: "Mewtwo" };

function says(graph: StoryGraph, text: string): number {
  return graph.nodes.filter((node) => node.text.includes(text)).length;
}

describe("the child's partner Pokémon in every adventure", () => {
  const builds = {
    island: (partner?: typeof PIKACHU) => islandAdventure({ seed: 4, owner: "Mia", partner }),
    safari: (partner?: typeof PIKACHU) => safariAdventure({ seed: 4, owner: "Mia", partner }),
    gym: (partner?: typeof PIKACHU) => gymAdventure({ seed: 4, owner: "Mia", partner }),
    paldea: (partner?: typeof PIKACHU) => paldeaAdventure({ seed: 4, owner: "Mia", partner }),
  };

  it("comes along: named, with its cry, and the card still valid and inside 100 tracks", () => {
    for (const [name, build] of Object.entries(builds)) {
      const graph = build(PIKACHU);
      assert.deepEqual(checkStory(graph), [], name);
      assert.ok(storyTrackCount(graph) <= 100, `${name}: ${storyTrackCount(graph)} tracks`);
      assert.ok(says(graph, "Pikachu") >= 2, `${name} names the partner`);
      if (name !== "gym") assert.ok(says(graph, "[cry:25]") >= 1, `${name} plays the partner's cry`);
      for (const node of graph.nodes) {
        for (const line of speakerLines(node.text, graph.cast ?? [])) {
          if ("speaker" in line) assert.ok(line.speaker === "narrator" || graph.cast?.some((c) => c.id === line.speaker));
        }
      }
      assert.equal(says(build(), "Pikachu") > 0 && name !== "gym" && name !== "safari" ? "named" : "fine", "fine");
    }
  });

  it("is waiting at the end of the Island voyage and the Paldea picnic", () => {
    const island = builds.island(PIKACHU);
    const golden = island.nodes.find((node) => node.kind === "ending" && node.ending.golden);
    assert.match(golden?.text ?? "", /Pikachu, right there beside you, has the best night of its whole life/);
    const picnic = builds.paldea(PIKACHU);
    for (const node of picnic.nodes.filter((item) => item.kind === "ending")) assert.match(node.text, /Pikachu/);
  });

  it("is never one of the Safari Pokémon to catch", () => {
    const pool = loadSafariPool();
    const someone = pool[0]!;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plan = planSafari(pool, seed, "", { id: someone.id, name: someone.name });
      assert.ok(plan.stops.every((stop) => stop.mon.id !== someone.id));
      assert.notEqual(plan.golden.mon.id, someone.id);
    }
  });

  it("joins the Gym team: in place of its own type, or as a seventh member", () => {
    const pool = loadBattlePool();
    const pikachu = pool.find((mon) => mon.id === 25)!;
    const withPikachu = planGym(pool, 4, "", pikachu);
    assert.equal(withPikachu.team.length, 6);
    assert.ok(withPikachu.team.some((mon) => mon.id === 25));
    assert.ok(withPikachu.gyms.every(({ first, ace }) => first.foe.id !== 25 && ace.foe.id !== 25));
    const gym = gymAdventure({ seed: 4, partner: MEWTWO });
    assert.match(gym.nodes[0]?.text ?? "", /Your team of seven/);
    assert.match(gym.nodes[0]?.text ?? "", /your partner Mewtwo, the Psychic type/);
  });

  it("is read from the route, and anything that is not a Pokémon is ignored", async () => {
    const story = (await islandRoute(new Request("http://localhost/api/adventure/island?seed=2&partner=25")).json()).story;
    assert.ok(says(story, "Pikachu") > 0);
    const ignored = (await gymRoute(new Request("http://localhost/api/adventure/gym?seed=2&partner=9999")).json()).story;
    assert.match(ignored.nodes[0].text, /Your team of six/);
    assert.equal(partnerFor(29)?.name, "Nidoran female");
    assert.equal(sayableName("Mr. Mime"), "Mr Mime");
  });
});
