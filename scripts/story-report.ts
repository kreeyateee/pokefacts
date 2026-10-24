/**
 * How each adventure plays and records, measured over many sends:
 *
 *   npx tsx scripts/story-report.ts            all four adventures
 *   npx tsx scripts/story-report.ts safari     one of them
 *
 * Pacing comes from story-metrics.ts and is checked against PACING_TARGETS. "New lines per send" is
 * how many lines a send still has to record in one voice once earlier sends have recorded theirs:
 * the lower, the faster a send finishes.
 */
import { partnerFor, type AdventureInput } from "../src/lib/story/adventure-route";
import { gymAdventure } from "../src/lib/story/gym";
import { islandAdventure } from "../src/lib/story/island";
import { lostAdventure } from "../src/lib/story/lost";
import { paldeaAdventure } from "../src/lib/story/paldea";
import { playAdventure } from "../src/lib/story/play";
import { safariAdventure } from "../src/lib/story/safari";
import { storyCard } from "../src/lib/story/story-card";
import { storyTrackCount } from "../src/lib/story/story-check";
import type { StoryGraph } from "../src/lib/story/story-graph";
import {
  listeningRuns,
  pacingProblems,
  PACING_TARGETS,
  randomPlaythroughs,
  secondsToFirstChoice,
} from "../src/lib/story/story-metrics";

const ADVENTURES: Record<string, (input: AdventureInput) => StoryGraph> = {
  safari: safariAdventure,
  gym: gymAdventure,
  island: islandAdventure,
  paldea: paldeaAdventure,
  lost: lostAdventure,
  play: playAdventure,
};
const SENDS = 40;
const OWNERS = ["", "Mia", "Oliver", "Ava", "Leo"];
const PARTNERS = [undefined, 25, 133, 1, 7, 4, 39, 52];
const LILY = "pFZP5JQG7iQjIQuC4Bku";

const seconds = (value: number) => `${Math.round(value)}s`;
const share = (value: number) => `${Math.round(value * 100)}%`;
const worst = (values: number[]) => Math.max(...values);

function report(name: string, build: (input: AdventureInput) => StoryGraph) {
  const first: number[] = [];
  const between: number[] = [];
  const finale: number[] = [];
  const tracks: number[] = [];
  const minutes: number[] = [];
  const choices: number[] = [];
  const endingShares = new Map<number, number[]>();
  const problems = new Map<string, number>();
  const recorded = new Set<string>();
  const fresh: number[] = [];
  for (let send = 0; send < SENDS; send += 1) {
    const graph = build({
      seed: 7000 + send * 104_729,
      owner: OWNERS[send % OWNERS.length] || undefined,
      partner: partnerFor(PARTNERS[send % PARTNERS.length]),
    });
    first.push(secondsToFirstChoice(graph));
    const runs = listeningRuns(graph).filter((run) => run.from !== graph.start);
    between.push(Math.max(0, ...runs.filter((run) => !run.endsInEnding).map((run) => run.seconds)));
    finale.push(Math.max(0, ...runs.filter((run) => run.endsInEnding).map((run) => run.seconds)));
    tracks.push(storyTrackCount(graph));
    const plays = randomPlaythroughs(graph, 600, send + 1);
    minutes.push(plays.minutes.median);
    choices.push(plays.choices);
    for (const [number, part] of Object.entries(plays.endings)) {
      endingShares.set(Number(number), [...(endingShares.get(Number(number)) ?? []), part]);
    }
    for (const problem of pacingProblems(graph)) {
      const kind = problem.replace(/\d+/g, "#");
      problems.set(kind, (problems.get(kind) ?? 0) + 1);
    }
    let newLines = 0;
    for (const chapter of storyCard(graph, { voiceId: LILY }).card.chapters) {
      for (const track of chapter.tracks) {
        for (const part of track.parts ?? []) {
          if (!("text" in part)) continue;
          const key = `${part.voiceId}\n${part.text}`;
          if (!recorded.has(key)) newLines += 1;
          recorded.add(key);
        }
      }
    }
    fresh.push(newLines);
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  console.log(`\n${name}`);
  console.log(`  first question      ${seconds(mean(first))} (aim ${PACING_TARGETS.firstChoice}s)`);
  console.log(`  longest wait        ${seconds(worst(between))} between choices (aim ${PACING_TARGETS.betweenChoices}s), ${seconds(worst(finale))} into an ending (aim ${PACING_TARGETS.finale}s)`);
  console.log(`  playthrough         ${mean(minutes).toFixed(1)} minutes, ${Math.round(mean(choices))} button presses`);
  console.log(
    `  endings by random   ${[...endingShares.entries()].sort((a, b) => a[0] - b[0]).map(([number, parts]) => `${number}: ${share(mean(parts))}`).join("  ")}`,
  );
  console.log(`  tracks              ${worst(tracks)} of 100`);
  console.log(`  new lines per send  first ${fresh[0]}, then about ${Math.round(mean(fresh.slice(-10)))} once earlier sends are recorded`);
  if (problems.size > 0) {
    console.log("  pacing problems (sends with it):");
    for (const [problem, count] of [...problems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    ${count}x ${problem}`);
    }
  }
}

const pick = process.argv[2];
for (const [name, build] of Object.entries(ADVENTURES)) {
  if (!pick || pick === name) report(name, build);
}
