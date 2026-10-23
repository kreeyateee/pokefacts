import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { audioDurationSeconds, bedFilter, clipFilter, cryUrl, joinClips, levelCryGain, mixUnderBed } from "../cry-audio";
import { POST as postIcon } from "../../app/api/yoto/icon/route";
import { ffmpegCommand } from "../ffmpeg-bin";
import { YOTO_VOICES } from "../yoto-icons";
import { prepareDemoAudio } from "../yoto-demo";
import { prepareFactTrack } from "../yoto-fact-audio";
import { renderJobs } from "../yoto-send";
import { factTrackBody } from "../voice-choice";
import { SAFARI_CAST } from "./safari";
import { storyCard } from "./story-card";
import type { StoryGraph } from "./story-graph";
import { bedClips } from "../story-audio";
import { POKEBALL_PIXEL } from "./pokeball";
import { CATCH_SOUND_PATH, readStoryBed, STORY_AMBIENCE, STORY_MUSIC, STORY_SOUNDS } from "./story-sound";
import { PIPER_VOICE_ID } from "../piper-voice";
import { castVoices, fallbackVoices, trackParts, type TrackPart } from "./story-voices";

const voice = (name: string) => YOTO_VOICES.find((item) => item.name === name)?.id as string;
const [LILY, ALICE, LIAM] = ["Lily", "Alice", "Liam"].map(voice) as [string, string, string];
const PIPER = PIPER_VOICE_ID;

