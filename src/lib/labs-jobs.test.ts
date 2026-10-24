import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ffmpegCommand } from "./ffmpeg-bin";
import { dropLabsJobMemory, LABS_ACCOUNT_JOBS, LABS_FORGET_MS, LABS_TRACK_JOBS, LabsJobs } from "./labs-jobs";
import { PIPER_VOICE_ID } from "./piper-voice";
import { renderedAccount } from "./rendered-media";
import type { TrackPart } from "./story/story-voices";
import { lineWatch, recordingNote, stepWait, TRACK_STALL_MS } from "./track-steps";
import { factTrackBody } from "./voice-choice";
import { isRateLimited } from "./yoto-error";
import { YOTO_VOICES } from "./yoto-icons";
import { prepareFactTrack, speechKey, trackStepResponse } from "./yoto-fact-audio";

const TOKEN = "x".repeat(24);
const LILY = YOTO_VOICES.find((voice) => voice.name === "Lily")?.id as string;

/** A one-second tone as an MP3, standing in for a recorded line. */
function tone(frequency: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      [
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${frequency}:duration=1`,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        "-f",
        "mp3",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: 4_000_000, timeout: 20_000 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

type FakeJob = { jobId: string; text: string; status: "processing" | "completed" | "failed"; cardId?: string; gone?: boolean };

/**
 * Yoto Labs and Yoto's library, faked. A job records until the test finishes or fails it. A finished
 * job makes a scratch card, which stays in the library until it is deleted.
 */
function fakeLabs(speech: Buffer) {
  const jobs: FakeJob[] = [];
  const cards = new Map<string, { deleted: boolean }>();
  const calls: string[] = [];
  const uploads: Buffer[] = [];
  let refuse = 0;
  let refuseAfter = Number.POSITIVE_INFINITY;
  let peak = 0;
  const recording = () => jobs.filter((job) => job.status === "processing").length;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.startsWith("https://labs.api.yotoplay.com/content/job?")) {
      calls.push("POST job");
      if (refuse > 0 || jobs.length >= refuseAfter) {
        refuse = Math.max(0, refuse - 1);
        refuseAfter = Number.POSITIVE_INFINITY;
        return Response.json({ error: "Too many requests" }, { status: 429 });
      }
      const body = JSON.parse(String(init?.body)) as { content: { chapters: Array<{ tracks: Array<{ trackUrl: string }> }> } };
      const job: FakeJob = {
        jobId: `job-${String(jobs.length + 1).padStart(4, "0")}`,
        text: body.content.chapters[0]?.tracks[0]?.trackUrl ?? "",
        status: "processing",
      };
      jobs.push(job);
      peak = Math.max(peak, recording());
      return Response.json({ job: { jobId: job.jobId, status: "queued" } });
    }
    const status = /labs\.api\.yotoplay\.com\/content\/job\/([\w-]+)$/.exec(url);
    if (status) {
      calls.push(`GET ${status[1]}`);
      const job = jobs.find((item) => item.jobId === status[1]);
      if (!job || job.gone) return Response.json({ error: "No such job" }, { status: 404 });
      return Response.json({
        job: {
          jobId: job.jobId,
          status: job.status,
          ...(job.cardId ? { result: { cardId: job.cardId } } : {}),
          ...(job.status === "failed" ? { error: "The voice could not read this line." } : {}),
        },
      });
    }
    if (url === "https://api.yotoplay.com/content/mine") {
      calls.push("GET mine");
      const listed = [...cards].filter(([, card]) => !card.deleted).map(([cardId]) => ({ cardId, title: "Pokefacts scratch" }));
      return Response.json({ cards: listed });
    }
    const card = /api\.yotoplay\.com\/content\/(card\d+)/.exec(url);
    if (card) {
      const known = cards.get(card[1] as string);
      if (method === "DELETE") {
        calls.push(`DELETE ${card[1]}`);
        if (!known || known.deleted) return new Response(null, { status: 404 });
        known.deleted = true;
        return new Response(null, { status: 200 });
      }
      if (!known || known.deleted) return Response.json({ error: "No such card" }, { status: 404 });
      return Response.json({
        card: { cardId: card[1], content: { chapters: [{ tracks: [{ trackUrl: `https://cdn.example/${card[1]}.mp3` }] }] } },
      });
    }
    if (url.startsWith("https://cdn.example/")) return new Response(new Uint8Array(speech));
    if (url.includes("/media/transcode/audio/uploadUrl")) {
      return Response.json({ upload: { uploadId: `up-${uploads.length + 1}`, uploadUrl: `https://upload.example/${uploads.length + 1}` } });
    }
    if (url.startsWith("https://upload.example/")) {
      uploads.push(Buffer.from(init?.body as Uint8Array));
      return new Response("ok");
    }
    if (url.includes("/transcoded")) {
      return Response.json({
        transcode: { transcodedSha256: "joinedhash", transcodedInfo: { duration: 5, fileSize: 1, format: "mp3", channels: "mono" } },
      });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };
  return {
    fetchImpl,
    jobs,
    calls,
    uploads,
    peak: () => peak,
    /** These jobs (counted from 1) finish, each with its scratch card. */
    finish(...numbers: number[]) {
      for (const number of numbers) {
        const job = jobs[number - 1] as FakeJob;
        job.status = "completed";
        job.cardId = `card${number}`;
        cards.set(job.cardId, { deleted: false });
      }
    },
    fail(...numbers: number[]) {
      for (const number of numbers) (jobs[number - 1] as FakeJob).status = "failed";
    },
    /** Yoto no longer knows these jobs: asking about them is a 404. */
    forget(...numbers: number[]) {
      for (const number of numbers) (jobs[number - 1] as FakeJob).gone = true;
    },
    /** The next `count` new jobs are answered 429. */
    refuseNext(count: number) {
      refuse = count;
    },
    /** The job asked for once this many have started is answered 429, once. */
    refuseOnceAfter(started: number) {
      refuseAfter = started;
    },
    /** A scratch card left in the library by something earlier, whose job nobody knows. */
    stray(cardId: string) {
      cards.set(cardId, { deleted: false });
    },
    cardsMade: () => cards.size,
    cardsLeft: () => [...cards].filter(([, card]) => !card.deleted).map(([cardId]) => cardId),
    labsCalls: () => calls.filter((call) => call === "POST job" || call.startsWith("GET job")).length,
  };
}

