import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";
import { pronounce } from "@/lib/pronounce";
import type { StoryGraph, StoryIcon, StoryNode, StoryNodeId } from "@/lib/story/story-graph";
import { isStoryAmbience, isStoryMusic, isStorySound, SOUND_CUE, withoutCues } from "@/lib/story/story-sound";
import { storyChunks } from "@/lib/story/story-voices";

/** Yoto reads at most this many characters of text to speech on one track. */
export const STORY_TEXT_LIMIT = 3000;

/** Highest national Pokédex number with a cry. */
const LAST_DEX_ID = 1025;

const NODE_ID = /^[a-z0-9]{1,8}$/;

/** Tracks a node becomes: a choice is its narration plus the repeating question. */
export function nodeTrackCount(node: StoryNode): number {
  return node.kind === "choice" ? 2 : 1;
}

/** Tracks the whole story needs on the card. */
export function storyTrackCount(graph: StoryGraph): number {
  return graph.nodes.reduce((sum, node) => sum + nodeTrackCount(node), 0);
}

export function endingCount(graph: StoryGraph): number {
  return graph.nodes.filter((node) => node.kind === "ending").length;
}

/** Nodes this one can lead to. */
export function nodeTargets(node: StoryNode): StoryNodeId[] {
  if (node.kind === "scene") return [node.next];
  if (node.kind === "choice") return [node.left.to, node.right.to];
  return [];
}

/** Said at the end of every ending, just before the card goes back to the start. */
export const ENDING_RESTART = "Now the adventure starts again from the beginning.";

/**
 * What a node says. An ending adds its number out of the total, says when it is golden, and says the
 * adventure is starting again.
 * A choice adds the question that repeats until a button is pressed.
 */
export function storyLines(node: StoryNode, endings: number): { narration: string; question?: string } {
  const text = node.text.replace(/\s+/g, " ").trim();
  if (node.kind === "choice") {
    return {
      narration: text,
      question: `Press left to ${node.left.label.trim()}. Press right to ${node.right.label.trim()}.`,
    };
  }
  if (node.kind === "ending") {
    const { number, name, golden } = node.ending;
    const called = golden ? `This is a golden ending: ${name.trim()}.` : `This ending is called ${name.trim()}.`;
    return { narration: `${text} ${called} You found ending ${number} of ${endings}. ${ENDING_RESTART}` };
  }
  return { narration: text };
}

function validDexId(id: number | undefined): boolean {
  return id === undefined || (Number.isInteger(id) && id >= 1 && id <= LAST_DEX_ID);
}

function iconDexId(icon: StoryIcon | undefined): number | undefined {
  return icon && "dexId" in icon ? icon.dexId : undefined;
}

/** Every node reachable by following `step` from `from`. */
function walk(from: StoryNodeId[], step: (id: StoryNodeId) => StoryNodeId[]): Set<StoryNodeId> {
  const seen = new Set<StoryNodeId>();
  const queue = [...from];
  while (queue.length > 0) {
    const id = queue.shift() as StoryNodeId;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...step(id));
  }
  return seen;
}

function nodeProblems(node: StoryNode, endings: number): string[] {
  const problems: string[] = [];
  const name = `Node ${node.id}`;
  if (!node.title?.trim()) problems.push(`${name} has no title.`);
  if (!node.text?.trim()) {
    problems.push(`${name} has no narration.`);
  } else {
    const lines = storyLines(node, endings);
    const spoken = pronounce(withoutCues(lines.narration)).length;
    if (spoken > STORY_TEXT_LIMIT) {
      problems.push(`${name} narration is ${spoken} characters. Yoto reads at most ${STORY_TEXT_LIMIT}.`);
    }
    if (lines.question && pronounce(lines.question).length > STORY_TEXT_LIMIT) {
      problems.push(`${name} question is longer than Yoto reads.`);
    }
    for (const match of node.text.matchAll(SOUND_CUE)) {
      if (!isStorySound(match[1])) problems.push(`${name} plays [${match[1]}], which is not a story sound.`);
    }
    if (node.bed?.ambience && !isStoryAmbience(node.bed.ambience)) problems.push(`${name} has an unknown ambience.`);
    if (node.bed?.music && !isStoryMusic(node.bed.music)) problems.push(`${name} has unknown music.`);
    try {
      storyChunks(node.text);
    } catch {
      problems.push(`${name} opens a quote and never closes it.`);
    }
  }
  if (node.kind === "choice") {
    if (!node.left.label?.trim()) problems.push(`${name} has no label for the left button.`);
    if (!node.right.label?.trim()) problems.push(`${name} has no label for the right button.`);
  }
  if (!validDexId(node.dexId)) problems.push(`${name} plays cry ${node.dexId}, which is not in the national Pokédex.`);
  for (const icon of [node.icon, node.kind === "choice" ? node.questionIcon : undefined]) {
    if (!validDexId(iconDexId(icon))) {
      problems.push(`${name} shows Pokémon ${iconDexId(icon)}, which is not in the national Pokédex.`);
    }
  }
  return problems;
}

