import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkStory, endingCount, storyLines, storyTrackCount } from "./story-check";
import { smallStory } from "./story-fixture";
import type { StoryGraph, StoryNode } from "./story-graph";

function withNodes(nodes: StoryNode[], start = "gate"): StoryGraph {
  return { ...smallStory(), start, nodes };
}

describe("checkStory", () => {
  it("passes a small valid story", () => {
    assert.deepEqual(checkStory(smallStory()), []);
  });

  it("counts tracks and endings", () => {
    const story = smallStory();
    assert.equal(storyTrackCount(story), 6);
    assert.equal(endingCount(story), 2);
  });

  it("names a target that is not in the story", () => {
    const story = smallStory();
    const gate = story.nodes.find((node) => node.id === "gate");
    if (gate?.kind !== "scene") throw new Error("fixture changed");
    gate.next = "cave";
    const problems = checkStory(story);
    assert.ok(problems.includes("Node gate goes to cave, which is not in the story."), problems.join("\n"));
  });

  it("names a node that cannot be reached", () => {
    const story = smallStory();
    story.nodes.push({ id: "attic", kind: "scene", title: "Attic", text: "Dust.", next: "lake" });
    assert.deepEqual(checkStory(story), ["Node attic cannot be reached from the start."]);
  });

  it("finds a loop with no way out", () => {
    const story = smallStory();
    const grass = story.nodes.find((node) => node.id === "grass");
    if (grass?.kind !== "choice") throw new Error("fixture changed");
    grass.right = { to: "spin", label: "follow the Spinda" };
    story.nodes.push(
      { id: "spin", kind: "scene", title: "Spin", text: "Round you go.", next: "dizzy" },
      { id: "dizzy", kind: "scene", title: "Dizzy", text: "And round again.", next: "spin" },
    );
    const problems = checkStory(story);
    assert.ok(problems.includes("Node spin never reaches an ending, so a child would be stuck in a loop."));
    assert.ok(problems.includes("Node dizzy never reaches an ending, so a child would be stuck in a loop."));
    assert.ok(problems.includes("Node rock cannot be reached from the start."));
  });

  it("allows a loop that has a way out", () => {
    const story = smallStory();
    const rock = story.nodes.find((node) => node.id === "rock");
    if (rock?.kind !== "scene") throw new Error("fixture changed");
    rock.next = "grass";
    story.nodes = story.nodes.filter((node) => node.id !== "catch");
    assert.deepEqual(checkStory(story), []);
  });

  it("refuses a card over 100 tracks", () => {
    const nodes: StoryNode[] = Array.from({ length: 100 }, (_, index) => ({
      id: `s${index}`,
      kind: "scene" as const,
      title: `Step ${index}`,
      text: "You walk on.",
      next: index === 99 ? "end" : `s${index + 1}`,
    }));
    nodes.push({ id: "end", kind: "ending", title: "Home", text: "Home.", ending: { number: 1, name: "Home" } });
    const story = withNodes(nodes, "s0");
    assert.equal(storyTrackCount(story), 101);
    assert.deepEqual(checkStory(story), ["The story needs 101 tracks. A Yoto card holds 100."]);
  });

  it("checks ids, the start, and ending numbers", () => {
    const story = smallStory();
    story.start = "nowhere";
    story.nodes.push({ id: "Big-Lake", kind: "ending", title: "Big", text: "Big.", ending: { number: 4, name: "Big" } });
    story.nodes.push({ id: "lake", kind: "ending", title: "Again", text: "Again.", ending: { number: 1, name: "Again" } });
    const problems = checkStory(story);
    assert.ok(problems.includes('Node id "Big-Lake" must be 1 to 8 lowercase letters or digits.'));
    assert.ok(problems.includes("Node id lake is used twice."));
    assert.ok(problems.includes("The start node nowhere is not in the story."));
    assert.ok(problems.includes("Nodes lake and lake are both ending 1."));
    assert.ok(problems.includes("No node is ending 3."));
  });

  it("reports a gap in the ending numbers", () => {
    const story = smallStory();
    const golden = story.nodes.find((node) => node.id === "catch");
    if (golden?.kind !== "ending") throw new Error("fixture changed");
    golden.ending.number = 3;
    const problems = checkStory(story);
    assert.ok(problems.includes("Node catch is ending 3, but the 2 endings must be numbered 1 to 2."));
    assert.ok(problems.includes("No node is ending 2."));
  });

  it("needs narration within Yoto's text limit", () => {
    const story = smallStory();
    const gate = story.nodes.find((node) => node.id === "gate");
    const lake = story.nodes.find((node) => node.id === "lake");
    if (!gate || !lake) throw new Error("fixture changed");
    gate.text = "  ";
    lake.text = "a".repeat(2990);
    const problems = checkStory(story);
    assert.ok(problems.includes("Node gate has no narration."));
    assert.ok(problems.some((problem) => /^Node lake narration is \d+ characters\. Yoto reads at most 3000\.$/.test(problem)));
  });

  it("needs a label on both buttons", () => {
    const story = smallStory();
    const grass = story.nodes.find((node) => node.id === "grass");
    if (grass?.kind !== "choice") throw new Error("fixture changed");
    grass.left.label = "";
    assert.deepEqual(checkStory(story), ["Node grass has no label for the left button."]);
  });
});

describe("storyLines", () => {
  it("asks the question with both labels", () => {
    const grass = smallStory().nodes.find((node) => node.id === "grass");
    if (!grass) throw new Error("fixture changed");
    assert.equal(storyLines(grass, 2).question, "Press left to head for the lake. Press right to throw a rock.");
  });

  it("ends an ending with its number out of the total", () => {
    const story = smallStory();
    const [lake, golden] = ["lake", "catch"].map((id) => story.nodes.find((node) => node.id === id));
    if (!lake || !golden) throw new Error("fixture changed");
    assert.equal(
      storyLines(lake, 2).narration,
      "A Psyduck splashes you. This ending is called Wet socks. You found ending 1 of 2.",
    );
    assert.equal(
      storyLines(golden, 2).narration,
      "You catch Chansey. This is a golden ending: Lucky catch. You found ending 2 of 2.",
    );
  });
});