/** A one-second tone as an MP3 (or a WAV), standing in for a recorded line. */
function tone(frequency: number, wav = false): Promise<Buffer> {
  const format = wav
    ? ["-c:a", "pcm_s16le", "-ar", "44100", "-ac", "1", "-f", "wav"]
    : ["-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3"];
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      ["-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=1`, ...format, "pipe:1"],
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

/** The samples of a 16-bit mono WAV, from -1 to 1. */
function pcm(wav: Buffer): Float32Array {
  const data = wav.indexOf("data", 12, "ascii");
  const start = data + 8;
  const count = Math.floor((wav.length - start) / 2);
  const out = new Float32Array(count);
  for (let index = 0; index < count; index += 1) out[index] = wav.readInt16LE(start + index * 2) / 32768;
  return out;
}

function rms(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  const first = Math.round(from * 44100);
  const last = Math.round(to * 44100);
  for (let index = first; index < last; index += 1) sum += (samples[index] ?? 0) ** 2;
  return Math.sqrt(sum / Math.max(1, last - first));
}

/** Runs a track through every step, as the browser does, until it is uploaded. */
async function drive(fetchImpl: typeof fetch, roots: Parameters<typeof prepareFactTrack>[3], body: ReturnType<typeof factTrackBody>) {
  let request = body;
  for (let step = 0; step < 40; step += 1) {
    const result = await prepareFactTrack("x".repeat(24), request, fetchImpl, roots);
    if (result.phase === "ready") return result;
    if (result.phase === "speech") {
      request = { ...request, speechJobId: result.speechJobId, speechPart: result.speechPart, speechCardId: `card${Number(result.speechJobId?.slice(4))}` };
    } else if (result.phase === "upload") {
      request = { ...request, uploadId: result.uploadId };
    } else {
      throw new Error(`Stopped at ${result.phase}`);
    }
  }
  throw new Error("The track did not finish.");
}

describe("adventure track audio", () => {
  it("shifts a character's pitch without changing how fast they talk", () => {
    assert.match(clipFilter({ pitch: 12, tempo: 1 }), /asetrate=88200,aresample=44100,atempo=0\.5000$/);
    assert.doesNotMatch(clipFilter({ pitch: 0, tempo: 1 }), /asetrate|atempo/);
    assert.match(clipFilter({ speech: true }), /silenceremove/);
    assert.doesNotMatch(clipFilter({}), /silenceremove/, "a sound effect keeps its own timing");
  });

  it("knows exactly where each clip starts once joined", async () => {
    const one = await tone(440, true);
    const joined = await joinClips([{ audio: one }, { audio: one, tight: true }, { audio: one }]);
    assert.deepEqual(joined.starts, [0, 1.05, 2.27], "a tight clip follows after a breath, the next after a pause");
    assert.ok(Math.abs((await audioDurationSeconds(joined.wav, "joined.wav")) - 3.49) < 0.01);
  });

  it("sets the cry level with the voices, and follows the Settings slider from there", () => {
    assert.equal(levelCryGain(-7, -19, 4, 4), 0.251, "a cry 12 dB too loud comes down by 12 dB");
    assert.equal(levelCryGain(-19, -19, 4, 4), 1);
    assert.equal(levelCryGain(-19, -19, 8, 4), 2, "twice the slider is 6 dB louder");
    assert.equal(levelCryGain(null, -19, 4, 4), 1, "an unmeasurable cry is left as it is");
    assert.equal(levelCryGain(-40, -10, 4, 4), 4, "never more than four times");
  });

  it("records each line in its own voice, plays the catch sound, puts the cry first, and uploads one track", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-story-"));
    try {
      const lines = new Map([
        [LILY, await tone(440)],
        [LIAM, await tone(220)],
        [ALICE, await tone(330)],
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

      // Five spoken lines, each recorded once: Barnaby is Liam, Marigold is Alice, the narrator Lily.
      assert.deepEqual(
        yoto.jobs.map((job) => [job.voiceId, job.text]),
        [
          [LILY, "Barnaby throws."],
          [LIAM, "Mine!"],
          [LILY, "he shouts."],
          [ALICE, "Not for long,"],
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
        [LIAM, await tone(220)],
        [ALICE, await tone(330)],
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
      assert.deepEqual(yoto.jobs.map((job) => job.voiceId), [LIAM, LILY]);
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
      [LILY, "catch", ALICE, LILY],
    );
    assert.ok(first?.parts?.every((part) => !("text" in part) || part.fallback?.voiceId === PIPER), "every line has a Piper fallback");
    const plain = jobs.find((job) => job.key === "ba")?.parts;
    assert.equal(plain?.length, 1, "a plain line is one part, so it is cached and can fall back too");
    assert.deepEqual(factTrackBody({ text: "x", title: "y", parts: first?.parts }).parts, first?.parts);
  });

  it("lays the ambience and music under the words, quieter than the words, with a short tail", async () => {
    // A WAV tone at a normal speaking level, so the bed under it can be measured exactly.
    const speech = await tone(440, true);
    const beds = await bedClips({ ambience: "grass", music: "bright" });
    const mixed = await mixUnderBed(speech, beds);
    const seconds = await audioDurationSeconds(mixed, "mixed.wav");
    assert.ok(seconds > 2 && seconds < 2.6, `the mix is ${seconds.toFixed(2)}s`);
    const voice = pcm(speech);
    const samples = pcm(mixed);
    const words = rms(voice, 0.3, 0.9);
    const underWords = rms(samples.map((value, index) => value - (voice[index] ?? 0)), 0.3, 0.9);
    const between = rms(samples, 1.3, 1.8);
    assert.ok(between > 0.002, "the bed carries on after the words");
    assert.ok(underWords < between * 0.7, `ducked under the words (${underWords.toFixed(4)} against ${between.toFixed(4)})`);
    const db = (value: number) => 20 * Math.log10(value);
    assert.ok(db(words) - db(underWords) > 18, `the bed is ${(db(words) - db(underWords)).toFixed(1)} dB under the words`);
    assert.ok(db(words) - db(between) > 12, `and ${(db(words) - db(between)).toFixed(1)} dB under them between lines`);
    assert.match(bedFilter([{ volume: 0.2 }], 3), /sidechaincompress/);
  });

  it("only accepts beds the story knows", () => {
    assert.deepEqual(readStoryBed({ ambience: "lake", music: "calm" }), { ambience: "lake", music: "calm" });
    assert.equal(readStoryBed({ ambience: "volcano" }), null);
    assert.equal(readStoryBed({}), null);
    assert.equal(readStoryBed("lake"), null);
  });

  it("keeps every sound in one folder, as small, short files", async () => {
    for (const file of [...Object.values(STORY_SOUNDS), ...Object.values(STORY_AMBIENCE), ...Object.values(STORY_MUSIC)]) {
      assert.match(file, /^\/sounds\/[a-z-]+\.mp3$/);
      const bytes = await readFile(path.join(process.cwd(), "public", file));
      assert.ok(bytes.length < 200_000, `${file} is ${bytes.length} bytes`);
      assert.ok((await audioDurationSeconds(bytes)) < 20, `${file} is short`);
    }
  });

  it("uploads the Poké Ball picture for catch tracks", async () => {
    const original = globalThis.fetch;
    let uploaded: Buffer | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.match(String(input), /displayIcons\/user\/me\/upload\?autoConvert=false&filename=pokefacts-pokeball/);
      uploaded = Buffer.from(init?.body as Uint8Array);
      return Response.json({ displayIcon: { mediaId: `yoto:#${"b".repeat(43)}` } });
    }) as typeof fetch;
    try {
      const response = await postIcon(
        new Request("http://localhost/api/yoto/icon?name=pokeball", { method: "POST", headers: { Authorization: `Bearer ${"x".repeat(24)}` } }),
      );
      assert.deepEqual(await response.json(), { mediaId: "b".repeat(43) });
      assert.deepEqual(uploaded, await readFile(path.join(process.cwd(), "public", POKEBALL_PIXEL)));
      assert.equal(uploaded?.subarray(1, 4).toString("ascii"), "PNG");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("records the wording once and only the new name on the next card", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-story-slots-"));
    try {
      const lines = new Map([[LILY, await tone(440)]]);
      const yoto = fakeYoto(lines, await tone(880));
      const roots = { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered") };
      const record = async (name: string) => {
        const parts = trackParts(`Click! It's a ${name}! That's one in the bag.`, castVoices(LILY, SAFARI_CAST), SAFARI_CAST, (w) => w, {
          slots: [name],
        }) as TrackPart[];
        await drive(yoto.fetchImpl, roots, factTrackBody({ text: name, title: "Stop 1", voiceId: LILY, parts }));
      };
      await record("Dodrio");
      assert.deepEqual(yoto.jobs.map((job) => job.text), ["Click! It's a", "Dodrio!", "That's one in the bag."]);
      await record("Ditto");
      assert.deepEqual(yoto.jobs.map((job) => job.text).slice(3), ["Ditto!"], "only the new name is recorded");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("carries on with Piper when Yoto's voices turn a line away, and says so in the log", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-story-fallback-"));
    const logged: string[] = [];
    const info = console.info;
    console.info = (line: string) => logged.push(line);
    try {
      let piperLines = 0;
      const piperWav = await tone(300, true);
      const roots = {
        speech: path.join(dir, "speech"),
        rendered: path.join(dir, "rendered"),
        piper: { bin: "piper", model: "voice", download: false, run: async () => ((piperLines += 1), piperWav) },
      };
      const yoto = fakeYoto(new Map(), await tone(880));
      const refusing: typeof fetch = async (input, init) => {
        if (String(input).startsWith("https://labs.api.yotoplay.com/content/job?")) {
          return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": "0" } });
        }
        return yoto.fetchImpl(input, init);
      };
      const parts = trackParts("'Boo,' says Barnaby.", castVoices(LILY, SAFARI_CAST), SAFARI_CAST, (w) => w, {
        fallback: fallbackVoices(SAFARI_CAST),
      }) as TrackPart[];
      const body = factTrackBody({ text: "Boo", title: "Stop 2", voiceId: LILY, parts, sendId: "stest01" });
      const first = await prepareFactTrack("x".repeat(24), body, refusing, roots);
      assert.equal(first.phase, "voice-fallback");
      assert.equal(piperLines, 0);
      // The browser sends the track again, and every track after it, with fallbackOnly.
      await drive(refusing, roots, { ...body, fallbackOnly: true });
      assert.equal(piperLines, 2, "both lines read by Piper");
      assert.ok(logged.some((line) => /send stest01: .*refused 429 x1.*reading with Piper/.test(line)), logged.join("\n"));
      assert.ok(logged.some((line) => /send stest01: 1 tracks, 0 new Yoto voice lines, 2 new Piper lines, 0 reused/.test(line)));
      assert.ok(logged.every((line) => !/Boo|Barnaby|x{24}/.test(line)), "no words, names or tokens in the log");
    } finally {
      console.info = info;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records a narrator-only scene with a bed as one part, and leaves the repeating question plain", () => {
    const graph: StoryGraph = {
      id: "bed",
      title: "Bed",
      description: "A bed.",
      start: "a",
      nodes: [
        {
          id: "a",
          kind: "choice",
          title: "A",
          text: "The lake is calm.",
          bed: { ambience: "lake", music: "calm" },
          left: { to: "b", label: "go left" },
          right: { to: "b", label: "go right" },
        },
        { id: "b", kind: "ending", title: "B", text: "The end.", ending: { number: 1, name: "Done" } },
      ],
    };
    const { card, upload } = storyCard(graph, { voiceId: LILY });
    const jobs = renderJobs("Bed", card, upload);
    const narration = jobs.find((job) => job.key === "aa");
    assert.deepEqual(narration?.bed, { ambience: "lake", music: "calm" });
    assert.deepEqual(narration?.parts, [
      { text: "The lake is calm.", voiceId: LILY, pitch: 0, tempo: 1, fallback: { voiceId: PIPER, pitch: 0, tempo: 1 } },
    ]);
    assert.equal(jobs.find((job) => job.key === "aq")?.bed, undefined, "the repeating question has no bed");
    assert.deepEqual(factTrackBody({ text: "x", title: "y", parts: narration?.parts, bed: narration?.bed }).bed, narration?.bed);
  });
});
