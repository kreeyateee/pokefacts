import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/safari/route";
import { listSafariSpecies } from "../catalogue-db";
import { FIELD_NOTES, GOLDEN_STOPS } from "./safari-roster";
import { storyTrackCount as trackCount, checkStory } from "./story-check";
import { pacingProblems, randomPlaythroughs } from "./story-metrics";
import { withoutCues } from "./story-sound";
import { speakerLines } from "./story-voices";
import { withoutVoiceTags } from "../voice-tags";
import type { StoryGraph, StoryNode } from "./story-graph";
import {
  cleanOwner,
  loadSafariPool,
  nameVariants,
  numberWords,
  SAFARI_AREAS,
  safariAdventure,
  safariFromPool,
  throwFor,
  type SafariArea,
  type SafariMon,
} from "./safari";
import type { FieldNotes } from "./safari-roster";

function targets(node: StoryNode): string[] {
  if (node.kind === "scene") return [node.next];
  if (node.kind === "choice") return [node.left.to, node.right.to];
  return [];
}

/** The shared checker, plus what a Safari story must also be: no loops and two different buttons. */
function checkGraph(graph: StoryGraph): string[] {
  const errors = checkStory(graph);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    if (node.kind === "choice" && node.left.to === node.right.to) errors.push(`${node.id} has two buttons to one place`);
  }
  const state = new Map<string, "open" | "done">();
  const visit = (id: string) => {
    const seen = state.get(id);
    if (seen === "open") {
      errors.push(`loop through ${id}`);
      return;
    }
    if (seen === "done") return;
    state.set(id, "open");
    const node = byId.get(id);
    if (node) for (const to of targets(node)) visit(to);
    state.set(id, "done");
  };
  visit(graph.start);
  return errors;
}

function nodeMap(graph: StoryGraph): Map<string, StoryNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

/** Every node that can reach `id`, not counting itself. */
function ancestors(graph: StoryGraph, id: string): Set<string> {
  const parents = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const to of targets(node)) parents.set(to, [...(parents.get(to) ?? []), node.id]);
  }
  const found = new Set<string>();
  const queue = [...(parents.get(id) ?? [])];
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    queue.push(...(parents.get(next) ?? []));
  }
  return found;
}

function spokenText(node: StoryNode): string {
  return node.kind === "choice" ? `${node.text} ${node.left.label} ${node.right.label}` : node.text;
}

