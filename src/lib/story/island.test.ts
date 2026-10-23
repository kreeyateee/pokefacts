import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../../app/api/adventure/island/route";
import { ISLAND_ENDINGS, islandAdventure } from "./island";
import { storyCard } from "./story-card";
import { checkStory, storyTrackCount } from "./story-check";
import type { StoryGraph, StoryNode } from "./story-graph";
import { withoutCues } from "./story-sound";
import { speakerLines } from "./story-voices";

function byId(graph: StoryGraph): Map<string, StoryNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function next(node: StoryNode): string[] {
  if (node.kind === "scene") return [node.next];
  if (node.kind === "choice") return [node.left.to, node.right.to];
  return [];
}

/** Follows left or right at each choice, by the button labels given, to an ending. */
function walk(graph: StoryGraph, picks: Record<string, "left" | "right">): StoryNode {
  const nodes = byId(graph);
  let node = nodes.get(graph.start) as StoryNode;
  for (let steps = 0; steps < 50 && node.kind !== "ending"; steps += 1) {
    if (node.kind === "scene") node = nodes.get(node.next) as StoryNode;
    else node = nodes.get(node[picks[node.id] ?? "left"].to) as StoryNode;
  }
  return node;
}

describe("Island Adventure", () => {
  const graph = islandAdventure({ seed: 1, owner: "Mia" });

  it("is a valid card, well inside a Yoto card's 100 tracks", () => {
    assert.deepEqual(checkStory(graph), []);
    assert.ok(storyTrackCount(graph) <= 100);
    assert.doesNotThrow(() => storyCard(graph));
  });

  it("has nine numbered endings, one golden, and every node can be reached", () => {
    const endings = graph.nodes.flatMap((node) => (node.kind === "ending" ? [node.ending] : []));
    assert.deepEqual(
      endings.map((item) => item.name),
      [...ISLAND_ENDINGS],
    );
    assert.deepEqual(
      endings.filter((item) => item.golden).map((item) => item.number),
      [9],
    );
    const nodes = byId(graph);
    const seen = new Set<string>();
    const queue = [graph.start];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...next(nodes.get(id) as StoryNode));
    }
    assert.equal(seen.size, graph.nodes.length);
  });

  it("reaches the golden ending by sailing well, and detours rejoin the voyage", () => {
    const golden = walk(graph, { leg1: "right", deep: "right", storm: "right", path: "right" });
    assert.equal(golden.kind === "ending" && golden.ending.golden, true);
    const stung = walk(graph, { leg1: "right", deep: "right", storm: "left", path: "right" });
    assert.equal(stung.id, golden.id, "going through the Tentacruel costs a hat, not the golden ending");
    assert.equal(walk(graph, { leg1: "left" }).id, "end1");
  });

  it("gives every line a speaker, with Brine and Nell in their own voices", () => {
    const speakers = new Set<string>();
    for (const node of graph.nodes) {
      for (const line of speakerLines(node.text, graph.cast ?? [])) if ("speaker" in line) speakers.add(line.speaker);
      assert.doesNotMatch(withoutCues(node.text), /\[|\]/, `${node.id} has a cue read as words`);
    }
    assert.deepEqual([...speakers].sort(), ["brine", "narrator", "nell"]);
    const path = speakerLines(byId(graph).get("path")?.text ?? "", graph.cast ?? []);
    assert.ok(path.some((line) => "speaker" in line && line.speaker === "nell"));
  });

  it("calls the child by name, or shipmate without one", () => {
    assert.match(graph.nodes[0]?.text ?? "", /How shall we do it, Mia\?/);
    assert.match(byId(graph).get("end9")?.text ?? "", /you're Captain Mia/);
    assert.deepEqual(graph.slots, ["Mia"]);
    const plain = islandAdventure({ seed: 2 });
    assert.match(plain.nodes[0]?.text ?? "", /How shall we do it, shipmate\?/);
    assert.deepEqual(plain.slots, []);
  });

  it("serves the route", async () => {
    const good = await GET(new Request("http://localhost/api/adventure/island?seed=5&owner=Mia")).json();
    assert.equal(good.story.id, "island-5");
    assert.equal(good.story.title, "Island Adventure");
    assert.equal(GET(new Request("http://localhost/api/adventure/island?seed=x")).status, 400);
  });
});
