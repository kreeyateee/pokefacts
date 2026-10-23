import assert from "node:assert/strict";
import { test } from "node:test";

import { daySeed, planDexIds, planEpisode, type PlanInput, type SavedTake } from "@/lib/radio/radio-plan";
import type { RadioKind } from "@/lib/radio/radio-scripts";

const LILY = "lily";
const GEORGE = "george";

/** Saved takes by Pokémon and kind. */
function library(rows: Array<[number, RadioKind, string]>): PlanInput["takes"] {
  return (dexId, kind) =>
    rows
      .filter(([id, rowKind]) => id === dexId && rowKind === kind)
      .map(([id, rowKind, voiceId]): SavedTake => ({ voiceId, file: `${id}-${rowKind}-${voiceId}.mp3` }));
}

const rows: Array<[number, RadioKind, string]> = [
  [1, "entry", LILY],
  [4, "entry", GEORGE],
  [7, "entry", LILY],
  [25, "clues", LILY],
  [25, "answer", LILY],
  [133, "clues", GEORGE],
  [133, "answer", LILY],
  [54, "joke", GEORGE],
];

const base: PlanInput = { date: "2026-10-25", dexIds: [1, 4, 7, 25, 54, 133], takes: library(rows), hostVoices: [] };

test("the same day always plans the same episode", () => {
  assert.deepEqual(planEpisode(base), planEpisode(base));
  assert.equal(daySeed("2026-10-25"), 20261025);
});

test("plays a saved fact, a Who's That in one voice, and a joke, all different Pokémon", () => {
  const plan = planEpisode(base);
  assert.ok(plan);
  assert.ok([1, 4, 7].includes(plan.fact.dexId));
  // 133 has its clues and answer in different voices, so only 25 can be the Who's That.
  assert.equal(plan.guess?.clues.dexId, 25);
  assert.equal(plan.guess?.clues.voiceId, plan.guess?.answer.voiceId);
  assert.equal(plan.joke?.dexId, 54);
  assert.equal(new Set(planDexIds(plan)).size, 3);
});

test("has nothing to play until a fact is saved", () => {
  assert.equal(planEpisode({ ...base, takes: library(rows.filter((row) => row[1] !== "entry")) }), null);
});

test("leaves out recent Pokémon while others are left", () => {
  for (let day = 10; day < 20; day += 1) {
    const plan = planEpisode({ ...base, date: `2026-11-${day}`, recent: new Set([1, 4]) });
    assert.equal(plan?.fact.dexId, 7);
  }
  // Everyone heard recently: still an episode.
  assert.ok(planEpisode({ ...base, recent: new Set([1, 4, 7]) })?.fact);
});

test("the host is the fact's voice when it has every line, otherwise another host, otherwise none", () => {
  const lilyFact = { ...base, dexIds: [1, 25, 54] };
  assert.equal(planEpisode({ ...lilyFact, hostVoices: [GEORGE, LILY] })?.host, LILY);
  assert.equal(planEpisode({ ...lilyFact, hostVoices: [GEORGE] })?.host, GEORGE);
  assert.equal(planEpisode(lilyFact)?.host, undefined);
});