function endingProblems(graph: StoryGraph): string[] {
  const endings = graph.nodes.filter((node) => node.kind === "ending");
  if (endings.length === 0) return ["The story has no ending."];
  const problems: string[] = [];
  const total = endings.length;
  const seen = new Map<number, StoryNodeId>();
  for (const node of endings) {
    const number = node.ending.number;
    if (!Number.isInteger(number) || number < 1 || number > total) {
      problems.push(`Node ${node.id} is ending ${number}, but the ${total} endings must be numbered 1 to ${total}.`);
      continue;
    }
    const other = seen.get(number);
    if (other) problems.push(`Nodes ${other} and ${node.id} are both ending ${number}.`);
    else seen.set(number, node.id);
    if (!node.ending.name?.trim()) problems.push(`Node ${node.id} has no ending name.`);
  }
  for (let number = 1; number <= total; number += 1) {
    if (!seen.has(number)) problems.push(`No node is ending ${number}.`);
  }
  return problems;
}

/** Plain-English problems that would stop this story working on a Yoto card. Empty when it is ready. */
export function checkStory(graph: StoryGraph): string[] {
  const problems: string[] = [];
  const nodes = graph.nodes ?? [];
  if (nodes.length === 0) return ["The story has no nodes."];

  const byId = new Map<StoryNodeId, StoryNode>();
  for (const node of nodes) {
    if (!NODE_ID.test(node.id)) {
      problems.push(`Node id "${node.id}" must be 1 to 8 lowercase letters or digits.`);
    }
    if (byId.has(node.id)) problems.push(`Node id ${node.id} is used twice.`);
    else byId.set(node.id, node);
  }
  if (!byId.has(graph.start)) problems.push(`The start node ${graph.start} is not in the story.`);

  for (const node of nodes) {
    for (const target of nodeTargets(node)) {
      if (!byId.has(target)) problems.push(`Node ${node.id} goes to ${target}, which is not in the story.`);
    }
  }

  const next = (id: StoryNodeId) => {
    const node = byId.get(id);
    return node ? nodeTargets(node).filter((target) => byId.has(target)) : [];
  };
  if (byId.has(graph.start)) {
    const reached = walk([graph.start], next);
    for (const node of byId.values()) {
      if (!reached.has(node.id)) problems.push(`Node ${node.id} cannot be reached from the start.`);
    }
  }

  const leadsHere = new Map<StoryNodeId, StoryNodeId[]>();
  for (const node of byId.values()) {
    for (const target of next(node.id)) leadsHere.set(target, [...(leadsHere.get(target) ?? []), node.id]);
  }
  const endingIds = nodes.filter((node) => node.kind === "ending").map((node) => node.id);
  const canEnd = walk(endingIds, (id) => leadsHere.get(id) ?? []);
  for (const node of byId.values()) {
    if (!canEnd.has(node.id)) {
      problems.push(`Node ${node.id} never reaches an ending, so a child would be stuck in a loop.`);
    }
  }

  problems.push(...endingProblems(graph));
  const endings = endingCount(graph);
  for (const node of nodes) problems.push(...nodeProblems(node, endings));

  const tracks = storyTrackCount(graph);
  if (tracks > YOTO_TRACK_LIMIT) {
    problems.push(`The story needs ${tracks} tracks. A Yoto card holds ${YOTO_TRACK_LIMIT}.`);
  }
  return problems;
}
