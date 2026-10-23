import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { POST as postHear } from "../app/api/yoto/hear/route";
import { POST as postJob } from "../app/api/yoto/job/route";
import { POST as postTrack } from "../app/api/yoto/track/route";
import { prepareDemoAudio } from "./yoto-demo";
import { demoHearBody } from "./voice-choice";
import { YOTO_VOICES } from "./yoto-icons";
import { assertCryFirst, audioContainer, audioDurationSeconds, cryLeads, cryUrl, mergeCryFirst, YOTO_MP3_ARGS } from "./cry-audio";
import { ffmpegCommand, ffprobeCommand } from "./ffmpeg-bin";
import { guessUpload, LILY_VOICE_ID, type KidCard } from "./kid-cards";
import { applyFinishedAudio, factsBulkUpload, mapPool, renderJobs, TRACK_POOL_SIZE, trackPoolSize } from "./yoto-send";
import { renderedAccount } from "./rendered-media";
import { attachCry, prepareFactTrack, renderedCacheKey } from "./yoto-fact-audio";

function sine(file: string, frequency = 440): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=1`, "-c:a", "libmp3lame", "-q:a", "5", file],
      { timeout: 20_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

function probeMerged(bytes: Buffer): Promise<{
  codec: string;
  sampleRate: number;
  channels: number;
  bitRate: number;
  duration: number;
  streams: number;
  video: number;
}> {
  return new Promise((resolve, reject) => {
    const dir = path.join(tmpdir(), `champdex-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdir(dir, { recursive: true })
      .then(() => writeFile(path.join(dir, "merged.mp3"), bytes))
      .then(
        () =>
          new Promise<string>((done, fail) => {
            execFile(
              ffprobeCommand(),
              ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", path.join(dir, "merged.mp3")],
              { timeout: 20_000 },
              (error, stdout, stderr) => (error ? fail(new Error(stderr || error.message)) : done(stdout)),
            );
          }),
      )
      .then((stdout) => {
        const parsed = JSON.parse(stdout) as {
          streams?: Array<{ codec_name?: string; codec_type?: string; sample_rate?: string; channels?: number; bit_rate?: string; duration?: string }>;
          format?: { duration?: string; bit_rate?: string; nb_streams?: number };
        };
        const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
        resolve({
          codec: audio?.codec_name ?? "",
          sampleRate: Number(audio?.sample_rate ?? 0),
          channels: Number(audio?.channels ?? 0),
          bitRate: Number(audio?.bit_rate || parsed.format?.bit_rate || 0),
          duration: Number(audio?.duration ?? parsed.format?.duration ?? 0),
          streams: parsed.format?.nb_streams ?? parsed.streams?.length ?? 0,
          video: parsed.streams?.filter((stream) => stream.codec_type === "video").length ?? 0,
        });
      })
      .finally(() => {
        rm(dir, { recursive: true, force: true }).catch(() => undefined);
      })
      .catch(reject);
  });
}

