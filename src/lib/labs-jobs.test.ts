import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ffmpegCommand } from "./ffmpeg-bin";
import { dropLabsJobMemory, LABS_ACCOUNT_JOBS, LABS_FORGET_MS, LABS_LINES_PER_JOB, LabsJobs } from "./labs-jobs";
import { PIPER_VOICE_ID } from "./piper-voice";
import { renderedAccount } from "./rendered-media";
import { partKey, type TrackPart } from "./story/story-voices";
import { lineWatch, recordingNote, stepWait, TRACK_STALL_MS } from "./track-steps";
import { factTrackBody } from "./voice-choice";
import { isRateLimited } from "./yoto-error";
import { YOTO_VOICES } from "./yoto-icons";
import { prepareFactTrack, speechKey, trackStepResponse } from "./yoto-fact-audio";

const TOKEN = "x".repeat(24);
const voice = (name: string) => YOTO_VOICES.find((item) => item.name === name)?.id as string;
const [LILY, ALICE, LIAM] = ["Lily", "Alice", "Liam"].map(voice) as [string, string, string];

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

type FakeJob = {
  jobId: string;
  voiceId: string;
  tracks: Array<{ key: string; text: string }>;
  status: "processing" | "completed" | "failed";
  cardId?: string;
  gone?: boolean;
};

/**
 * Yoto Labs and Yoto's library, faked. A job records until the test finishes or fails it. A finished job
 * makes a scratch card with one recording per track, and each line sounds different, so a recording kept
 * for the wrong line shows. The card stays in the library until it is deleted.
 */
