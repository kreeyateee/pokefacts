import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { audioDurationSeconds, cryUrl, joinFilter } from "../cry-audio";
import { ffmpegCommand } from "../ffmpeg-bin";
import { YOTO_VOICES } from "../yoto-icons";
import { prepareDemoAudio } from "../yoto-demo";
import { prepareFactTrack } from "../yoto-fact-audio";
import { renderJobs } from "../yoto-send";
import { factTrackBody } from "../voice-choice";
import { SAFARI_CAST } from "./safari";
import { storyCard } from "./story-card";
import type { StoryGraph } from "./story-graph";
import { CATCH_SOUND_PATH } from "./story-sound";
import { castVoices, trackParts, type TrackPart } from "./story-voices";

const [LILY, GEORGE] = YOTO_VOICES.map((voice) => voice.id) as [string, string];

/** A one-second tone as an MP3, standing in for a recorded line. */
function tone(frequency: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      ["-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=1`, "-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "pipe:1"],
      { encoding: "buffer", maxBuffer: 4_000_000, timeout: 20_000 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

/**
 * Yoto Labs and the upload service, faked. Every speech job is completed at once, and its recording
 * is a tone whose pitch says which voice made it.
 */
function fakeYoto(lines: Map<string, Buffer>, cry: Buffer) {
  const jobs: Array<{ voiceId: string; text: string }> = [];
  const uploads: Buffer[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const jobMatch = /labs\.api\.yotoplay\.com\/content\/job\/job-(\d+)/.exec(url);
    if (jobMatch) {
      return Response.json({ job: { jobId: `job-${jobMatch[1]}`, status: "completed", result: { cardId: `card${Number(jobMatch[1])}` } } });
    }
    if (url.startsWith("https://labs.api.yotoplay.com/content/job?")) {
      const voiceId = new URL(url).searchParams.get("voiceId") ?? "";
      const body = JSON.parse(String(init?.body)) as { content: { chapters: Array<{ tracks: Array<{ trackUrl: string }> }> } };
      jobs.push({ voiceId, text: body.content.chapters[0]?.tracks[0]?.trackUrl ?? "" });
      return Response.json({ job: { jobId: `job-${String(jobs.length).padStart(4, "0")}` } });
    }
    const card = /api\.yotoplay\.com\/content\/(card\d+)/.exec(url);
    if (card && init?.method === "DELETE") return new Response(null, { status: 200 });
    if (card) {
      return Response.json({ card: { cardId: card[1], content: { chapters: [{ tracks: [{ trackUrl: `https://cdn.example/${card[1]}.mp3` }] }] } } });
    }
    const audio = /cdn\.example\/card(\d+)\.mp3/.exec(url);
    if (audio) {
      const job = jobs[Number(audio[1]) - 1];
      return new Response(new Uint8Array(lines.get(job?.voiceId ?? "") ?? Buffer.alloc(0)));
    }
    if (url === cryUrl(25)) return new Response(new Uint8Array(cry));
    if (url.includes("/media/transcode/audio/uploadUrl")) {
      return Response.json({ upload: { uploadId: `up-${uploads.length + 1}`, uploadUrl: `https://upload.example/${uploads.length + 1}` } });
    }
    if (url.startsWith("https://upload.example/")) {
      const body = init?.body;
      uploads.push(Buffer.from(body instanceof Uint8Array ? body : new Uint8Array()));
      return new Response("ok");
    }
    if (url.includes("/transcoded")) {
      return Response.json({
        transcode: { transcodedSha256: "joinedhash", transcodedInfo: { duration: 9, fileSize: uploads.at(-1)?.length ?? 1, format: "mp3", channels: "mono" } },
      });
    }
    throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
  };
  return { fetchImpl, jobs, uploads };
}

describe("adventure track audio", () => {
  it("shifts a character's pitch without changing how fast they talk", () => {
    const filter = joinFilter([{ pitch: 0, tempo: 1 }, { pitch: 12, tempo: 1 }, {}]);
    assert.match(filter, /\[1:a\][^;]*asetrate=88200,aresample=44100,atempo=0\.5000/);
    assert.doesNotMatch(filter.split(";")[0] ?? "", /asetrate|atempo/);
    assert.match(filter, /\[p0\]\[p1\]\[p2\]concat=n=3:v=0:a=1\[out\]/);
  });

  it("records each line in its own voice, plays the catch sound, puts the cry first, and uploads one track", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-story-"));
    try {
      const lines = new Map([
        [LILY, await tone(440)],
        [GEORGE, await tone(220)],
      ]);
      const cry = await tone(880);
      const voices = castVoices(LILY, SAFARI_CAST);
      const text = "Barnaby throws. [catch] 'Mine!' he shouts. 'Not for long,' says Marigold.";
      const parts = trackParts(text, voices, SAFARI_CAST) as TrackPart[];
      assert.equal(parts.length, 6);
      const yoto = fakeYoto(lines, cry);
      const roots = { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered"), cries: path.join(dir, "cries") };

      let request = factTrackBody({ text: "Barnaby throws.", title: "Stop 1", dexId: 25, name: "Pikachu", voiceId: LILY, parts });
      const phases: string[] = [];
      for (let step = 0; step < 20; step += 1) {
        const result = await prepareFactTrack("x".repeat(24), request, yoto.fetchImpl, roots);
        phases.push(result.phase);
        if (result.phase === "ready") {
          assert.equal(result.trackUrl, "yoto:#joinedhash");
          break;
        }
        if (result.phase === "speech") {
          assert.ok(result.speechPart, "a speech step says which line it is recording");
          // The browser polls the job, then comes back with its scratch card.
          request = { ...request, speechJobId: result.speechJobId, speechPart: result.speechPart, speechCardId: `card${Number(result.speechJobId?.slice(4))}` };
          continue;
        }
        if (result.phase === "upload") request = { ...request, uploadId: result.uploadId };
      }
      assert.equal(phases.at(-1), "ready");

      // Five spoken lines, each recorded once: Barnaby in George, everyone else on Lily (Marigold shifted lower).
      assert.deepEqual(
        yoto.jobs.map((job) => [job.voiceId, job.text]),
        [
          [LILY, "Barnaby throws."],
          [GEORGE, "Mine!"],
          [LILY, "he shouts."],
          [LILY, "Not for long,"],
          [LILY, "says Marigold."],
        ],
      );
      assert.equal(yoto.uploads.length, 1);
      const seconds = await audioDurationSeconds(yoto.uploads[0] as Buffer);
      const catchSeconds = await audioDurationSeconds(await readFile(path.join(process.cwd(), "public", CATCH_SOUND_PATH)));
      // Cry, five spoken seconds and the catch sound, with small gaps.
      assert.ok(seconds > 1 + 5 + catchSeconds, `the track is ${seconds.toFixed(2)}s`);

      // A second send of the same track is already recorded.
      const again = await prepareFactTrack("x".repeat(24), factTrackBody({ text: "Barnaby throws.", title: "Stop 1", dexId: 25, voiceId: LILY, parts }), yoto.fetchImpl, roots);
      assert.equal(again.phase, "ready");
      assert.equal(yoto.jobs.length, 5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("plays an adventure line on the page in every voice, with the sound", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-story-hear-"));
    try {
      const lines = new Map([
        [LILY, await tone(440)],
        [GEORGE, await tone(220)],
      ]);
      const yoto = fakeYoto(lines, await tone(880));
      const parts = trackParts("[catch] 'Boo,' says Barnaby.", castVoices(LILY, SAFARI_CAST), SAFARI_CAST);
      const result = await prepareDemoAudio(
        "x".repeat(24),
        { text: "Boo, says Barnaby.", voiceId: LILY, parts },
        yoto.fetchImpl,
        { speech: dir, wait: async () => undefined },
      );
      assert.equal(result.cryFirst, false);
      assert.deepEqual(yoto.jobs.map((job) => job.voiceId), [GEORGE, LILY]);
      assert.ok((await audioDurationSeconds(result.audio, "joined.wav")) > 4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sends the lines and voices of each Safari track with its render job", () => {
    const graph: StoryGraph = {
      id: "voices",
      title: "Voices",
      description: "Two voices.",
      start: "a",
      cast: SAFARI_CAST,
      nodes: [
        { id: "a", kind: "scene", title: "A", text: "The ball flies. [catch] 'Well thrown,' says Marigold.", dexId: 25, next: "b" },
        { id: "b", kind: "ending", title: "B", text: "The end.", ending: { number: 1, name: "Done" } },
      ],
    };
    const { card, upload } = storyCard(graph, { voiceId: LILY });
    const jobs = renderJobs("Voices", card, upload);
    const first = jobs.find((job) => job.key === "aa");
    assert.equal(first?.dexId, 25);
    assert.match(first?.text ?? "", /^The ball flies\. 'Well thrown,' says Marigold\.$/);
    assert.doesNotMatch(first?.text ?? "", /\[catch\]/, "the cue is never read out");
    assert.deepEqual(
      first?.parts?.map((part) => ("sound" in part ? part.sound : part.voiceId)),
      [LILY, "catch", LILY, LILY],
    );
    assert.ok(first?.parts?.some((part) => "pitch" in part && part.pitch < 0), "Marigold is lower");
    assert.equal(jobs.find((job) => job.key === "ba")?.parts, undefined, "a plain line records as before");
    assert.deepEqual(factTrackBody({ text: "x", title: "y", parts: first?.parts }).parts, first?.parts);
  });
});
