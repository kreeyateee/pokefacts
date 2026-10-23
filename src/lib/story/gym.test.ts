import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/gym/route";
import { effectiveness, type PokemonType } from "../type-chart";
import { buildGym, gymAdventure, judge, loadBattlePool, planGym } from "./gym";
import { GYMS, LEGENDS, TEAM_TYPES } from "./gym-words";
import { checkStory, storyTrackCount } from "./story-check";
import type { StoryGraph, StoryNode } from "./story-graph";
import { CRY_CUE, withoutCues } from "./story-sound";
import { speakerLines } from "./story-voices";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 42, 99, 1234, 31337];

function node(graph: StoryGraph, id: string): StoryNode {
  const found = graph.nodes.find((each) => each.id === id);
  assert.ok(found, `${graph.id} has ${id}`);
  return found;
}

function choice(graph: StoryGraph, id: string) {
  const found = node(graph, id);
  assert.equal(found.kind, "choice", `${id} is a choice`);
  return found as Extract<StoryNode, { kind: "choice" }>;
}

describe("Gym Challenge", () => {
  const pool = loadBattlePool();

  it("builds a valid map that fits on one card, for many seeds", () => {
    for (const seed of SEEDS) {
      const graph = gymAdventure({ seed });
      assert.deepEqual(checkStory(graph), [], `seed ${seed}`);
      const tracks = storyTrackCount(graph);
      assert.ok(tracks <= 100, `seed ${seed} uses ${tracks} tracks`);
      assert.equal(graph.nodes.filter((each) => each.kind === "ending").length, 5);
    }
  });

  it("is the same for one seed and different across seeds", () => {
    assert.deepEqual(gymAdventure({ seed: 42, owner: "Mia" }), gymAdventure({ seed: 42, owner: "Mia" }));
    const foes = (seed: number) =>
      planGym(pool, seed)
        .gyms.map((gym) => gym.ace.foe.id)
        .join(",");
    assert.notEqual(foes(1), foes(2));
    assert.notEqual(foes(2), foes(3));
  });

  it("gives you one of each team type, and every round a right and a wrong answer", () => {
    for (const seed of SEEDS) {
      const plan = planGym(pool, seed);
      assert.deepEqual(
        plan.team.map((mon) => mon.types),
        TEAM_TYPES.map((type) => [type]),
      );
      const judged = [
        ...plan.gyms.flatMap(({ gym, first, ace }) => [
          { round: first, gymType: undefined },
          { round: ace, gymType: gym.type },
        ]),
        ...plan.champion.map((round) => ({ round, gymType: undefined })),
      ];
      for (const { round, gymType } of judged) {
        assert.ok(effectiveness(round.right.types[0] as PokemonType, round.foe.types) >= 2, `${round.right.name} wins`);
        assert.equal(judge(round.wrong, round.foe, gymType), round.miss);
        assert.notEqual(round.miss, null);
      }
      const rounds = judged.map((each) => each.round);
      const ids = rounds.map((round) => round.foe.id);
      assert.equal(new Set(ids).size, ids.length, `seed ${seed} meets a Pokémon twice`);
      for (const id of ids) assert.ok(!Object.hasOwn(LEGENDS, id), `seed ${seed} battles a legend`);
    }
  });

  it("matches each gym to its type, with a dual-type ace that is usually a trap", () => {
    let traps = 0;
    for (const seed of SEEDS) {
      const plan = planGym(pool, seed);
      plan.gyms.forEach(({ gym, first, ace }, index) => {
        assert.equal(gym.type, GYMS[index]?.type);
        assert.deepEqual(first.foe.types, [gym.type]);
        assert.equal(ace.foe.types.length, 2);
        assert.ok(ace.foe.types.includes(gym.type));
        assert.ok(ace.foe.total >= 450);
        if (ace.miss === "trap") {
          traps += 1;
          assert.ok(effectiveness(ace.wrong.types[0] as PokemonType, [gym.type]) >= 2, "a trap beats the gym's type");
        }
      });
      assert.equal(new Set(plan.champion.flatMap((round) => round.foe.types)).size, 6, "Champion's types never repeat");
    }
    assert.ok(traps >= SEEDS.length * 6, `only ${traps} traps`);
  });

  it("lets you try again at a gym, but not against the Champion", () => {
    const graph = gymAdventure({ seed: 7 });
    for (let number = 1; number <= 8; number += 1) {
      for (const [ask, miss, win] of [
        [`g${number}a`, `g${number}m`, `g${number}b`],
        [`g${number}b`, `g${number}n`, `g${number}c`],
      ] as const) {
        const asked = choice(graph, ask);
        assert.deepEqual([asked.left.to, asked.right.to].sort(), [miss, win].sort());
        const missed = choice(graph, miss);
        assert.deepEqual([missed.left.to, missed.right.to], [asked.left.to, asked.right.to]);
      }
    }
    for (const [ask, win, lose] of [
      ["c1", "c2", "end1"],
      ["c2", "c3", "end2"],
      ["c3", "win", "end3"],
    ]) {
      const asked = choice(graph, ask as string);
      assert.deepEqual([asked.left.to, asked.right.to].sort(), [win, lose].sort());
    }
  });

  it("reaches the golden ending, and only names the legend after the choice", () => {
    for (const seed of SEEDS) {
      const graph = gymAdventure({ seed });
      const legend = choice(graph, "legend");
      assert.ok(node(graph, "win").kind === "scene");
      assert.equal((node(graph, "win") as Extract<StoryNode, { kind: "scene" }>).next, "legend");
      const golden = node(graph, legend.right.to);
      assert.equal(golden.kind === "ending" && golden.ending.golden, true);
      assert.ok(legend.icon && "shadow" in legend.icon && legend.icon.shadow);
      const name = Object.values(LEGENDS).find((each) => golden.text.includes(each.name))?.name;
      assert.ok(name, `seed ${seed} names the legend in the ending`);
      for (const each of graph.nodes) {
        if (each.kind !== "ending") assert.ok(!each.text.includes(name), `${each.id} gives away ${name}`);
      }
      assert.match(legend.text, new RegExp(CRY_CUE.source));
    }
  });

  it("plays each opponent's cry, shows its picture, and the Poké Ball while you choose", () => {
    const graph = gymAdventure({ seed: 3 });
    for (const each of graph.nodes) {
      if (each.kind !== "choice" || each.id === "start" || each.id === "legend") continue;
      assert.ok(each.icon && "dexId" in each.icon, `${each.id} shows a Pokémon`);
      assert.deepEqual(each.questionIcon, { pixel: "pokeball" });
      if (/^(g\d[ab]|c\d)$/.test(each.id)) assert.ok(each.text.includes(`[cry:${each.icon.dexId}]`), `${each.id} cry`);
    }
    for (let number = 1; number <= 8; number += 1) {
      const badge = node(graph, `g${number}c`);
      assert.deepEqual(badge.icon, { pixel: `badge-${GYMS[number - 1]?.type.toLowerCase()}` });
      assert.match(badge.text, /\[badge\]/);
    }
  });

  it("gives every quote a speaker from the cast, and the leaders their own lines", () => {
    const cast = new Set(["narrator", "ronnie", "aurelia", ...GYMS.map((gym) => gym.leader.toLowerCase())]);
    for (const seed of [1, 2, 3]) {
      const graph = gymAdventure({ seed, owner: "Mia" });
      for (const each of graph.nodes) {
        for (const line of speakerLines(each.text, graph.cast ?? [])) {
          if ("speaker" in line) assert.ok(cast.has(line.speaker), `${each.id}: ${line.speaker}`);
        }
      }
      GYMS.forEach((gym, index) => {
        const speakers = speakerLines(node(graph, `g${index + 1}m`).text, graph.cast ?? []).flatMap((line) =>
          "speaker" in line ? [line.speaker] : [],
        );
        assert.ok(speakers.includes(gym.leader.toLowerCase()), `${gym.leader} teases`);
        assert.ok(speakers.includes("ronnie"), "Ronnie commentates");
      });
    }
  });

  it("says a and an properly, and leaves no gaps", () => {
    for (const seed of SEEDS) {
      const all = gymAdventure({ seed, owner: "Mia" }).nodes.map((each) => withoutCues(each.text)).join(" ");
      assert.doesNotMatch(all, /\ba (Ice|Electric)\b/);
      assert.doesNotMatch(all, /[{}]/);
      assert.doesNotMatch(all, /\bundefined\b|\bnull\b/);
    }
  });

  it("greets the owner by name, and gets on without one", () => {
    const named = gymAdventure({ seed: 5, owner: "Mia" });
    assert.match(named.nodes[0]?.text ?? "", /this is Mia, our newest challenger/);
    assert.deepEqual(named.slots, ["Mia"]);
    const plain = gymAdventure({ seed: 5 });
    assert.match(plain.nodes[0]?.text ?? "", /here comes our newest challenger/);
    assert.deepEqual(plain.slots, []);
    assert.equal(buildGym(planGym(pool, 5, "<b>")).slots?.length, 0);
  });

  it("serves the route and checks its input", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/gym?seed=5&owner=Mia")).json();
    assert.equal(good.story.id, "gym-5");
    assert.match(good.story.nodes[0].text, /Mia/);
    const bad = GET(new Request("http://localhost/api/adventure/gym?seed=abc"));
    assert.equal(bad.status, 400);
    const fresh = await GET(new Request("http://localhost/api/adventure/gym")).json();
    assert.match(fresh.story.id, /^gym-\d+$/);
  });
});