/** Lily's Yoto download is Ogg Opus, even when the file name says mp3. */
function opusReading(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=2", "-c:a", "libopus", "-f", "ogg", file],
      { timeout: 20_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

describe("fact audio", () => {
  it("puts the cry first and keeps the merged file longer than the cry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-fact-"));
    try {
      const cryResponse = await fetch(cryUrl(1));
      assert.equal(cryResponse.ok, true);
      const cry = Buffer.from(await cryResponse.arrayBuffer());
      const speechPath = path.join(dir, "speech.mp3");
      await sine(speechPath);
      const speech = await readFile(speechPath);
      const merged = await mergeCryFirst(cry, speech);
      const cryLength = await audioDurationSeconds(cry, "cry.ogg");
      const mergedLength = await audioDurationSeconds(merged, "merged.mp3");
      assert.ok(mergedLength > cryLength);
      assert.equal(await cryLeads(cry, speech, merged), true);
      await assertCryFirst(cry, speech, merged);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps Meltan's MP3 cry in front of an Opus reading and rejects Lily alone", async () => {
    const response = await fetch(cryUrl(808));
    assert.equal(response.status, 200);
    const cry = Buffer.from(await response.arrayBuffer());
    assert.equal(audioContainer(cry), "mp3");
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-meltan-"));
    try {
      const speechPath = path.join(dir, "speech.ogg");
      await opusReading(speechPath);
      const speech = await readFile(speechPath);
      assert.equal(audioContainer(speech), "ogg");
      const merged = await mergeCryFirst(cry, speech);
      const cryLength = await audioDurationSeconds(cry, "cry.mp3");
      const speechLength = await audioDurationSeconds(speech, "speech.ogg");
      const mergedLength = await audioDurationSeconds(merged, "merged.mp3");
      assert.ok(mergedLength > speechLength);
      assert.ok(mergedLength > cryLength);
      await assertCryFirst(cry, speech, merged);
      await assert.rejects(() => assertCryFirst(cry, speech, speech), /did not start with the cry|not longer than Lily/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sends the merged MP3 to Yoto as an audio track", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-send-"));
    const speechPath = path.join(dir, "speech.mp3");
    await sine(speechPath);
    const speech = await readFile(speechPath);
    const cryResponse = await fetch(cryUrl(1));
    const cry = Buffer.from(await cryResponse.arrayBuffer());
    const bag: { audio?: Buffer } = {};
    let posted = "";
    const card = {
      cardId: "card-1",
      title: "Pokefacts 1",
      metadata: { title: "Pokefacts 1", description: "Facts." },
      content: {
        chapters: [
          {
            key: "start",
            title: "Start here",
            tracks: [
              {
                key: "start-how",
                title: "How to play",
                type: "audio",
                trackUrl: "yoto:#intro",
                overlayLabel: "Go",
                display: { icon16x16: "yoto:#star" },
              },
            ],
          },
          {
            key: "bulbasaur",
            title: "Bulbasaur",
            tracks: [
              {
                key: "bulbasaur-entry",
                title: "Bulbasaur",
                type: "audio",
                trackUrl: "yoto:#speech",
                voiceId: "pFZP5JQG7iQjIQuC4Bku",
                overlayLabel: "1",
                display: { icon16x16: "yoto:#pixel-1" },
              },
            ],
          },
        ],
      },
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/content/card-1") && url.includes("playable=true")) {
        const playable = structuredClone(card);
        const track = playable.content.chapters[1]?.tracks[0];
        if (track) track.trackUrl = "https://cdn.example/speech.mp3";
        return Response.json({ card: playable });
      }
      if (url.includes("/content/card-1")) return Response.json({ card });
      if (url === "https://cdn.example/speech.mp3") {
        return new Response(new Uint8Array(speech), { headers: { "Content-Type": "audio/mpeg" } });
      }
      if (url === cryUrl(1)) {
        return new Response(new Uint8Array(cry), { headers: { "Content-Type": "audio/ogg" } });
      }
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        assert.match(url, /sha256=[a-f0-9]{64}/);
        return Response.json({ upload: { uploadId: "up-1", uploadUrl: "https://upload.example/put" } });
      }
      if (url === "https://upload.example/put") {
        const body = init?.body;
        bag.audio = Buffer.from(body instanceof Uint8Array ? body : new Uint8Array());
        return new Response("ok");
      }
      if (url.includes("/transcoded")) {
        return Response.json({
          transcode: {
            transcodedSha256: "mergedhash",
            transcodedInfo: { duration: 3, fileSize: bag.audio?.length ?? 1, format: "mp3", channels: "mono" },
          },
        });
      }
      if (url === "https://api.yotoplay.com/content" && init?.method === "POST") {
        posted = String(init.body);
        return Response.json({ card: { cardId: "card-1" } });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };

    try {
      const result = await attachCry("x".repeat(24), { cardId: "card-1", chapterKey: "bulbasaur", dexId: 1 }, fetchImpl);
      assert.equal(result.trackUrl, "yoto:#mergedhash");
      const saved = bag.audio;
      assert.ok(saved);
      assert.ok(saved.length > cry.length);
      const payload = JSON.parse(posted) as {
        cardId: string;
        content: { chapters: Array<{ key: string; tracks: Array<{ type: string; trackUrl: string; voiceId?: string }> }> };
      };
      assert.equal(payload.cardId, "card-1");
      assert.equal(payload.content.chapters[0]?.tracks[0]?.trackUrl, "yoto:#intro");
      const fact = payload.content.chapters[1]?.tracks[0];
      assert.equal(fact?.type, "audio");
      assert.equal(fact?.trackUrl, "yoto:#mergedhash");
      assert.equal(fact?.voiceId, undefined);
      const cryLength = await audioDurationSeconds(cry, "cry.ogg");
      const mergedLength = await audioDurationSeconds(saved, "merged.mp3");
      assert.ok(mergedLength > cryLength);
      assert.equal(await cryLeads(cry, speech, saved), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("puts the cry first on a Guess Who clue and on the answer", async () => {
    const clueScript = "Number 1. Three clues. A seed sits on its back. One. Two. Three.";
    const answerScript = "It is Bulbasaur.";
    assert.doesNotMatch(clueScript, /Bulbasaur/i);
    assert.match(answerScript, /^It is Bulbasaur\./);
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-guess-"));
    const speechPath = path.join(dir, "speech.mp3");
    await sine(speechPath);
    const speech = await readFile(speechPath);
    const cryResponse = await fetch(cryUrl(1));
    const cry = Buffer.from(await cryResponse.arrayBuffer());
    const puts: Buffer[] = [];
    let posted = "";
    let transcode = 0;
    const card = {
      cardId: "card-1",
      title: "Guess Who",
      metadata: { title: "Guess Who", description: "Riddles." },
      content: {
        chapters: [
          {
            key: "bulbasaur",
            title: "Riddle 1",
            display: { icon16x16: "yoto:#shadow-1" },
            tracks: [
              {
                key: "bulbasaur-clues",
                title: "Three clues",
                type: "audio",
                trackUrl: "yoto:#clue",
                overlayLabel: "?",
                display: { icon16x16: "yoto:#shadow-1" },
              },
              {
                key: "bulbasaur-answer",
                title: "The answer",
                type: "audio",
                trackUrl: "yoto:#answer",
                overlayLabel: "Yes",
                display: { icon16x16: "yoto:#pixel-1" },
              },
            ],
          },
        ],
      },
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/content/card-1") && url.includes("playable=true")) {
        const playable = structuredClone(card);
        const tracks = playable.content.chapters[0]?.tracks ?? [];
        if (tracks[0]) tracks[0].trackUrl = "https://cdn.example/clue.mp3";
        if (tracks[1]) tracks[1].trackUrl = "https://cdn.example/answer.mp3";
        return Response.json({ card: playable });
      }
      if (url.includes("/content/card-1")) return Response.json({ card });
      if (url === "https://cdn.example/clue.mp3" || url === "https://cdn.example/answer.mp3") {
        return new Response(new Uint8Array(speech), { headers: { "Content-Type": "audio/mpeg" } });
      }
      if (url === cryUrl(1)) return new Response(new Uint8Array(cry), { headers: { "Content-Type": "audio/ogg" } });
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        return Response.json({ upload: { uploadId: `up-${puts.length + 1}`, uploadUrl: "https://upload.example/put" } });
      }
      if (url === "https://upload.example/put") {
        const body = init?.body;
        puts.push(Buffer.from(body instanceof Uint8Array ? body : new Uint8Array()));
        return new Response("ok");
      }
      if (url.includes("/transcoded")) {
        transcode += 1;
        return Response.json({
          transcode: {
            transcodedSha256: `guess${transcode}`,
            transcodedInfo: { duration: 3, fileSize: 1, format: "mp3", channels: "mono" },
          },
        });
      }
      if (url === "https://api.yotoplay.com/content" && init?.method === "POST") {
        posted = String(init.body);
        return Response.json({ card: { cardId: "card-1" } });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      await attachCry("x".repeat(24), { cardId: "card-1", chapterKey: "bulbasaur", dexId: 1 }, fetchImpl);
      const payload = JSON.parse(posted) as {
        content: {
          chapters: Array<{
            tracks: Array<{ type: string; trackUrl: string; display?: { icon16x16?: string } }>;
          }>;
        };
      };
      const tracks = payload.content.chapters[0]?.tracks ?? [];
      assert.equal(tracks.length, 2);
      assert.equal(puts.length, 2);
      for (const [index, track] of tracks.entries()) {
        assert.equal(track.type, "audio");
        assert.match(track.trackUrl, /^yoto:#[A-Za-z0-9]+$/);
        const mixed = puts[index];
        assert.ok(mixed);
        assert.equal(await cryLeads(cry, speech, mixed), true);
      }
      assert.equal(tracks[0]?.display?.icon16x16, "yoto:#shadow-1");
      assert.equal(tracks[1]?.display?.icon16x16, "yoto:#pixel-1");
      assert.notEqual(tracks[0]?.trackUrl, tracks[1]?.trackUrl);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("asks Yoto for one Lily line, not a whole playlist", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-one-"));
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      posted = String(init?.body ?? "");
      assert.match(String(input), /voiceId=pFZP5JQG7iQjIQuC4Bku/);
      return Response.json({ job: { jobId: "job-line", status: "queued" } });
    };
    try {
      const result = await prepareFactTrack(
        "x".repeat(24),
        { text: "Bulbasaur waits in the grass.", title: "Bulbasaur", dexId: 1 },
        fetchImpl,
        { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered") },
      );
      assert.equal(result.phase, "speech");
      assert.equal(result.speechJobId, "job-line");
      const body = JSON.parse(posted) as {
        content: { chapters: Array<{ tracks: Array<{ type: string; trackUrl: string; voiceId?: string }> }> };
      };
      assert.equal(body.content.chapters.length, 1);
      assert.equal(body.content.chapters[0]?.tracks.length, 1);
      assert.equal(body.content.chapters[0]?.tracks[0]?.type, "elevenlabs");
      assert.equal(body.content.chapters[0]?.tracks[0]?.voiceId, LILY_VOICE_ID);
      assert.match(body.content.chapters[0]?.tracks[0]?.trackUrl ?? "", /Bulbasaur waits/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exports prepareFactTrack as the function the track route calls", async () => {
    assert.equal(typeof prepareFactTrack, "function");
    assert.equal(prepareFactTrack.name, "prepareFactTrack");
    const text = "Callable export check for one fact track.";
    const dexId = 1;
    const key = createHash("sha256").update(Buffer.from(`${LILY_VOICE_ID}\n${dexId}\n${text}`)).digest("hex");
    const speechHash = createHash("sha256").update(Buffer.from(`${LILY_VOICE_ID}\n${text}`)).digest("hex");
    const file = path.join(process.cwd(), "data", "rendered", `${key}.json`);
    const speechFile = path.join(process.cwd(), "data", "speech", `${speechHash}.mp3`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        trackUrl: "yoto:#route-check",
        duration: 2,
        fileSize: 12,
        format: "mp3",
        channels: "mono",
      }),
    );
    await rm(speechFile, { force: true });
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("labs.api.yotoplay.com/content/job")) {
        return Response.json({ job: { jobId: "job-line-route", status: "queued" } });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      const response = await postTrack(
        new Request("http://champdex.local/api/yoto/track", {
          method: "POST",
          headers: {
            authorization: `Bearer ${"t".repeat(24)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ text, title: "Bulbasaur", name: "Bulbasaur", dexId }),
        }),
      );
      const body = (await response.json()) as { phase?: string; trackUrl?: string; speechJobId?: string; error?: string };
      assert.equal(response.status, 200);
      assert.equal(body.phase, "speech");
      assert.equal(body.speechJobId, "job-line-route");
      assert.equal(body.trackUrl, undefined);
      assert.equal(body.error, undefined);
    } finally {
      globalThis.fetch = original;
      await rm(file, { force: true });
      await rm(speechFile, { force: true });
    }
  });

  it("sends a fact and a Guess Who clue and answer as cry-first audio, and fails a missing cry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-payload-"));
    const cryPath = path.join(process.cwd(), "data", "cries", "1.ogg");
    let cry: Buffer;
    try {
      cry = await readFile(cryPath);
    } catch {
      const response = await fetch(cryUrl(1));
      assert.equal(response.ok, true);
      cry = Buffer.from(await response.arrayBuffer());
    }
    const clueSpeechPath = path.join(dir, "clue.mp3");
    const answerSpeechPath = path.join(dir, "answer.mp3");
    const factSpeechPath = path.join(dir, "fact.mp3");
    await sine(factSpeechPath, 440);
    await sine(clueSpeechPath, 523);
    await sine(answerSpeechPath, 880);
    const factSpeech = await readFile(factSpeechPath);
    const clueSpeech = await readFile(clueSpeechPath);
    const answerSpeech = await readFile(answerSpeechPath);
    const roots = { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered") };

    const fact: KidCard = {
      id: "meet-1",
      kind: "meet",
      title: "Pokefacts",
      rangeLabel: "Pokefacts 1 (1-1)",
      libraryTitle: "Pokefacts 1",
      blurb: "Facts.",
      childDoes: "Listen.",
      chapters: [
        {
          key: "bulbasaur",
          title: "Bulbasaur",
          overlay: "1",
          picture: "this Pokémon",
          mark: "1",
          icon: "/pixels/1.png",
          dexId: 1,
          tracks: [
            {
              key: "entry",
              title: "Bulbasaur",
              text: "Bulbasaur waits in the tall grass. It weighs 6.9 kilograms.",
              spoken: "Bulbasaur waits in the tall grass. It weighs 6.9 kilograms.",
              icon: "/pixels/1.png",
              overlay: "1",
              voiceId: LILY_VOICE_ID,
            },
          ],
        },
      ],
    };
    const clueText = "Number 1. Three clues. A seed sits on its back. One. Two. Three.";
    const answerText = "It is Bulbasaur.";
    assert.doesNotMatch(clueText, /Bulbasaur/i);
    assert.match(answerText, /^It is Bulbasaur\./);
    const guess: KidCard = {
      id: "guess-random",
      kind: "guess",
      title: "Guess Who",
      rangeLabel: "Random 50",
      libraryTitle: "Guess Who",
      blurb: "Riddles.",
      childDoes: "Guess.",
      chapters: [
        {
          key: "bulbasaur",
          title: "Bulbasaur",
          overlay: "1",
          picture: "a shadow",
          mark: "?",
          icon: "/pixels/1-shadow.png",
          dexId: 1,
          sprite: "/pixels/1-shadow.png",
          tracks: [
            {
              key: "clues",
              title: "Three clues",
              text: clueText,
              spoken: clueText,
              icon: "/pixels/1-shadow.png",
              overlay: "?",
              voiceId: LILY_VOICE_ID,
            },
            {
              key: "answer",
              title: "The answer",
              text: answerText,
              spoken: answerText,
              icon: "/pixels/1.png",
              overlay: "Yes",
              voiceId: LILY_VOICE_ID,
            },
          ],
        },
      ],
    };

    const puts: Buffer[] = [];
    const fetchFor = (speech: Buffer, cardId: string, jobId: string, hash: string): typeof fetch => {
      return async (input, init) => {
        const url = String(input);
        if (url.includes(`/content/job/${jobId}`)) {
          return Response.json({
            job: { jobId, status: "completed", result: { cardId } },
          });
        }
        if (url.includes(`/content/${cardId}`) && url.includes("playable=true")) {
          return Response.json({
            card: {
              content: {
                chapters: [{ tracks: [{ trackUrl: `https://cdn.example/${cardId}.mp3`, type: "audio" }] }],
              },
            },
          });
        }
        if (url.includes(`/content/${cardId}`) && init?.method === "DELETE") return new Response(null, { status: 200 });
        if (url === `https://cdn.example/${cardId}.mp3`) {
          return new Response(new Uint8Array(speech), { headers: { "Content-Type": "audio/mpeg" } });
        }
        if (url === cryUrl(1)) return new Response(new Uint8Array(cry), { headers: { "Content-Type": "audio/ogg" } });
        if (url.includes("/media/transcode/audio/uploadUrl")) {
          return Response.json({
            upload: { uploadId: `up-${hash}`, uploadUrl: `https://upload.example/${hash}` },
          });
        }
        if (url === `https://upload.example/${hash}`) {
          const body = init?.body;
          puts.push(Buffer.from(body instanceof Uint8Array ? body : new Uint8Array()));
          return new Response("ok");
        }
        if (url.includes("/transcoded")) {
          return Response.json({
            transcode: {
              transcodedSha256: hash,
              transcodedInfo: { duration: 3, fileSize: puts.at(-1)?.length ?? 1, format: "mp3", channels: "mono" },
            },
          });
        }
        throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
      };
    };

    const finish = async (text: string, title: string, speech: Buffer, cardId: string, jobId: string, hash: string) => {
      const result = await prepareFactTrack(
        "x".repeat(24),
        { text, title, dexId: 1, name: "Bulbasaur", speechJobId: jobId },
        fetchFor(speech, cardId, jobId, hash),
        roots,
      );
      assert.equal(result.phase, "ready");
      assert.equal(result.trackUrl, `yoto:#${hash}`);
      return result;
    };

    try {
      const factUpload = factsBulkUpload(fact, { 1: "pixel" });
      const factJobs = renderJobs("Pokefacts 1", fact, factUpload);
      assert.equal(factJobs.length, 1);
      assert.equal(factJobs[0]?.dexId, 1);
      assert.equal(factJobs[0]?.name, "Bulbasaur");
      assert.match(factJobs[0]?.text ?? "", /kilograms/);
      const factAudio = await finish(
        factJobs[0]?.text ?? "",
        factJobs[0]?.title ?? "",
        factSpeech,
        "fact1",
        "job-fact-1",
        "factmergedhash",
      );
      const factReady = applyFinishedAudio(factUpload, {
        [factJobs[0]?.key ?? ""]: {
          trackUrl: factAudio.trackUrl ?? "",
          duration: factAudio.duration,
          fileSize: factAudio.fileSize,
          format: factAudio.format,
          channels: factAudio.channels,
        },
      });
      assert.equal(factReady.create, true);
      assert.equal(factReady.content.title, "Pokefacts 1");
      assert.equal(Object.hasOwn(factReady.content, "cardId"), false);
      const factTrack = (
        factReady.content.content as {
          chapters: Array<{ tracks: Array<{ type?: string; trackUrl?: string; voiceId?: string; display?: { icon16x16?: string } }> }>;
        }
      ).chapters[0]?.tracks[0];
      assert.equal(factTrack?.type, "audio");
      assert.equal(factTrack?.trackUrl, "yoto:#factmergedhash");
      assert.equal(factTrack?.voiceId, undefined);
      assert.equal(factTrack?.display?.icon16x16, "yoto:#pixel");
      const factMixed = puts.at(-1);
      assert.ok(factMixed);
      assert.equal(await cryLeads(cry, factSpeech, factMixed), true);

      const original = globalThis.fetch;
      let posted = "";
      let postedUrl = "";
      globalThis.fetch = async (input, init) => {
        postedUrl = String(input);
        posted = String(init?.body ?? "");
        return new Response(JSON.stringify({ card: { cardId: "ab12C", title: "Pokefacts 1" } }), { status: 200 });
      };
      try {
        const response = await postJob(
          new Request("http://champdex.local/api/yoto/job", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${"x".repeat(24)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(factReady),
          }),
        );
        assert.equal(response.status, 200);
        assert.equal(postedUrl, "https://api.yotoplay.com/content");
        const upstream = JSON.parse(posted) as {
          title?: string;
          cardId?: string;
          content?: { chapters?: Array<{ tracks?: Array<{ type?: string; trackUrl?: string }> }> };
        };
        assert.equal(upstream.title, "Pokefacts 1");
        assert.equal(Object.hasOwn(upstream, "cardId"), false);
        assert.equal(upstream.content?.chapters?.[0]?.tracks?.[0]?.type, "audio");
        assert.equal(upstream.content?.chapters?.[0]?.tracks?.[0]?.trackUrl, "yoto:#factmergedhash");
        assert.equal(JSON.stringify(upstream).includes("elevenlabs"), false);
        assert.equal(JSON.stringify(upstream).includes("yoto:#lily"), false);
      } finally {
        globalThis.fetch = original;
      }

      const guessBase = guessUpload(guess, { 1: "pixel-1" }, { 1: "shadow-1" });
      const guessUploadBody = { ...guessBase, create: true as const, content: { ...guessBase.content } };
      delete guessUploadBody.content.cardId;
      const guessJobs = renderJobs("Guess Who", guess, guessUploadBody);
      assert.equal(guessJobs.length, 2);
      assert.equal(guessJobs[0]?.dexId, 1);
      assert.equal(guessJobs[1]?.dexId, 1);
      assert.equal(guessJobs[0]?.name, "Bulbasaur");
      assert.equal(guessJobs[1]?.name, "Bulbasaur");
      assert.doesNotMatch(guessJobs[0]?.text ?? "", /Bulbasaur/i);
      assert.match(guessJobs[1]?.text ?? "", /^It is Bulbasaur\./);
      const clueAudio = await finish(guessJobs[0]?.text ?? "", guessJobs[0]?.title ?? "", clueSpeech, "clue1", "job-clue-1", "cluemergedhash");
      const answerAudio = await finish(
        guessJobs[1]?.text ?? "",
        guessJobs[1]?.title ?? "",
        answerSpeech,
        "answ1",
        "job-answer-1",
        "answermergedhash",
      );
      const guessReady = applyFinishedAudio(guessUploadBody, {
        [guessJobs[0]?.key ?? ""]: {
          trackUrl: clueAudio.trackUrl ?? "",
          duration: clueAudio.duration,
          fileSize: clueAudio.fileSize,
          format: clueAudio.format,
          channels: clueAudio.channels,
        },
        [guessJobs[1]?.key ?? ""]: {
          trackUrl: answerAudio.trackUrl ?? "",
          duration: answerAudio.duration,
          fileSize: answerAudio.fileSize,
          format: answerAudio.format,
          channels: answerAudio.channels,
        },
      });
      const guessTracks = (
        guessReady.content.content as {
          chapters: Array<{
            display?: { icon16x16?: string };
            tracks: Array<{ type?: string; trackUrl?: string; voiceId?: string; display?: { icon16x16?: string } }>;
          }>;
        }
      ).chapters[0];
      assert.equal(guessTracks?.display?.icon16x16, "yoto:#shadow-1");
      assert.equal(guessTracks?.tracks[0]?.type, "audio");
      assert.equal(guessTracks?.tracks[1]?.type, "audio");
      assert.equal(guessTracks?.tracks[0]?.trackUrl, "yoto:#cluemergedhash");
      assert.equal(guessTracks?.tracks[1]?.trackUrl, "yoto:#answermergedhash");
      assert.equal(guessTracks?.tracks[0]?.voiceId, undefined);
      assert.equal(guessTracks?.tracks[1]?.voiceId, undefined);
      assert.equal(guessTracks?.tracks[0]?.display?.icon16x16, "yoto:#shadow-1");
      assert.equal(guessTracks?.tracks[1]?.display?.icon16x16, "yoto:#pixel-1");
      assert.equal(JSON.stringify(guessReady.content).includes("elevenlabs"), false);
      const clueMixed = puts.at(-2);
      const answerMixed = puts.at(-1);
      assert.ok(clueMixed);
      assert.ok(answerMixed);
      assert.equal(await cryLeads(cry, clueSpeech, clueMixed), true);
      assert.equal(await cryLeads(cry, answerSpeech, answerMixed), true);
      assert.notEqual(clueMixed.equals(clueSpeech), true);
      assert.notEqual(answerMixed.equals(answerSpeech), true);

      const missingPuts: Buffer[] = [];
      const missingFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/content/job/job-missing")) {
          return Response.json({
            job: { jobId: "job-missing", status: "completed", result: { cardId: "miss1" } },
          });
        }
        if (url.includes("/content/miss1") && url.includes("playable=true")) {
          return Response.json({
            card: { content: { chapters: [{ tracks: [{ trackUrl: "https://cdn.example/miss1.mp3" }] }] } },
          });
        }
        if (url.includes("/content/miss1") && init?.method === "DELETE") return new Response(null, { status: 200 });
        if (url === "https://cdn.example/miss1.mp3") return new Response(new Uint8Array(factSpeech));
        if (url === cryUrl(25)) return new Response("missing", { status: 404 });
        if (url.includes("/uploadUrl") || url.includes("upload.example")) {
          missingPuts.push(Buffer.from("voice-only"));
          return new Response("nope", { status: 500 });
        }
        throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
      };
      await assert.rejects(
        () =>
          prepareFactTrack(
            "x".repeat(24),
            {
              text: "Pikachu waits in the tall grass. It weighs 6 kilograms.",
              title: "Pikachu",
              name: "Pikachu",
              dexId: 25,
              speechJobId: "job-missing",
            },
            missingFetch,
            {
              speech: path.join(dir, "missing-speech"),
              rendered: path.join(dir, "missing-rendered"),
              cries: path.join(dir, "missing-cries"),
            },
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Pikachu cry could not be added\./);
          assert.match(error.message, /HTTP 404/);
          return true;
        },
      );
      assert.equal(missingPuts.length, 0);

      await assert.rejects(
        () =>
          prepareFactTrack(
            "x".repeat(24),
            {
              text: "A voice-only upload must not count as Bulbasaur's finished track.",
              title: "Bulbasaur",
              name: "Bulbasaur",
              dexId: 1,
              uploadId: "voice-only-upload",
            },
            fetchFor(factSpeech, "fact1", "job-fact-1", "factmergedhash"),
            roots,
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Bulbasaur/);
          assert.match(error.message, /cry/);
          return true;
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("puts Pikachu's MP3 cry first and names the reason when the cry cannot be mixed", async () => {
    const response = await fetch(cryUrl(25));
    assert.equal(response.status, 200);
    const cry = Buffer.from(await response.arrayBuffer());
    assert.equal(cry.subarray(0, 4).toString("ascii") === "OggS", false);
    assert.equal(audioContainer(cry), "mp3");
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-pika-"));
    const speechPath = path.join(dir, "speech.mp3");
    await sine(speechPath, 660);
    const speech = await readFile(speechPath);
    const merged = await mergeCryFirst(cry, speech);
    const cryLength = await audioDurationSeconds(cry, "cry.mp3");
    const mergedLength = await audioDurationSeconds(merged, "merged.mp3");
    assert.ok(mergedLength > cryLength);
    assert.equal(await cryLeads(cry, speech, merged), true);

    const puts: Buffer[] = [];
    const roots = {
      speech: path.join(dir, "cache-speech"),
      rendered: path.join(dir, "cache-rendered"),
      cries: path.join(dir, "cache-cries"),
    };
    const text = "Pikachu waits in the tall grass. It weighs 6 kilograms.";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/content/job/job-pika")) {
        return Response.json({ job: { jobId: "job-pika", status: "completed", result: { cardId: "pika1" } } });
      }
      if (url.includes("/content/pika1") && url.includes("playable=true")) {
        return Response.json({
          card: { content: { chapters: [{ tracks: [{ trackUrl: "https://cdn.example/pika1.mp3" }] }] } },
        });
      }
      if (url.includes("/content/pika1") && init?.method === "DELETE") return new Response(null, { status: 200 });
      if (url === "https://cdn.example/pika1.mp3") return new Response(new Uint8Array(speech));
      if (url === cryUrl(25)) return new Response(new Uint8Array(cry), { headers: { "Content-Type": "audio/ogg" } });
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        return Response.json({ upload: { uploadId: "up-pika", uploadUrl: "https://upload.example/pika" } });
      }
      if (url === "https://upload.example/pika") {
        const body = init?.body;
        puts.push(Buffer.from(body instanceof Uint8Array ? body : new Uint8Array()));
        return new Response("ok");
      }
      if (url.includes("/transcoded")) {
        return Response.json({
          transcode: {
            transcodedSha256: "pikamerged",
            transcodedInfo: { duration: 3, fileSize: puts.at(-1)?.length ?? 1, format: "mp3", channels: "mono" },
          },
        });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };

    try {
      const ready = await prepareFactTrack(
        "x".repeat(24),
        { text, title: "Pikachu", name: "Pikachu", dexId: 25, speechJobId: "job-pika" },
        fetchImpl,
        roots,
      );
      assert.equal(ready.phase, "ready");
      assert.equal(ready.trackUrl, "yoto:#pikamerged");
      const mixed = puts.at(-1);
      assert.ok(mixed);
      assert.equal(mixed.equals(speech), false);
      assert.equal(await cryLeads(cry, speech, mixed), true);

      const bogusPuts: Buffer[] = [];
      const bogusFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/content/job/job-bogus")) {
          return Response.json({ job: { jobId: "job-bogus", status: "completed", result: { cardId: "bogus" } } });
        }
        if (url.includes("/content/bogus") && url.includes("playable=true")) {
          return Response.json({
            card: { content: { chapters: [{ tracks: [{ trackUrl: "https://cdn.example/bogus.mp3" }] }] } },
          });
        }
        if (url.includes("/content/bogus") && init?.method === "DELETE") return new Response(null, { status: 200 });
        if (url === "https://cdn.example/bogus.mp3") return new Response(new Uint8Array(speech));
        if (url === cryUrl(25)) return new Response(Buffer.concat([Buffer.from("OggS"), Buffer.alloc(128)]));
        if (url.includes("/uploadUrl") || url.includes("upload.example")) {
          bogusPuts.push(Buffer.from("voice-only"));
          return new Response("nope", { status: 500 });
        }
        throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
      };
      await assert.rejects(
        () =>
          prepareFactTrack(
            "x".repeat(24),
            {
              text: "A broken Pikachu cry must not upload Lily alone.",
              title: "Pikachu",
              name: "Pikachu",
              dexId: 25,
              speechJobId: "job-bogus",
            },
            bogusFetch,
            {
              speech: path.join(dir, "bogus-speech"),
              rendered: path.join(dir, "bogus-rendered"),
              cries: path.join(dir, "bogus-cries"),
            },
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Pikachu cry could not be added\. \S+/);
          assert.equal(error.message.includes("filter_complex"), false);
          assert.equal(error.message.includes("libmp3lame"), false);
          assert.ok(error.message.length < 240);
          return true;
        },
      );
      assert.equal(bogusPuts.length, 0);

      await assert.rejects(
        () =>
          prepareFactTrack(
            "x".repeat(24),
            { text: "Pikachu needs a real national dex id.", title: "Pikachu", name: "Pikachu", dexId: 0 },
            fetchImpl,
            roots,
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Pikachu cry could not be added\./);
          assert.match(error.message, /national Pokédex \(0\)/);
          return true;
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not return a yoto hash until the cry is merged, and a missing cry is not a voice-only track", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-before-upload-"));
    const text = "Local Lily must not upload before the cry is mixed.";
    const speechHash = createHash("sha256").update(Buffer.from(`${LILY_VOICE_ID}\n${text}`)).digest("hex");
    const speechRoot = path.join(dir, "speech");
    const sample = path.join(dir, "sample.mp3");
    await mkdir(speechRoot, { recursive: true });
    await sine(sample);
    await writeFile(path.join(speechRoot, `${speechHash}.mp3`), await readFile(sample));
    let uploads = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url === cryUrl(25)) return new Response("missing", { status: 404 });
      if (url.includes("/uploadUrl") || url.includes("labs.api.yotoplay.com") || url.includes("upload.example")) {
        uploads += 1;
        return new Response("voice-only", { status: 500 });
      }
      throw new Error(`Unexpected ${url}`);
    };
    try {
      await assert.rejects(
        () =>
          prepareFactTrack(
            "x".repeat(24),
            { text, title: "Pikachu", name: "Pikachu", dexId: 25 },
            fetchImpl,
            {
              speech: speechRoot,
              rendered: path.join(dir, "rendered"),
              cries: path.join(dir, "cries"),
            },
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Pikachu cry could not be added\./);
          assert.match(error.message, /HTTP 404/);
          assert.equal(error.message.includes("yoto:#"), false);
          return true;
        },
      );
      assert.equal(uploads, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("encodes a plain 128k MP3 and names the Pokémon when Yoto cannot transcode", async () => {
    assert.deepEqual(
      [...YOTO_MP3_ARGS],
      [
        "-vn",
        "-map_metadata",
        "-1",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "1",
        "-id3v2_version",
        "0",
        "-write_id3v1",
        "0",
      ],
    );
    assert.equal(YOTO_MP3_ARGS.includes("-q:a"), false);

    const dir = await mkdtemp(path.join(tmpdir(), "champdex-yoto-mp3-"));
    try {
      const cryPath = path.join(dir, "cry.mp3");
      const speechPath = path.join(dir, "speech.mp3");
      await sine(cryPath, 880);
      await sine(speechPath, 440);
      const cry = await readFile(cryPath);
      const speech = await readFile(speechPath);
      const merged = await mergeCryFirst(cry, speech);
      assert.equal(merged[0], 0xff);
      assert.equal((merged[1] & 0xe0) === 0xe0, true);
      assert.equal(merged.subarray(0, 3).toString("ascii") === "ID3", false);
      assert.equal(merged.subarray(0, 64).includes(Buffer.from("Xing")), false);
      const probed = await probeMerged(merged);
      assert.equal(probed.codec, "mp3");
      assert.equal(probed.sampleRate, 44100);
      assert.equal(probed.channels, 1);
      assert.equal(probed.streams, 1);
      assert.equal(probed.video, 0);
      assert.ok(probed.bitRate >= 120_000 && probed.bitRate <= 140_000);
      assert.ok(probed.duration >= 1);

      const text = "Aerodactyl waits on the cliff. Its wings are wide.";
      const speechRoot = path.join(dir, "speech-cache");
      const cries = path.join(dir, "cries");
      await mkdir(speechRoot, { recursive: true });
      await mkdir(cries, { recursive: true });
      const speechHash = createHash("sha256").update(Buffer.from(`${LILY_VOICE_ID}\n${text}`)).digest("hex");
      await writeFile(path.join(speechRoot, `${speechHash}.mp3`), speech);
      await writeFile(path.join(cries, "142.ogg"), cry);
      const fetchImpl: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/media/transcode/audio/uploadUrl")) {
          return Response.json({ upload: { uploadId: "up-aero", uploadUrl: "https://upload.example/aero" } });
        }
        if (url === "https://upload.example/aero" && init?.method === "PUT") return new Response("ok");
        if (url.includes("/transcoded")) {
          return Response.json({ transcode: { progress: { phase: "error" } } });
        }
        throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
      };
      await assert.rejects(
        () =>
          prepareFactTrack(
            "x".repeat(24),
            { text, title: "Aerodactyl", name: "Aerodactyl", dexId: 142 },
            fetchImpl,
            { speech: speechRoot, rendered: path.join(dir, "rendered"), cries },
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Aerodactyl/);
          assert.match(error.message, /could not transcode/);
          assert.match(error.message, /track 142/);
          assert.equal(error.message.includes("yoto:#"), false);
          return true;
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("schedules track jobs with a pool bigger than one", async () => {
    assert.ok(TRACK_POOL_SIZE > 1);
    assert.equal(trackPoolSize(100), 4);
    assert.ok(trackPoolSize(TRACK_POOL_SIZE) > 1);
    let active = 0;
    let peak = 0;
    const finished: number[] = [];
    const results = await mapPool(
      [0, 1, 2, 3, 4, 5],
      async (item) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active -= 1;
        finished.push(item);
        return item;
      },
      TRACK_POOL_SIZE,
    );
    assert.equal(peak, TRACK_POOL_SIZE);
    assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
    assert.equal(finished.length, 6);
  });

  it("reuses a cached merged file and yoto hash instead of calling ffmpeg", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-reuse-"));
    const text = "Oddish stores moonlight in its leaves.";
    const voiceId = LILY_VOICE_ID;
    const dexId = 43;
    const key = renderedCacheKey(text, dexId, voiceId);
    assert.notEqual(renderedCacheKey(text, dexId, voiceId, { cryVolume: 2 }), key);
    assert.notEqual(renderedCacheKey(text, dexId, voiceId, { voiceVolume: 0.5 }), key);
    assert.notEqual(renderedCacheKey(text, dexId, voiceId, { pauseSeconds: 1 }), key);
    assert.equal(renderedCacheKey(text, dexId, voiceId, { cryVolume: 4, voiceVolume: 1, pauseSeconds: 0.35 }), key);
    const legacy = createHash("sha256").update(Buffer.from(`${voiceId}\n${dexId}\n${text}`)).digest("hex");
    assert.notEqual(key, legacy);
    const rendered = path.join(dir, "rendered");
    await mkdir(rendered, { recursive: true });
    const merged = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 2)]);
    await writeFile(path.join(rendered, `${key}.mp3`), merged);
    await writeFile(
      path.join(rendered, `${key}.json`),
      JSON.stringify({
        cryFirst: true,
        accounts: {
          [renderedAccount("x".repeat(24))]: {
            trackUrl: "yoto:#cachedmix",
            duration: 2,
            fileSize: merged.length,
            format: "mp3",
            channels: "mono",
          },
        },
      }),
    );
    let ffmpegCalls = 0;
    let networkCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      networkCalls += 1;
      throw new Error("A cached mix must not call Yoto or download the cry.");
    };
    try {
      const ready = await prepareFactTrack(
        "x".repeat(24),
        { text, title: "Oddish", name: "Oddish", dexId, voiceId },
        fetchImpl,
        {
          speech: path.join(dir, "speech"),
          rendered,
          cries: path.join(dir, "cries"),
          merge: async () => {
            ffmpegCalls += 1;
            throw new Error("ffmpeg should not run");
          },
        },
      );
      assert.equal(ffmpegCalls, 0);
      assert.equal(networkCalls, 0);
      assert.equal(ready.phase, "ready");
      assert.equal(ready.trackUrl, "yoto:#cachedmix");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Pokefacts scratch", () => {
  it("deletes the scratch card when the line is already cached", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-scratch-cache-"));
    const text = "A short introduction.";
    const rendered = path.join(dir, "rendered");
    await mkdir(rendered, { recursive: true });
    const key = renderedCacheKey(text, undefined, LILY_VOICE_ID);
    await writeFile(
      path.join(rendered, `${key}.json`),
      JSON.stringify({
        accounts: {
          [renderedAccount("x".repeat(24))]: {
            trackUrl: "yoto:#introhash",
            duration: 1,
            fileSize: 20,
            format: "mp3",
            channels: "mono",
          },
        },
      }),
    );
    const deleted: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === "DELETE" && url.endsWith("/scr01")) {
        deleted.push(url);
        if (deleted.length === 1) return new Response("busy", { status: 500 });
        return Response.json({ status: "ok" });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      const ready = await prepareFactTrack(
        "x".repeat(24),
        { text, title: "Introduction", voiceId: LILY_VOICE_ID, speechCardId: "scr01" },
        fetchImpl,
        { speech: path.join(dir, "speech"), rendered },
      );
      assert.equal(ready.phase, "ready");
      assert.equal(ready.trackUrl, "yoto:#introhash");
      assert.equal(deleted.length, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("deletes the scratch card when Lily's file is already on disk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-scratch-file-"));
    const text = "Jigglypuff sings a short note.";
    const speech = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 1)]);
    const speechDir = path.join(dir, "speech");
    await mkdir(speechDir, { recursive: true });
    const key = createHash("sha256").update(Buffer.from(`${LILY_VOICE_ID}\n${text}`)).digest("hex");
    await writeFile(path.join(speechDir, `${key}.mp3`), speech);
    const deleted: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        deleted.push(url);
        return Response.json({ status: "ok" });
      }
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        return Response.json({ upload: { uploadId: "up-jiggly", uploadUrl: "https://upload.example/jiggly" } });
      }
      if (url === "https://upload.example/jiggly") return new Response("ok");
      if (url.includes("/transcoded")) {
        return Response.json({
          transcode: {
            transcodedSha256: "jigglyhash",
            transcodedInfo: { duration: 1, fileSize: speech.length, format: "mp3", channels: "mono" },
          },
        });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      const ready = await prepareFactTrack(
        "x".repeat(24),
        { text, title: "Jigglypuff", voiceId: LILY_VOICE_ID, speechCardId: "jig01" },
        fetchImpl,
        { speech: speechDir, rendered: path.join(dir, "rendered") },
      );
      assert.equal(ready.phase, "ready");
      assert.equal(ready.trackUrl, "yoto:#jigglyhash");
      assert.equal(deleted.some((url) => url.endsWith("/jig01")), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("deletes the card id Yoto returns, not only the id on the job", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-scratch-real-"));
    const speech = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 3)]);
    const deleted: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/content/job/job-real")) {
        return Response.json({ job: { jobId: "job-real", status: "completed", result: { card: { cardId: "temp1" } } } });
      }
      if (url.includes("/content/temp1") && url.includes("playable=true")) {
        return Response.json({
          card: {
            cardId: "real1",
            content: { chapters: [{ tracks: [{ trackUrl: "https://cdn.example/real1.mp3" }] }] },
          },
        });
      }
      if (url === "https://cdn.example/real1.mp3") return new Response(new Uint8Array(speech));
      if (init?.method === "DELETE") {
        deleted.push(url);
        return Response.json({ status: "ok" });
      }
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        return Response.json({ upload: { uploadId: "up-real", uploadUrl: "https://upload.example/real" } });
      }
      if (url === "https://upload.example/real") return new Response("ok");
      if (url.includes("/transcoded")) {
        return Response.json({
          transcode: {
            transcodedSha256: "realhash",
            transcodedInfo: { duration: 1, fileSize: speech.length, format: "mp3", channels: "mono" },
          },
        });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      const ready = await prepareFactTrack(
        "x".repeat(24),
        { text: "A saved line.", title: "Line", voiceId: LILY_VOICE_ID, speechJobId: "job-real" },
        fetchImpl,
        { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered") },
      );
      assert.equal(ready.phase, "ready");
      assert.equal(deleted.some((url) => url.endsWith("/temp1")), true);
      assert.equal(deleted.some((url) => url.endsWith("/real1")), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sweeps Pokefacts scratch out of the library and leaves the playlist", async () => {
    const deleted: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/content/mine")) {
        return Response.json({
          cards: [
            { cardId: "scr01", title: "Pokefacts scratch" },
            { cardId: "demo1", metadata: { title: "Pokefacts demo" } },
            { cardId: "old01", title: "Champdex scratch" },
            { cardId: "keep1", title: "Pokefacts 1" },
          ],
        });
      }
      if (init?.method === "DELETE") {
        deleted.push(url.split("/").pop() ?? "");
        return Response.json({ status: "ok" });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      const response = await postTrack(
        new Request("http://localhost/api/yoto/track", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"t".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sweepScratch: true, discardCardIds: ["miss9"] }),
        }),
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as { phase?: string };
      assert.equal(body.phase, "discarded");
      assert.deepEqual([...deleted].sort(), ["demo1", "miss9", "old01", "scr01"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("hear the entry", () => {
  const george = YOTO_VOICES.find((voice) => voice.name === "George")?.id ?? "";

  it("sends the selected voice and returns playable audio, not the script", async () => {
    assert.equal(george, "JBFqnCBsd6RMkjVDRZzb");
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-hear-"));
    const speech = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(180, 7)]);
    let labsUrl = "";
    let posted = "";
    const deleted: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("labs.api.yotoplay.com/content/job?") && init?.method === "POST") {
        labsUrl = url;
        posted = String(init.body ?? "");
        return Response.json({ job: { jobId: "job-hear", status: "completed", result: { cardId: "abc12" } } });
      }
      if (url.includes("/content/abc12") && url.includes("playable=true")) {
        return Response.json({
          card: { content: { chapters: [{ tracks: [{ trackUrl: "https://cdn.example/hear.mp3" }] }] } },
        });
      }
      if (url === "https://cdn.example/hear.mp3") return new Response(new Uint8Array(speech));
      if (url.includes("/content/mine")) {
        return Response.json({
          cards: [
            { cardId: "abc12", title: "Pokefacts demo" },
            { cardId: "keep1", title: "Pokefacts 1" },
          ],
        });
      }
      if (init?.method === "DELETE") {
        deleted.push(url);
        return Response.json({ status: "ok" });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    const request = demoHearBody({
      text: "Bulbasaur waits in the grass. This line is from Bulbapedia.",
      title: "Bulbasaur",
      voiceId: george,
      dexId: 1,
    });
    assert.equal(request.voiceId, george);
    assert.equal(request.text.includes("Bulbapedia"), false);
    try {
      const audio = await prepareDemoAudio("x".repeat(24), request, fetchImpl, {
        speech: path.join(dir, "speech"),
        rendered: path.join(dir, "rendered"),
        cryTimeoutMs: 40,
        wait: async () => undefined,
        merge: () => new Promise<Buffer>(() => undefined),
        loadCry: async () => Buffer.concat([Buffer.from("OggS"), Buffer.alloc(32, 1)]),
      });
      assert.match(labsUrl, /voiceId=JBFqnCBsd6RMkjVDRZzb/);
      const scratch = JSON.parse(posted) as {
        content: { chapters: Array<{ tracks: Array<{ voiceId?: string; trackUrl?: string }> }> };
      };
      assert.equal(scratch.content.chapters[0]?.tracks[0]?.voiceId, george);
      assert.equal(scratch.content.chapters[0]?.tracks[0]?.trackUrl?.includes("Bulbapedia"), false);
      assert.equal(audio.cryFirst, false);
      assert.equal(audio.audio.subarray(0, 3).toString("ascii"), "ID3");
      assert.equal(audio.audio.includes(Buffer.from("Bulbasaur")), false);
      assert.equal(deleted.some((url) => url.endsWith("/abc12")), true);
      assert.equal(deleted.some((url) => url.endsWith("/keep1")), false);

      const original = globalThis.fetch;
      globalThis.fetch = fetchImpl;
      try {
        const response = await postHear(
          new Request("http://localhost/api/yoto/hear", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${"t".repeat(24)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: request.text, title: request.title, voiceId: request.voiceId }),
          }),
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") ?? "", /audio/);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.subarray(0, 3).toString("ascii"), "ID3");
        assert.equal(bytes.toString("utf8").includes("Bulbasaur"), false);
      } finally {
        globalThis.fetch = original;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("asks Yoto Labs for the selected voice on a fact track", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-voice-"));
    let posted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      posted = String(init?.body ?? "");
      assert.match(String(input), /voiceId=JBFqnCBsd6RMkjVDRZzb/);
      return Response.json({ job: { jobId: "job-george", status: "queued" } });
    };
    try {
      const result = await prepareFactTrack(
        "x".repeat(24),
        { text: "Ivysaur grows in the sun.", title: "Ivysaur", dexId: 2, voiceId: george },
        fetchImpl,
        { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered") },
      );
      assert.equal(result.phase, "speech");
      const body = JSON.parse(posted) as {
        content: { chapters: Array<{ tracks: Array<{ voiceId?: string }> }> };
      };
      assert.equal(body.content.chapters[0]?.tracks[0]?.voiceId, george);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("plays a cached merged file without asking Lily to speak again", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-hear-cache-"));
    const text = "Bellsprout plants its feet and waits.";
    const rendered = path.join(dir, "rendered");
    await mkdir(rendered, { recursive: true });
    const key = renderedCacheKey(text, 69, LILY_VOICE_ID);
    const merged = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 4)]);
    await writeFile(path.join(rendered, `${key}.mp3`), merged);
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("Lily should not record a cached mix.");
    };
    try {
      const audio = await prepareDemoAudio(
        "x".repeat(24),
        { text, title: "Bellsprout", voiceId: LILY_VOICE_ID, dexId: 69 },
        fetchImpl,
        {
          speech: path.join(dir, "speech"),
          rendered,
          merge: async () => {
            calls += 1;
            throw new Error("ffmpeg should not run");
          },
        },
      );
      assert.equal(calls, 0);
      assert.equal(audio.cryFirst, true);
      assert.equal(audio.audio.equals(merged), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