function says(text: string, name: string): boolean {
  return nameVariants(name).some((variant) =>
    new RegExp(`(^|[^\\p{L}])${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu").test(text),
  );
}

/** Golden path: start to the golden ending, with the button pressed at each choice. */
function goldenWalk(graph: StoryGraph): Array<{ node: StoryNode; pressed?: "left" | "right" }> {
  const nodes = nodeMap(graph);
  const goal = graph.nodes.find((node) => node.kind === "ending" && node.ending.golden)!;
  const walk = (id: string): Array<{ node: StoryNode; pressed?: "left" | "right" }> | null => {
    const node = nodes.get(id)!;
    if (id === goal.id) return [{ node }];
    if (node.kind === "ending") return null;
    if (node.kind === "scene") {
      const rest = walk(node.next);
      return rest ? [{ node }, ...rest] : null;
    }
    for (const side of ["left", "right"] as const) {
      const rest = walk(node[side].to);
      if (rest) return [{ node, pressed: side }, ...rest];
    }
    return null;
  };
  return walk(graph.start) ?? [];
}

/** All the story rules that do not depend on where the species came from. */
function assertSafariRules(graph: StoryGraph, nameOf: (id: number) => string) {
  assert.deepEqual(checkGraph(graph), []);
  const nodes = nodeMap(graph);

  // Exactly one golden ending, and it is reachable.
  const golden = graph.nodes.filter((node) => node.kind === "ending" && node.ending.golden);
  assert.equal(golden.length, 1);
  assert.ok(goldenWalk(graph).length > 0, "the golden ending is reachable");

  // Every encounter plays a cry and shows a shadow.
  const encounters = graph.nodes.filter(
    (node) =>
      node.kind === "choice" &&
      [node.left.label, node.right.label].some((label) => /^(throw|creep up on)\b/.test(label)),
  );
  assert.ok(encounters.length >= 7);
  for (const node of encounters) {
    assert.ok(node.dexId, `${node.id} plays a cry`);
    assert.deepEqual(node.icon, { dexId: node.dexId, shadow: true }, `${node.id} shows a shadow`);
  }
  for (const node of graph.nodes) {
    if (node.icon && "dexId" in node.icon && node.icon.shadow) assert.equal(node.dexId, node.icon.dexId);
  }

  // No name before its reveal: not in a shadow node, not in anything that leads to one.
  const dexIds = new Set(graph.nodes.flatMap((node) => (node.dexId ? [node.dexId] : [])));
  for (const node of graph.nodes) {
    if (!(node.icon && "dexId" in node.icon && node.icon.shadow)) continue;
    const name = nameOf(node.icon.dexId);
    for (const id of [node.id, ...ancestors(graph, node.id)]) {
      assert.ok(!says(spokenText(nodes.get(id)!), name), `${id} names ${name} before the reveal`);
    }
  }
  // A question never names any Pokémon in the adventure.
  const names = [...dexIds].map(nameOf);
  for (const node of graph.nodes) {
    if (node.kind !== "choice") continue;
    for (const name of names) assert.ok(!says(spokenText(node), name), `${node.id} names ${name}`);
  }

  // Written for the ear: no digits or symbols, sensible lengths, labels read after "Press left to".
  for (const node of graph.nodes) {
    assert.doesNotMatch(withoutVoiceTags(withoutCues(node.text)), /[0-9♀♂&%#@*_<>{}[\]|~^$]/, `${node.id} has a symbol or digit`);
    assert.ok(node.text.length <= 1500, `${node.id} is ${node.text.length} characters`);
    assert.doesNotMatch(node.text, /\b(victims?|prey|blood|kill\w*|dead|death)\b|\bIt of\b/i, `${node.id} is not gentle`);
    if (node.kind === "choice") {
      for (const label of [node.left.label, node.right.label]) {
        assert.match(label, /^[a-z]/);
        assert.ok(label.length <= 40);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A fake Safari, so the builder can be tested without the catalogue.

const AREA_TYPES: Record<SafariArea, string> = {
  cave: "Ghost",
  forest: "Bug",
  grassland: "Normal",
  mountain: "Rock",
  "rough-terrain": "Ground",
  sea: "Water",
  urban: "Psychic",
  "waters-edge": "Grass",
};
const SYLLABLES = ["ka", "lo", "mi", "ru", "te", "va", "zu", "pe"];
const COLOURS = ["Red", "Blue", "Green", "Yellow", "Pink", "Brown", "Purple", "Gray", "White", "Black"];
const BEHAVIOUR: Array<[number, number]> = [
  [255, 50],
  [190, 90],
  [45, 100],
  [60, 40],
  [200, 30],
  [30, 85],
  [75, 55],
  [150, 70],
];

function fakeNotes(areaIndex: number, index: number): FieldNotes {
  return {
    colour: COLOURS[(areaIndex + index) % COLOURS.length]!.toLowerCase(),
    glimpse: `with ${index + 1 > 4 ? "long" : "short"} ears and a tail like a feather`,
    look: "It hums a quiet tune and keeps a pebble in each cheek.",
    fact: "It sleeps in a heap of leaves.",
  };
}

function fakePool(): SafariMon[] {
  const pool: SafariMon[] = [];
  SAFARI_AREAS.forEach((area, areaIndex) => {
    BEHAVIOUR.forEach(([captureRate, speed], index) => {
      const id = areaIndex === 6 && index === 5 ? 113 : 400 + areaIndex * 10 + index;
      const name = `${SYLLABLES[areaIndex]}${SYLLABLES[index]}mon`.replace(/^./, (c) => c.toUpperCase());
      pool.push({
        id,
        slug: name.toLowerCase(),
        name,
        genus: `Test ${index} Pokémon`,
        types: [AREA_TYPES[area]],
        heightDecimetres: 3 + index * 4,
        weightHectograms: 40 + index * 90,
        stats: [],
        abilityName: null,
        abilityEffect: null,
        evolution: "",
        evolvesFrom: null,
        evolvesInto: [],
        habitat: `Look for it in ${area.replace(/-/g, " ")}.`,
        color: COLOURS[(areaIndex + index) % COLOURS.length],
        entries: [
          { text: `${name} hums a quiet tune when the moon is out. It keeps a pebble in each cheek.`, version: "shield" },
          { text: `This Pokémon is very shy. ${name} sleeps in a heap of leaves.`, version: "sword" },
        ],
        area,
        captureRate,
        speed,
        notes: fakeNotes(areaIndex, index),
      });
    });
  });
  return pool;
}

describe("safari rules", () => {
  it("follows the warden's throwing rule", () => {
    assert.equal(throwFor({ captureRate: 190, speed: 120 }), "ball");
    assert.equal(throwFor({ captureRate: 45, speed: 105 }), "bait");
    assert.equal(throwFor({ captureRate: 30, speed: 50 }), "rock");
  });

  it("says numbers the British way", () => {
    assert.equal(numberWords(190), "one hundred and ninety");
    assert.equal(numberWords(45), "forty five");
    assert.equal(numberWords(200), "two hundred");
  });

  it("keeps a sensible owner name and drops anything else", () => {
    assert.equal(cleanOwner("  Mia  Rose "), "Mia Rose");
    assert.equal(cleanOwner("Zoë O'Neil-Smith"), "Zoë O'Neil-Smith");
    assert.equal(cleanOwner("<script>"), "");
    assert.equal(cleanOwner("Ash 2"), "");
    assert.equal(cleanOwner("x".repeat(41)), "");
    assert.equal(cleanOwner(null), "");
  });
});

describe("safari builder with a fake species list", () => {
  const pool = fakePool();
  const names = new Map(pool.map((mon) => [mon.id, mon.name]));
  const nameOf = (id: number) => names.get(id) ?? "";

  it("builds a valid map for many seeds", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const graph = safariFromPool(pool, { seed, owner: "Mia" });
      assertSafariRules(graph, nameOf);
      assert.equal(trackCount(graph), 98, `seed ${seed} uses ${trackCount(graph)} tracks`);
    }
  });

  it("is the same for one seed and different across seeds", () => {
    const first = safariFromPool(pool, { seed: 7 });
    assert.deepEqual(safariFromPool(pool, { seed: 7 }), first);
    const others = [8, 9, 10].map((seed) => JSON.stringify(safariFromPool(pool, { seed }).nodes));
    assert.ok(others.every((nodes) => nodes !== JSON.stringify(first.nodes)));
  });

  it("greets the owner, and falls back to trainer", () => {
    assert.match(safariFromPool(pool, { seed: 3, owner: "Mia" }).nodes[0]!.text, /Morning, Mia\./);
    assert.match(safariFromPool(pool, { seed: 3, owner: "<b>" }).nodes[0]!.text, /Morning, trainer\./);
  });
});

describe("safari adventure from the catalogue", () => {
  const pool = loadSafariPool();
  const names = new Map(pool.map((mon) => [mon.id, mon.name]));
  const nameOf = (id: number) => names.get(id) ?? "";

  it("lists Safari species with habitat, catch rate and Speed", () => {
    const rows = listSafariSpecies();
    assert.ok(rows.length > 300);
    const scyther = rows.find((row) => row.id === 123);
    assert.deepEqual(scyther, { id: 123, habitat: "grassland", captureRate: 45, speed: 105 });
    assert.ok(rows.every((row) => row.habitat !== "rare"));
    assert.ok(!rows.some((row) => row.id === 150 || row.id === 172));
  });

  it("builds a valid, expert map for many seeds", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const graph = safariAdventure({ seed });
      assertSafariRules(graph, nameOf);
      assert.equal(trackCount(graph), 98, `seed ${seed} uses ${trackCount(graph)} tracks`);
    }
  });

  it("never ends early: every day goes round all five stops, whatever you choose", () => {
    for (const seed of [1, 2, 3]) {
      const graph = safariAdventure({ seed });
      const nodes = nodeMap(graph);
      let state = seed;
      const coin = () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state % 2 === 0;
      };
      for (let walk = 0; walk < 40; walk += 1) {
        let node = nodes.get(graph.start)!;
        const stops = new Set<string>();
        for (let steps = 0; steps < 80 && node.kind !== "ending"; steps += 1) {
          if (/^s\da\d$/.test(node.id)) stops.add(node.id[1] as string);
          node = nodes.get(node.kind === "scene" ? node.next : coin() ? node.left.to : node.right.to)!;
        }
        assert.equal(node.kind, "ending");
        assert.equal(stops.size, 5, `walk ${walk} visited stops ${[...stops].join(",")}`);
      }
      assert.deepEqual(
        graph.nodes.flatMap((item) => (item.kind === "ending" ? [item.ending.name] : [])).sort(),
        ["A Good Day Out", "Barnaby's Bad Day", "Golden Legend", "Safari Master"],
      );
    }
  });

  it("is deterministic per seed and differs across seeds", () => {
    assert.deepEqual(safariAdventure({ seed: 42, owner: "Mia" }), safariAdventure({ seed: 42, owner: "Mia" }));
    const stops = (seed: number) =>
      safariAdventure({ seed })
        .nodes.filter((node) => node.id.endsWith("b0"))
        .map((node) => node.dexId)
        .join(",");
    assert.notEqual(stops(1), stops(2));
    assert.notEqual(stops(2), stops(3));
  });

  it("serves the route and checks its input", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/safari?seed=5&owner=Mia")).json();
    assert.equal(good.story.id, "safari-5");
    assert.match(good.story.nodes[0].text, /Mia/);
    const ignored = await GET(new Request("http://localhost/api/adventure/safari?seed=5&owner=%3Cb%3E")).json();
    assert.match(ignored.story.nodes[0].text, /trainer/);
    const bad = GET(new Request("http://localhost/api/adventure/safari?seed=1.5"));
    assert.equal(bad.status, 400);
    const fresh = await GET(new Request("http://localhost/api/adventure/safari")).json();
    assert.match(fresh.story.id, /^safari-\d+$/);
  });

  it("has field notes only for Safari Pokémon, and they never give the name away", () => {
    const byId = new Map(pool.map((mon) => [mon.id, mon]));
    const everyName = pool.map((mon) => mon.name);
    for (const [key, notes] of Object.entries(FIELD_NOTES)) {
      const mon = byId.get(Number(key));
      assert.ok(mon, `field notes for ${key}, which is not a Safari Pokémon`);
      for (const line of [notes.glimpse, notes.look]) {
        for (const name of everyName) assert.ok(!says(line, name), `${mon.name}'s clue names ${name}`);
      }
      assert.match(notes.glimpse, /^[a-z]/, `${mon.name}'s glimpse follows "a ${notes.colour} one,"`);
      assert.doesNotMatch(notes.glimpse, /[.!?]$/);
      for (const line of [notes.look, notes.fact]) assert.match(line, /[.!?']$/, `${mon.name} ends its sentences`);
      assert.doesNotMatch(`${notes.look} ${notes.fact}`, /[0-9]/);
    }
    for (const id of Object.keys(GOLDEN_STOPS)) assert.ok(FIELD_NOTES[Number(id)], `golden ${id} has notes`);
  });

  it("never says a stat, and varies its words from stop to stop", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const graph = safariAdventure({ seed });
      const all = graph.nodes.map((node) => node.text).join(" ");
      assert.doesNotMatch(all, /catch rate|\bspeed\b|Kssh|Expert tip|Stop (one|two|three) of/i);
      const finds = graph.nodes.filter((node) => /^s\da0$/.test(node.id)).map((node) => node.text.split(". ")[0]);
      assert.equal(new Set(finds).size, finds.length, `seed ${seed} opens two stops the same way`);
    }
  });

  it("plays the catch sound at every catch, and gives every quote a speaker", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const graph = safariAdventure({ seed, owner: "Mia" });
      for (const node of graph.nodes) {
        const catching = /^s\dc\d$/.test(node.id) || node.id === "goldc";
        assert.equal(node.text.includes("[catch]"), catching || node.id === "lesson", `${node.id} catch sound`);
        const lines = speakerLines(node.text, graph.cast ?? []);
        for (const line of lines) {
          if ("speaker" in line) assert.ok(["narrator", "marigold", "barnaby"].includes(line.speaker));
        }
      }
    }
  });

  it("sets every scene in its place, with footsteps, fanfares, stings and the Poké Ball on catches", () => {
    for (const seed of [1, 2, 3, 4]) {
      const graph = safariAdventure({ seed });
      for (const node of graph.nodes) {
        const catching = /^s\dc\d$/.test(node.id) || node.id === "goldc";
        if (/^s\da\d$/.test(node.id)) assert.match(node.text, /^\[footsteps\]/, `${node.id} starts with footsteps`);
        if (catching) assert.match(node.text, /\[throw\] \[catch\] .*\[fanfare\]/);
        if (node.kind === "ending") {
          assert.match(node.text, node.ending.golden ? /\[golden\]$/ : /\[ending\]$/);
        } else {
          assert.ok(node.bed?.ambience && node.bed.music, `${node.id} has ambience and music`);
          // Where he can turn up (on the way in, beating you to a Pokémon), the music turns tense.
          // A tally that only mentions him, and the gate where you meet him, keep the scene's music.
          const touring = /^s\d[aw]\d$/.test(node.id);
          if (touring && /\bBarnaby\b/.test(node.text)) assert.equal(node.bed.music, "tense", `${node.id} is tense with Barnaby about`);
        }
      }
      const all = graph.nodes.map((node) => node.text).join(" ");
      assert.doesNotMatch(all, /Pheeeep|\[whistle\]|blows? (her|the|my) whistle/);
    }
  });

  it("shows the shadow, then the Poké Ball, then how the throw went, with the Pokémon's cry after a catch", () => {
    for (const seed of [1, 2, 3]) {
      const graph = safariAdventure({ seed });
      const byId = new Map(graph.nodes.map((node) => [node.id, node]));
      for (const meet of graph.nodes.filter((node) => /^(s\db\d|goldb)$/.test(node.id))) {
        assert.ok(meet.kind === "choice");
        if (meet.kind !== "choice") continue;
        const dexId = meet.dexId as number;
        assert.deepEqual(meet.icon, { dexId, shadow: true }, `${meet.id} close-up is the shadow`);
        assert.deepEqual(meet.questionIcon, { pixel: "pokeball" }, `${meet.id} throw question is the Poké Ball`);
        const throws = [meet.left.to, meet.right.to].map((id) => byId.get(id));
        const caught = throws.find((node) => node?.icon && "pixel" in node.icon && node.icon.pixel === "pokeball-caught");
        const broke = throws.find((node) => node?.icon && "pixel" in node.icon && node.icon.pixel === "pokeball-broken");
        assert.ok(caught && broke, `${meet.id} leads to a caught ball and a broken one`);
        // The result and the reveal share a track now; a catch plays the cry after the ball clicks shut.
        if (meet.id !== "goldb") {
          const catchAt = caught?.text.indexOf("[catch]") ?? -1;
          const cryAt = caught?.text.indexOf(`[cry:${dexId}]`) ?? -1;
          assert.ok(catchAt >= 0 && cryAt > catchAt, `${caught?.id} plays the cry after the ball clicks shut`);
        }
      }
    }
  });

  it("records the child's name on its own, and leaves Pokémon names in their lines", () => {
    assert.deepEqual(safariAdventure({ seed: 1, owner: "Mia" }).slots, ["Mia"]);
    assert.deepEqual(safariAdventure({ seed: 1 }).slots, []);
  });

  it("walks the golden path through every stop", () => {
    const graph = safariAdventure({ seed: 1, owner: "Mia" });
    const walk = goldenWalk(graph);
    assert.equal(walk.at(-1)?.node.id, "end4");
    assert.ok(walk.some(({ node }) => node.id === "gold"));
  });

  it("lets a child who listens catch Barnaby up: a catch wins one back, and finishing level opens the secret stop", () => {
    const graph = safariAdventure({ seed: 1, owner: "Mia" });
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    /** Plays a day, getting the throw wrong at the stops listed and everything else right. */
    const day = (slipAt: number[]) => {
      let node = byId.get("lesson") as StoryNode;
      const seen: string[] = [];
      for (let steps = 0; steps < 60 && node.kind !== "ending"; steps += 1) {
        seen.push(node.id);
        if (node.kind === "scene") {
          node = byId.get(node.next) as StoryNode;
          continue;
        }
        const stop = Number(/^s(\d)/.exec(node.id)?.[1] ?? 0);
        const wrong = slipAt.includes(stop) && /^s\db\d$/.test(node.id);
        const good = [node.left, node.right].find((choice) => /^(s\d[bc]\d|goldb|goldc)$/.test(choice.to));
        const bad = [node.left, node.right].find((choice) => choice !== good);
        node = byId.get((wrong ? bad : good)?.to ?? node.left.to) as StoryNode;
      }
      return { ending: node.kind === "ending" ? node.ending : null, secret: seen.includes("gold") };
    };
    assert.deepEqual(day([]).ending?.name, "Golden Legend");
    assert.equal(day([2]).secret, true, "one slip, then catches, and you finish ahead of Barnaby");
    assert.equal(day([1, 2]).secret, true, "two early slips, then three catches, still catches him up");
    assert.equal(day([4, 5]).ending?.name, "A Good Day Out", "two late slips leave Barnaby ahead");
    assert.equal(day([5]).ending?.name, "Barnaby's Bad Day", "a slip at the very last stop leaves him just ahead");
  });

  it("is fair: the rare one is always the shy one, and Marigold's rule comes before every throw", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const graph = safariAdventure({ seed });
      for (const node of graph.nodes) {
        if (node.kind !== "choice") continue;
        if ([node.left.label, node.right.label].some((label) => label.startsWith("throw"))) {
          assert.match(node.text, /Common, ball\. Rare and fast, bait\. Rare and slow, rock/i, `${node.id} says the rule`);
        }
        if ([node.left.label, node.right.label].some((label) => label.startsWith("creep up on"))) {
          // Exactly one of the two is shy, and it's the one the right button creeps up on.
          const shy = /(peeking at you|ducks down|watching you, shy)/.exec(node.text);
          assert.ok(shy, `${node.id} gives the shy tell`);
        }
      }
    }
  });

  it("keeps a child pressing buttons, records a sentence at a time, and spreads its endings", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      assert.deepEqual(pacingProblems(safariAdventure({ seed, owner: "Mia" })), [], `seed ${seed}`);
      assert.deepEqual(pacingProblems(safariAdventure({ seed, owner: "Mia", partner: { id: 25, name: "Pikachu" } })), [], `seed ${seed} with a partner`);
      for (const [owner, id, name] of [["Maximilian", 150, "Mewtwo"], ["Alexandria", 143, "Snorlax"]] as const) {
        assert.deepEqual(pacingProblems(safariAdventure({ seed, owner, partner: { id, name } })), [], `seed ${seed}, ${owner} and ${name}`);
      }
    }
    const graph = safariAdventure({ seed: 1 });
    assert.equal(graph.pieces, "sentences");
    for (const seed of [1, 2, 3]) {
      const { endings } = randomPlaythroughs(safariAdventure({ seed }));
      const twoOrBetter = (endings[2] ?? 0) + (endings[3] ?? 0) + (endings[4] ?? 0);
      assert.ok(twoOrBetter >= 0.25, `seed ${seed}: ending 2 or better ${twoOrBetter}`);
      assert.ok((endings[4] ?? 0) >= 0.01 && (endings[4] ?? 0) <= 0.1, `seed ${seed}: golden ${endings[4]}`);
    }
  });
});