function line(text: string): TrackPart {
  return { text, voiceId: LILY, pitch: 0, tempo: 1, fallback: { voiceId: PIPER_VOICE_ID, pitch: 0, tempo: 1 } };
}

function trackBody(texts: string[], title = "Stop 1", sendId = "stest02") {
  return factTrackBody({ text: texts.join(" "), title, voiceId: LILY, parts: texts.map(line), sendId });
}

async function setting() {
  const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-labs-jobs-"));
  return { dir, roots: { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered") } };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Runs prepareFactTrack with the log captured. */
async function quietly<T>(logged: string[], run: () => Promise<T>): Promise<T> {
  const info = console.info;
  console.info = (text: string) => logged.push(text);
  try {
    return await run();
  } finally {
    console.info = info;
  }
}

describe("recording a track's lines a few at a time", () => {
  it("keeps three of a track's lines recording at once, and starts the next as each finishes", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs(await tone(440));
      const request = trackBody(["One.", "Two.", "Three.", "Four.", "Five."]);
      const step = () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots);
      const logged: string[] = [];

      const first = await quietly(logged, step);
      assert.equal(first.phase, "speech");
      assert.equal(first.recording, LABS_TRACK_JOBS);
      assert.equal(first.linesLeft, 5);
      assert.ok((first.waitMs ?? 0) >= 1_000, "the page waits before it asks again");
      assert.equal(first.speechJobId, "job-0001", "a page from before parallel lines polls the oldest");
      assert.deepEqual(labs.jobs.map((job) => job.text), ["One.", "Two.", "Three."]);

      // Nothing has finished: the next step asks about all three and starts no fourth.
      t.mock.timers.tick(1_500);
      const second = await quietly(logged, step);
      assert.equal(second.phase, "speech");
      assert.equal(labs.jobs.length, 3);
      assert.deepEqual(labs.calls.filter((call) => call.startsWith("GET job")), ["GET job-0001", "GET job-0002", "GET job-0003"]);

      // A step straight after asks Yoto nothing: each job is asked about at most once a second.
      const calls = labs.calls.length;
      await quietly(logged, step);
      assert.equal(labs.calls.length, calls);

      // Two finish: both are saved, their scratch cards deleted, and the last two lines start.
      labs.finish(1, 2);
      t.mock.timers.tick(1_500);
      const third = await quietly(logged, step);
      assert.equal(third.recording, 3);
      assert.equal(third.linesLeft, 3);
      assert.deepEqual(labs.jobs.map((job) => job.text), ["One.", "Two.", "Three.", "Four.", "Five."]);
      assert.deepEqual(labs.cardsLeft(), []);

      labs.finish(3, 4, 5);
      t.mock.timers.tick(1_500);
      const done = await quietly(logged, step);
      assert.equal(done.phase, "ready");
      assert.equal(done.trackUrl, "yoto:#joinedhash");
      assert.equal(labs.peak(), 3, "never more than three at once");
      assert.equal(labs.jobs.length, 5, "each line recorded once");
      assert.equal(labs.cardsMade(), 5);
      assert.deepEqual(labs.cardsLeft(), [], "every scratch card is deleted");
      assert.equal(labs.uploads.length, 1);
      assert.ok(
        logged.some((text) => /send stest02: 1 tracks, 5 new Yoto voice lines, 0 new Piper lines, 0 reused; .*; \d+ s, [\d.]+ s per new line, a Yoto line records in 3\.0 s$/.test(text)),
        logged.join("\n"),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps six going for one account across tracks, still gives each track one, and records a shared line once", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 2_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs(await tone(440));
      const a = trackBody(["A one.", "Both say this.", "A two.", "A three."], "A");
      const b = trackBody(["Both say this.", "B one.", "B two.", "B three."], "B");
      const c = trackBody(["C one.", "C two."], "C");
      const step = (request: ReturnType<typeof trackBody>) => quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));

      assert.equal((await step(a)).recording, 3);
      // B's first line is already recording for A, so B starts two more of its own.
      assert.equal((await step(b)).recording, 3);
      // Six are going for the account. C has none, so it may still start one line.
      const third = await step(c);
      assert.equal(third.recording, 1);
      assert.equal(labs.jobs.length, LABS_ACCOUNT_JOBS);
      assert.deepEqual(labs.jobs.map((job) => job.text), ["A one.", "Both say this.", "A two.", "B one.", "B two.", "C one."]);

      // The shared line finishes. B saves it; A finds it saved and starts nothing while six are going.
      labs.finish(2);
      t.mock.timers.tick(1_500);
      const fourth = await step(b);
      assert.equal(fourth.linesLeft, 3);
      assert.equal(labs.jobs.at(-1)?.text, "B three.", "the account is back under six, so B starts its last line");
      const fifth = await step(a);
      assert.equal(fifth.linesLeft, 3);
      assert.equal(fifth.recording, 2);
      assert.equal(labs.jobs.filter((job) => job.text === "Both say this.").length, 1, "the shared line is recorded once");
      assert.equal(labs.jobs.length, 7);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to Piper when one job fails, and the sweep saves the lines still recording and deletes every scratch card", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 3_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs(await tone(440));
      labs.stray("card90");
      const request = trackBody(["One.", "Two.", "Three.", "Four."], "Stop 1", "stest10");
      const logged: string[] = [];
      const step = (body: object) => quietly(logged, () => prepareFactTrack(TOKEN, body, labs.fetchImpl, roots));

      assert.equal((await step(request)).recording, 3);
      labs.finish(1);
      labs.fail(2);
      t.mock.timers.tick(1_500);
      const failed = await step(request);
      assert.equal(failed.phase, "voice-fallback");
      assert.ok(logged.some((text) => /failed jobs x1.*reading with Piper/.test(text)), logged.join("\n"));
      assert.deepEqual(labs.cardsLeft(), ["card90"], "the finished line was saved and its scratch card deleted");

      // The page sweeps at the end of the send. Line three is still recording, so the library waits.
      const waiting = await step({ sweepScratch: true, settleJobs: true });
      assert.equal(waiting.phase, "discarded");
      assert.equal(waiting.recording, 1);
      assert.ok(!labs.calls.includes("GET mine"), "no library sweep while a line is still recording");

      labs.finish(3);
      t.mock.timers.tick(2_000);
      const swept = await step({ sweepScratch: true, settleJobs: true });
      assert.equal(swept.phase, "discarded");
      assert.equal(swept.recording, undefined);
      assert.ok(labs.calls.includes("GET mine"));
      assert.deepEqual(labs.cardsLeft(), [], "every scratch card is deleted, the stray one too");
      assert.ok(await exists(path.join(roots.speech, `${speechKey("Three.", LILY)}.mp3`)), "line three is kept for the next send");
      assert.equal(labs.jobs.length, 3, "line four was never started, and nothing was recorded twice");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("deletes the scratch cards of a stopped send as its last lines finish, and sweeps at the last round anyway", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 4_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs(await tone(440));
      const step = (body: object) => quietly([], () => prepareFactTrack(TOKEN, body, labs.fetchImpl, roots));
      await step(trackBody(["One.", "Two.", "Three.", "Four."], "Stop 1", "stest11"));
      // The parent taps Cancel. Two lines finish while the sweep waits; one is still recording at its last round.
      assert.equal((await step({ sweepScratch: true, settleJobs: true })).recording, 3);
      labs.finish(1, 2);
      t.mock.timers.tick(2_000);
      assert.equal((await step({ sweepScratch: true, settleJobs: true })).recording, 1);
      assert.deepEqual(labs.cardsLeft(), []);
      t.mock.timers.tick(2_000);
      const last = await step({ sweepScratch: true });
      assert.equal(last.recording, undefined);
      assert.ok(labs.calls.includes("GET mine"));
      // Its card comes later. The next sweep finds the job, saves the line and deletes the card.
      labs.finish(3);
      t.mock.timers.tick(2_000);
      await step({ sweepScratch: true, settleJobs: true });
      assert.deepEqual(labs.cardsLeft(), []);
      for (const text of ["One.", "Two.", "Three."]) {
        assert.ok(await exists(path.join(roots.speech, `${speechKey(text, LILY)}.mp3`)), `${text} is kept`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("waits out a 429 instead of falling back to Piper, and still records each line once", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 5_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs(await tone(440));
      const request = trackBody(["One.", "Two.", "Three.", "Four."], "Stop 1", "stest12");
      const logged: string[] = [];
      const step = () => quietly(logged, () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));

      labs.refuseOnceAfter(2);
      const first = await step();
      assert.equal(first.phase, "speech", "never voice-fallback");
      assert.equal(first.recording, 2);
      assert.ok((first.waitMs ?? 0) >= 2_000, `waits ${first.waitMs} ms`);

      // During the pause the account asks Yoto nothing at all.
      t.mock.timers.tick(500);
      const before = labs.labsCalls();
      const paused = await step();
      assert.equal(paused.phase, "speech");
      assert.equal(labs.labsCalls(), before);

      t.mock.timers.tick(1_600);
      const resumed = await step();
      assert.equal(resumed.recording, 3, "line three starts once the pause is over");
      labs.finish(1, 2, 3);
      t.mock.timers.tick(1_500);
      await step();
      labs.finish(4);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).phase, "ready");
      assert.deepEqual(labs.jobs.map((job) => job.text), ["One.", "Two.", "Three.", "Four."], "the 429 cost no extra recording");
      assert.deepEqual(labs.cardsLeft(), []);
      assert.ok(logged.some((text) => /refused 429 x1, other x0, failed jobs x0/.test(text)));
      assert.ok(logged.every((text) => !/reading with Piper/.test(text)), logged.join("\n"));

      // A 429 on a track's first line leaves nothing of it recording: the page is told to wait, with a 429.
      labs.refuseNext(1);
      const waiting = await quietly(logged, () => prepareFactTrack(TOKEN, trackBody(["Five."], "Stop 2", "stest19"), labs.fetchImpl, roots));
      assert.equal(waiting.phase, "wait");
      const response = trackStepResponse(waiting);
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "2");
      const body = (await response.json()) as { waitMs?: number };
      assert.ok(isRateLimited(response.status, body), "every page waits a 429 out and asks again");
      assert.equal(stepWait(body), 2_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("carries on with the same jobs after a page refresh and after a server restart", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 6_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs(await tone(440));
      const request = trackBody(["One.", "Two.", "Three.", "Four."], "Stop 1", "stest13");
      const step = () => quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));
      assert.equal((await step()).recording, 3);

      // The page is refreshed. It asks for the same track again, remembering no job.
      t.mock.timers.tick(1_500);
      assert.equal((await step()).recording, 3);
      assert.equal(labs.jobs.length, 3, "no line is recorded again");

      // Pokefacts restarts. The jobs are read back from disk, which holds no words and no token.
      const file = path.join(roots.speech, ".labs-jobs", `${renderedAccount(TOKEN)}.json`);
      const saved = await readFile(file, "utf8");
      assert.match(saved, /job-0003/);
      assert.doesNotMatch(saved, /One|Two|Three|Four|x{24}/);
      dropLabsJobMemory();
      labs.finish(1);
      t.mock.timers.tick(1_500);
      const restarted = await step();
      assert.equal(restarted.linesLeft, 3);
      assert.equal(labs.jobs.length, 4, "line four starts, and lines two and three keep their jobs");

      labs.finish(2, 3, 4);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).phase, "ready");
      assert.equal(labs.jobs.length, 4);
      assert.deepEqual(labs.cardsLeft(), []);
      assert.equal(await exists(file), false, "with nothing recording, the file is gone");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the jobs kept for an account", () => {
  it("drops jobs that are too old when it reads them back, and refuses an account that is not a hash", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-labs-file-"));
    try {
      const account = renderedAccount(TOKEN);
      const now = 10_000_000;
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${account}.json`),
        JSON.stringify({
          version: 1,
          jobs: [
            { key: "a".repeat(64), jobId: "job-fresh1", startedAt: now - 60_000 },
            { key: "b".repeat(64), jobId: "job-stale1", startedAt: now - LABS_FORGET_MS - 1 },
            { key: "not a key", jobId: "job-bad001", startedAt: now },
          ],
        }),
      );
      dropLabsJobMemory();
      const jobs = await LabsJobs.open(dir, account, now);
      assert.deepEqual(jobs.list().map((job) => job.jobId), ["job-fresh1"]);
      await assert.rejects(LabsJobs.open(dir, "../../etc/passwd", now));
    } finally {
      dropLabsJobMemory();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("starts a line again when its job is older than Yoto keeps jobs, instead of asking Yoto about it", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 7_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs(await tone(440));
      const step = () => quietly([], () => prepareFactTrack(TOKEN, trackBody(["One."], "Stop 1", "stest14"), labs.fetchImpl, roots));
      assert.equal((await step()).speechJobId, "job-0001");
      // The page was closed. Long after, the parent carries on, and Yoto no longer knows that job.
      labs.forget(1);
      t.mock.timers.tick(LABS_FORGET_MS + 1);
      const later = await step();
      assert.equal(later.phase, "speech", "not voice-fallback");
      assert.equal(later.speechJobId, "job-0002");
      assert.ok(!labs.calls.includes("GET job-0001"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("pauses for Yoto's Retry-After, or longer each time a 429 comes back, and resets once Yoto answers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-labs-pause-"));
    try {
      const jobs = await LabsJobs.open(dir, "c".repeat(32), 0);
      assert.equal(jobs.pause(0), 2_000);
      assert.equal(jobs.pause(2_000), 4_000);
      assert.equal(jobs.pause(6_000, 30_000), 30_000, "Yoto's own Retry-After when it is longer");
      assert.equal(jobs.pausedFor(20_000), 16_000);
      jobs.calm();
      assert.equal(jobs.pause(36_000), 2_000);
      assert.ok(jobs.pause(38_000, 10 * 60_000) <= 2 * 60_000, "never more than two minutes");
    } finally {
      dropLabsJobMemory();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("pacing a track's steps in the page", () => {
  it("waits as long as the server says, within limits", () => {
    assert.equal(stepWait({ waitMs: 1_500 }), 1_500);
    assert.equal(stepWait({ waitMs: 10 * 60_000 }), 60_000);
    assert.equal(stepWait({ waitMs: 0 }), undefined);
    assert.equal(stepWait({ phase: "speech" }), undefined, "a server from before parallel lines: the page polls the job");
    assert.equal(stepWait(null), undefined);
  });

  it("says how many lines are recording, or that Yoto asked for a pause", () => {
    assert.equal(recordingNote(3), "Yoto is recording 3 lines…");
    assert.equal(recordingNote(1), "Yoto is recording this line…");
    assert.equal(recordingNote(0, true), "Yoto asked for a short pause…");
  });

  it("gives up on a try whose lines stop coming in", () => {
    const stalled = lineWatch(0);
    assert.equal(stalled(10, 60_000), false);
    assert.equal(stalled(9, TRACK_STALL_MS), false, "a line came in");
    assert.equal(stalled(9, TRACK_STALL_MS * 2), false);
    assert.equal(stalled(9, TRACK_STALL_MS * 2 + 1), true);
    assert.equal(stalled(undefined, TRACK_STALL_MS * 3), true, "a pause does not count as a line");
  });
});