function fakeLabs() {
  const jobs: FakeJob[] = [];
  const cards = new Map<string, { job?: FakeJob; deleted: boolean }>();
  const calls: string[] = [];
  const uploads: Buffer[] = [];
  const audio = new Map<string, Promise<Buffer>>();
  const broken = new Set<string>();
  let oneRecording = false;
  let reversed = false;
  let refuse = 0;
  let refuseAfter = Number.POSITIVE_INFINITY;
  const audioFor = (text: string) => {
    let made = audio.get(text);
    if (!made) {
      made = tone(220 + 30 * audio.size);
      audio.set(text, made);
    }
    return made;
  };
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
      const body = JSON.parse(String(init?.body)) as {
        content: { chapters: Array<{ tracks: Array<{ key: string; trackUrl: string; voiceId: string }> }> };
      };
      const voiceId = new URL(url).searchParams.get("voiceId") ?? "";
      const tracks = body.content.chapters.flatMap((chapter) => chapter.tracks);
      assert.ok(tracks.every((track) => track.voiceId === voiceId), "one voice to a job");
      const job: FakeJob = {
        jobId: `job-${String(jobs.length + 1).padStart(4, "0")}`,
        voiceId,
        tracks: tracks.map((track) => ({ key: track.key, text: track.trackUrl })),
        status: "processing",
      };
      jobs.push(job);
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
      calls.push(`GET ${card[1]}`);
      if (!known?.job || known.deleted) return Response.json({ error: "No such card" }, { status: 404 });
      const chapters = (oneRecording ? known.job.tracks.slice(0, 1) : known.job.tracks).map((track, index) => ({
        key: `line-${index + 1}`,
        tracks: [{ key: track.key, trackUrl: `https://cdn.example/${card[1]}/${track.key}.mp3` }],
      }));
      if (reversed) chapters.reverse();
      return Response.json({ card: { cardId: card[1], content: { chapters } } });
    }
    const download = /^https:\/\/cdn\.example\/(card\d+)\/([\w-]+)\.mp3$/.exec(url);
    if (download) {
      const job = cards.get(download[1] as string)?.job;
      const text = job?.tracks.find((track) => track.key === download[2])?.text ?? "";
      if (broken.has(text)) return new Response("gone", { status: 503 });
      return new Response(new Uint8Array(await audioFor(text)));
    }
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
    audioFor,
    texts: (number: number) => (jobs[number - 1] as FakeJob).tracks.map((track) => track.text),
    /** These jobs (counted from 1) finish, each with its scratch card. */
    finish(...numbers: number[]) {
      for (const number of numbers) {
        const job = jobs[number - 1] as FakeJob;
        job.status = "completed";
        job.cardId = `card${number}`;
        cards.set(job.cardId, { job, deleted: false });
      }
    },
    fail(...numbers: number[]) {
      for (const number of numbers) (jobs[number - 1] as FakeJob).status = "failed";
    },
    /** Yoto no longer knows these jobs: asking about them is a 404. */
    forget(...numbers: number[]) {
      for (const number of numbers) (jobs[number - 1] as FakeJob).gone = true;
    },
    /** This line's recording will not download, or, with `broke` false, will again. */
    breakDownload(text: string, broke = true) {
      if (broke) broken.add(text);
      else broken.delete(text);
    },
    /** Every scratch card comes back with only its first line's recording. */
    oneRecordingPerCard() {
      oneRecording = true;
    },
    /** Scratch cards come back with their chapters the other way round. */
    reverseCards() {
      reversed = true;
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

type Line = [voiceId: string, text: string];

function part([voiceId, text]: Line): TrackPart {
  return { text, voiceId, pitch: 0, tempo: 1, fallback: { voiceId: PIPER_VOICE_ID, pitch: 0, tempo: 1 } };
}

function trackBody(lines: Line[], title: string, sendId: string) {
  return factTrackBody({
    text: lines.map(([, text]) => text).join(" "),
    title,
    voiceId: LILY,
    parts: lines.map(part),
    sendId,
  });
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

/** Runs one step with the log captured. */
async function quietly<T>(logged: string[], run: () => Promise<T>): Promise<T> {
  const info = console.info;
  console.info = (text: string) => logged.push(text);
  try {
    return await run();
  } finally {
    console.info = info;
  }
}

function speechFile(roots: { speech: string }, [voiceId, text]: Line): string {
  return path.join(roots.speech, `${speechKey(text, voiceId)}.mp3`);
}

describe("recording a track's lines a voice at a time", () => {
  it("records a track's lines in one job per voice, and keeps each line from its own track of the scratch card", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const lines: Line[] = [
        [LILY, "One."],
        [ALICE, "Hello."],
        [LILY, "Two."],
        [LIAM, "Bye."],
        [LILY, "Three."],
      ];
      const request = trackBody(lines, "Stop 1", "stest10");
      const logged: string[] = [];
      const step = () => quietly(logged, () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));

      const first = await step();
      assert.equal(first.phase, "speech");
      assert.equal(first.recording, 5, "every line is recording");
      assert.equal(first.linesLeft, 5);
      assert.ok((first.waitMs ?? 0) >= 1_000, "the page waits before it asks again");
      assert.equal(first.speechJobId, "job-0001", "a page from before this polls the oldest job");
      assert.deepEqual(
        labs.jobs.map((job) => [job.voiceId, job.tracks.map((track) => track.text)]),
        [
          [LILY, ["One.", "Two.", "Three."]],
          [ALICE, ["Hello."]],
          [LIAM, ["Bye."]],
        ],
      );
      assert.deepEqual(labs.jobs[0]?.tracks.map((track) => track.key), ["line-1-1", "line-2-1", "line-3-1"]);
      assert.deepEqual(labs.jobs[1]?.tracks.map((track) => track.key), ["line-1"], "one line: the card a line always had");

      // Nothing has finished: the next step asks about each job once, and starts nothing more.
      t.mock.timers.tick(1_500);
      await step();
      assert.equal(labs.jobs.length, 3);
      assert.deepEqual(labs.calls.filter((call) => call.startsWith("GET job")), ["GET job-0001", "GET job-0002", "GET job-0003"]);
      // A step straight after asks Yoto nothing: each job is asked about at most once a second.
      const calls = labs.calls.length;
      await step();
      assert.equal(labs.calls.length, calls);

      // Lily's job finishes. Each of its lines is kept from its own track, found by its key even with the
      // card's chapters the other way round, and the scratch card is deleted.
      labs.reverseCards();
      labs.finish(1);
      t.mock.timers.tick(1_500);
      const third = await step();
      assert.equal(third.linesLeft, 2);
      for (const line of lines.filter(([voiceId]) => voiceId === LILY)) {
        assert.deepEqual(await readFile(speechFile(roots, line)), await labs.audioFor(line[1]), `${line[1]} kept from its own track`);
      }
      assert.deepEqual(labs.cardsLeft(), []);

      labs.finish(2, 3);
      t.mock.timers.tick(1_500);
      const done = await step();
      assert.equal(done.phase, "ready");
      assert.equal(done.trackUrl, "yoto:#joinedhash");
      assert.equal(labs.jobs.length, 3, "three jobs for five lines");
      assert.equal(labs.cardsMade(), 3);
      assert.deepEqual(labs.cardsLeft(), [], "every scratch card is deleted");
      assert.equal(labs.uploads.length, 1);
      assert.ok(
        logged.some((text) =>
          /send stest10: 1 tracks, 5 new Yoto voice lines, 0 new Piper lines, 0 reused; .*; \d+ s, [\d.]+ s per new line, a Yoto line records in 3\.0 s$/.test(
            text,
          ),
        ),
        logged.join("\n"),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("puts at most eight lines of a voice in a job, gives each voice a turn, and keeps three jobs going for a track", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 2_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const lily = Array.from({ length: 20 }, (_, index): Line => [LILY, `Lily line ${index + 1}.`]);
      const request = trackBody([...lily, [ALICE, "Alice line."]], "Stop 1", "stest11");
      const step = () => quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));

      assert.equal((await step()).recording, LABS_LINES_PER_JOB + 1 + LABS_LINES_PER_JOB);
      assert.deepEqual(
        labs.jobs.map((job) => [job.voiceId, job.tracks.length]),
        [
          [LILY, LABS_LINES_PER_JOB],
          [ALICE, 1],
          [LILY, LABS_LINES_PER_JOB],
        ],
        "Alice's one line goes out before Lily's second job, and Lily's last four wait",
      );
      labs.finish(2);
      t.mock.timers.tick(1_500);
      await step();
      assert.deepEqual(labs.texts(4), lily.slice(16).map(([, text]) => text), "once Alice is done, Lily's last four start");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps three jobs going for an account, still gives a track with none one, and records a shared line once", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 3_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const a = trackBody(
        [
          [LILY, "A one."],
          [LILY, "Both say this."],
          [ALICE, "A two."],
          [LIAM, "A three."],
        ],
        "A",
        "stest12",
      );
      const b = trackBody(
        [
          [LILY, "Both say this."],
          [LILY, "B one."],
        ],
        "B",
        "stest12",
      );
      const c = trackBody([[ALICE, "C one."]], "C", "stest12");
      const step = (request: ReturnType<typeof trackBody>) => quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));

      assert.equal((await step(a)).recording, 4);
      assert.equal(labs.jobs.length, LABS_ACCOUNT_JOBS);
      // B's first line is already recording in A's job, and the account has three going: B waits.
      const waiting = await step(b);
      assert.equal(waiting.phase, "speech");
      assert.equal(waiting.speechJobId, "job-0001");
      assert.equal(waiting.recording, 1);
      assert.equal(labs.jobs.length, 3);
      // C has nothing going, so it may start one job even so.
      assert.equal((await step(c)).recording, 1);
      assert.deepEqual(labs.texts(4), ["C one."]);

      // A's Lily job finishes. B keeps both its lines, A's too, and starts its own line.
      labs.finish(1);
      t.mock.timers.tick(1_500);
      assert.equal((await step(b)).linesLeft, 1);
      assert.deepEqual(labs.texts(5), ["B one."]);
      assert.equal((await step(a)).linesLeft, 2, "A finds its Lily lines kept");
      assert.equal(labs.jobs.flatMap((job) => job.tracks).filter((track) => track.text === "Both say this.").length, 1);
      assert.deepEqual(labs.cardsLeft(), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to Piper when a job fails, and the sweep keeps the lines still recording and deletes every scratch card", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 4_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      labs.stray("card90");
      const lines: Line[] = [
        [LILY, "One."],
        [LILY, "Two."],
        [ALICE, "Hi."],
        [LIAM, "Bye."],
      ];
      const logged: string[] = [];
      const step = (body: object) => quietly(logged, () => prepareFactTrack(TOKEN, body, labs.fetchImpl, roots));
      const request = trackBody(lines, "Stop 1", "stest13");

      assert.equal((await step(request)).recording, 4);
      labs.finish(1);
      labs.fail(2);
      t.mock.timers.tick(1_500);
      const failed = await step(request);
      assert.equal(failed.phase, "voice-fallback");
      assert.ok(logged.some((text) => /failed jobs x1.*reading with Piper/.test(text)), logged.join("\n"));
      assert.deepEqual(labs.cardsLeft(), ["card90"], "Lily's lines were kept and their scratch card deleted");

      // The page sweeps at the end of the send. Liam's line is still recording, so the library waits.
      const waiting = await step({ sweepScratch: true, settleJobs: true });
      assert.equal(waiting.phase, "discarded");
      assert.equal(waiting.recording, 1);
      assert.ok(!labs.calls.includes("GET mine"), "no library sweep while a line is still recording");

      labs.finish(3);
      t.mock.timers.tick(2_000);
      const swept = await step({ sweepScratch: true, settleJobs: true });
      assert.equal(swept.recording, undefined);
      assert.ok(labs.calls.includes("GET mine"));
      assert.deepEqual(labs.cardsLeft(), [], "every scratch card is deleted, the stray one too");
      assert.deepEqual(await readFile(speechFile(roots, [LIAM, "Bye."])), await labs.audioFor("Bye."), "Liam's line is kept for the next send");
      assert.equal(labs.jobs.length, 3, "nothing was recorded twice");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("deletes the scratch cards of a stopped send as its jobs finish, and sweeps at the last round anyway", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 5_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const step = (body: object) => quietly([], () => prepareFactTrack(TOKEN, body, labs.fetchImpl, roots));
      const lines: Line[] = [
        [LILY, "One."],
        [ALICE, "Two."],
        [LIAM, "Three."],
      ];
      await step(trackBody(lines, "Stop 1", "stest14"));
      // The parent taps Cancel. Two jobs finish while the sweep waits; one is still going at its last round.
      assert.equal((await step({ sweepScratch: true, settleJobs: true })).recording, 3);
      labs.finish(1, 2);
      t.mock.timers.tick(2_000);
      assert.equal((await step({ sweepScratch: true, settleJobs: true })).recording, 1);
      assert.deepEqual(labs.cardsLeft(), []);
      t.mock.timers.tick(2_000);
      assert.equal((await step({ sweepScratch: true })).recording, undefined);
      assert.ok(labs.calls.includes("GET mine"));
      // Its card comes later. The next sweep finds the job, keeps the line and deletes the card.
      labs.finish(3);
      t.mock.timers.tick(2_000);
      await step({ sweepScratch: true, settleJobs: true });
      assert.deepEqual(labs.cardsLeft(), []);
      for (const line of lines) assert.ok(await exists(speechFile(roots, line)), `${line[1]} is kept`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("waits out a 429 instead of falling back to Piper, and still records each line once", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 6_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const request = trackBody(
        [
          [LILY, "One."],
          [LILY, "Two."],
          [ALICE, "Hi."],
          [LIAM, "Bye."],
        ],
        "Stop 1",
        "stest15",
      );
      const logged: string[] = [];
      const step = () => quietly(logged, () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));

      labs.refuseOnceAfter(2);
      const first = await step();
      assert.equal(first.phase, "speech", "never voice-fallback");
      assert.equal(first.recording, 3, "Lily's two lines and Alice's one");
      assert.ok((first.waitMs ?? 0) >= 2_000, `waits ${first.waitMs} ms`);

      // During the pause the account asks Yoto nothing at all.
      t.mock.timers.tick(500);
      const before = labs.labsCalls();
      assert.equal((await step()).phase, "speech");
      assert.equal(labs.labsCalls(), before);

      t.mock.timers.tick(1_600);
      assert.equal((await step()).recording, 4, "Liam's line starts once the pause is over");
      labs.finish(1, 2, 3);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).phase, "ready");
      assert.deepEqual(
        labs.jobs.map((job) => job.tracks.map((track) => track.text)),
        [["One.", "Two."], ["Hi."], ["Bye."]],
        "the 429 cost no extra recording",
      );
      assert.deepEqual(labs.cardsLeft(), []);
      assert.ok(logged.some((text) => /refused 429 x1, other x0, failed jobs x0/.test(text)));
      assert.ok(logged.every((text) => !/reading with Piper/.test(text)), logged.join("\n"));

      // A 429 on a track's first job leaves nothing of it recording: the page is told to wait, with a 429.
      labs.refuseNext(1);
      const waiting = await quietly(logged, () =>
        prepareFactTrack(TOKEN, trackBody([[LILY, "Five."]], "Stop 2", "stest15"), labs.fetchImpl, roots),
      );
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
    t.mock.timers.enable({ apis: ["Date"], now: 7_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const request = trackBody(
        [
          [LILY, "One."],
          [ALICE, "Two."],
          [LIAM, "Three."],
          [LILY, "Four."],
        ],
        "Stop 1",
        "stest16",
      );
      const step = () => quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));
      assert.equal((await step()).recording, 4);

      // The page is refreshed. It asks for the same track again, remembering no job.
      t.mock.timers.tick(1_500);
      assert.equal((await step()).recording, 4);
      assert.equal(labs.jobs.length, 3, "no line is recorded again");

      // Pokefacts restarts. The jobs are read back from disk, which holds no words and no token.
      const file = path.join(roots.speech, ".labs-jobs", `${renderedAccount(TOKEN)}.json`);
      const saved = await readFile(file, "utf8");
      assert.match(saved, /job-0003/);
      assert.match(saved, /line-2-1/);
      assert.doesNotMatch(saved, /One|Two|Three|Four|x{24}/);
      dropLabsJobMemory();
      labs.finish(1);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).linesLeft, 2);
      assert.equal(labs.jobs.length, 3);

      labs.finish(2, 3);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).phase, "ready");
      assert.equal(labs.jobs.length, 3);
      assert.deepEqual(labs.cardsLeft(), []);
      assert.equal(await exists(file), false, "with nothing recording, the file is gone");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps every line of a job when a page from before this brings back the scratch card it polled", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 8_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const lines: Line[] = [
        [LILY, "One."],
        [LILY, "Two."],
        [ALICE, "Hi."],
      ];
      const request = trackBody(lines, "Stop 1", "stest17");
      const first = await quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));
      assert.equal(first.speechJobId, "job-0001");
      assert.equal(first.speechPart, partKey({ voiceId: LILY, text: "One." }));
      // The old page polls that job itself, then comes back with its scratch card.
      labs.finish(1);
      const back = await quietly([], () =>
        prepareFactTrack(
          TOKEN,
          { ...request, speechJobId: first.speechJobId, speechPart: first.speechPart, speechCardId: "card1" },
          labs.fetchImpl,
          roots,
        ),
      );
      assert.equal(back.phase, "speech");
      assert.equal(back.linesLeft, 1);
      assert.equal(back.speechJobId, "job-0002");
      for (const line of lines.slice(0, 2)) assert.deepEqual(await readFile(speechFile(roots, line)), await labs.audioFor(line[1]));
      assert.equal(labs.calls.filter((call) => call === "DELETE card1").length, 1, "its scratch card is deleted once");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps the lines that download, tries the rest again, and records a line again once its card has failed three times", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 9_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const lines: Line[] = [
        [LILY, "One."],
        [LILY, "Two."],
        [LILY, "Three."],
      ];
      const request = trackBody(lines, "Stop 1", "stest18");
      const step = () => quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));
      await step();
      labs.breakDownload("Two.");
      labs.finish(1);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).linesLeft, 1, "One and Three are kept");
      assert.deepEqual(labs.cardsLeft(), ["card1"], "the card stays while a line on it is still to keep");
      t.mock.timers.tick(1_500);
      await step();
      assert.deepEqual(labs.cardsLeft(), ["card1"]);
      t.mock.timers.tick(1_500);
      const third = await step();
      assert.deepEqual(labs.cardsLeft(), [], "after three tries the card is deleted");
      assert.deepEqual(labs.texts(2), ["Two."], "and the line is recorded again");
      assert.equal(third.speechJobId, "job-0002");
      labs.breakDownload("Two.", false);
      labs.finish(2);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).phase, "ready");
      assert.deepEqual(labs.cardsLeft(), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("a card without a recording for each line", () => {
  it("goes back to one line per job, and says so in the log, so lines are not recorded again for nothing", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 12_000_000 });
    const { dir, roots } = await setting();
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (text: string) => warned.push(text);
    try {
      const labs = fakeLabs();
      labs.oneRecordingPerCard();
      const request = trackBody(
        [
          [LILY, "One."],
          [LILY, "Two."],
          [LILY, "Three."],
        ],
        "Stop 1",
        "stest20",
      );
      const step = () => quietly([], () => prepareFactTrack(TOKEN, request, labs.fetchImpl, roots));
      await step();
      assert.equal(labs.jobs[0]?.tracks.length, 3);
      labs.finish(1);
      // Three tries at the card: One is kept, Two and Three never come back on it.
      for (let round = 0; round < 3; round += 1) {
        t.mock.timers.tick(1_500);
        await step();
      }
      assert.ok(warned.some((text) => /one line per job/.test(text)), warned.join("\n"));
      assert.deepEqual(labs.cardsLeft(), [], "the card is deleted");
      assert.deepEqual(
        labs.jobs.slice(1).map((job) => job.tracks.map((track) => track.text)),
        [["Two."], ["Three."]],
        "Two and Three get a job each",
      );
      labs.finish(2, 3);
      t.mock.timers.tick(1_500);
      assert.equal((await step()).phase, "ready");
      assert.deepEqual(labs.cardsLeft(), []);
    } finally {
      console.warn = warn;
      // As a restart would, so the other tests send lines together again.
      dropLabsJobMemory();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the jobs kept for an account", () => {
  it("drops lines that are too old when it reads them back, and refuses an account that is not a hash", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-labs-file-"));
    try {
      const account = renderedAccount(TOKEN);
      const now = 10_000_000;
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${account}.json`),
        JSON.stringify({
          version: 1,
          lines: [
            { key: "a".repeat(64), jobId: "job-fresh1", track: "line-1-1", startedAt: now - 60_000 },
            { key: "b".repeat(64), jobId: "job-stale1", track: "line-1", startedAt: now - LABS_FORGET_MS - 1 },
            { key: "not a key", jobId: "job-bad001", track: "line-1", startedAt: now },
          ],
        }),
      );
      dropLabsJobMemory();
      const jobs = await LabsJobs.open(dir, account, now);
      assert.deepEqual(
        jobs.list().map((line) => [line.jobId, line.track]),
        [["job-fresh1", "line-1-1"]],
      );
      await assert.rejects(LabsJobs.open(dir, "../../etc/passwd", now));
    } finally {
      dropLabsJobMemory();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("starts a line again when its job is older than Yoto keeps jobs, instead of asking Yoto about it", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 11_000_000 });
    const { dir, roots } = await setting();
    try {
      const labs = fakeLabs();
      const step = () =>
        quietly([], () => prepareFactTrack(TOKEN, trackBody([[LILY, "One."]], "Stop 1", "stest19"), labs.fetchImpl, roots));
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
    assert.equal(stepWait({ phase: "speech" }), undefined, "a server from before this: the page polls the job");
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
