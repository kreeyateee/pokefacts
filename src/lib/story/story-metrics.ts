import { endingCount, storyLines } from "@/lib/story/story-check";
import type { StoryGraph, StoryNode, StoryNodeId } from "@/lib/story/story-graph";
import { withoutCues } from "@/lib/story/story-sound";
import { withoutVoiceTags } from "@/lib/voice-tags";

/**
 * How an adventure plays for a child, measured on its script. Engagement comes down to a few numbers:
 * how soon the first button press comes, the longest the child listens without one, how long a
 * playthrough lasts, and whether every ending can really be reached. Times assume a calm reading
 * for children; sounds and cries add a little on top.
 */
export const READ_WORDS_PER_SECOND = 2.4;

/** The targets the adventures are written to. */
export const PACING_TARGETS = {
  /** Seconds from pressing play to the first question. */
  firstChoice: 45,
  /** Seconds of listening between one button press and the next question. */
  betweenChoices: 60,
  /** Seconds from the last button press to the end of an ending. */
  finale: 90,
} as const;

/** Seconds a node's narration takes to read, without its repeating question. */
export function narrationSeconds(node: StoryNode, endings: number): number {
  const words = withoutVoiceTags(withoutCues(storyLines(node, endings).narration))
    .split(/\s+/)
    .filter(Boolean).length;
  return words / READ_WORDS_PER_SECOND;
}

/** A run of narration with no button press: where it starts, the nodes it plays, and how long it is. */
export type ListeningRun = { from: StoryNodeId; nodes: StoryNodeId[]; seconds: number; endsInEnding: boolean };

/**
 * Every stretch a child listens to without pressing a button: from the start, and from each place a
 * button press lands, through the scenes that follow, to the next question or ending. Longest first.
 */
export function listeningRuns(graph: StoryGraph): ListeningRun[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const endings = endingCount(graph);
  const heads = new Set<StoryNodeId>([graph.start]);
  for (const node of graph.nodes) {
    if (node.kind === "choice") {
      heads.add(node.left.to);
      heads.add(node.right.to);
    }
  }
  const runs: ListeningRun[] = [];
  for (const from of heads) {
    const nodes: StoryNodeId[] = [];
    let seconds = 0;
    let at: StoryNode | undefined = byId.get(from);
    while (at && nodes.length <= graph.nodes.length) {
      nodes.push(at.id);
      seconds += narrationSeconds(at, endings);
      if (at.kind !== "scene") break;
      at = byId.get(at.next);
    }
    runs.push({ from, nodes, seconds, endsInEnding: at?.kind === "ending" });
  }
  return runs.sort((a, b) => b.seconds - a.seconds);
}

/** Seconds from pressing play to the first question. */
export function secondsToFirstChoice(graph: StoryGraph): number {
  return listeningRuns(graph).find((run) => run.from === graph.start)?.seconds ?? 0;
}

/** A small seeded random number source, so the same story always measures the same. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export type PlaythroughStats = {
  /** Share of playthroughs reaching each ending, by ending number. */
  endings: Record<number, number>;
  /** Median and 90th-percentile minutes of narration in a playthrough. */
  minutes: { median: number; p90: number };
  /** Median button presses in a playthrough. */
  choices: number;
};

function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

/**
 * Plays the story many times pressing left or right at random, as a young child often does. A story
 * where some endings are almost never reached by random presses needs clearer hints or kinder odds.
 */
export function randomPlaythroughs(graph: StoryGraph, plays = 2000, seed = 1): PlaythroughStats {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const endingsTotal = endingCount(graph);
  const random = seeded(seed);
  const reached: Record<number, number> = {};
  const minutes: number[] = [];
  const presses: number[] = [];
  for (let play = 0; play < plays; play += 1) {
    let at = byId.get(graph.start);
    let seconds = 0;
    let choices = 0;
    for (let step = 0; at && step < graph.nodes.length * 4; step += 1) {
      seconds += narrationSeconds(at, endingsTotal);
      if (at.kind === "ending") {
        reached[at.ending.number] = (reached[at.ending.number] ?? 0) + 1;
        break;
      }
      if (at.kind === "choice") {
        choices += 1;
        at = byId.get(random() < 0.5 ? at.left.to : at.right.to);
      } else {
        at = byId.get(at.next);
      }
    }
    minutes.push(seconds / 60);
    presses.push(choices);
  }
  const endings: Record<number, number> = {};
  for (let number = 1; number <= endingsTotal; number += 1) endings[number] = (reached[number] ?? 0) / plays;
  return { endings, minutes: { median: percentile(minutes, 0.5), p90: percentile(minutes, 0.9) }, choices: percentile(presses, 0.5) };
}

/** Plain-English pacing problems against PACING_TARGETS. Empty when the story keeps a child with it. */
export function pacingProblems(graph: StoryGraph): string[] {
  const problems: string[] = [];
  const first = secondsToFirstChoice(graph);
  if (first > PACING_TARGETS.firstChoice) {
    problems.push(`The first question comes after ${Math.round(first)} seconds (aim for ${PACING_TARGETS.firstChoice}).`);
  }
  for (const run of listeningRuns(graph)) {
    if (run.from === graph.start) continue;
    const limit = run.endsInEnding ? PACING_TARGETS.finale : PACING_TARGETS.betweenChoices;
    if (run.seconds > limit) {
      problems.push(`${run.nodes.join(" > ")} plays ${Math.round(run.seconds)} seconds without a choice (aim for ${limit}).`);
    }
  }
  return problems;
}
