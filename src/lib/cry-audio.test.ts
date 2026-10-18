import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { audioDurationSeconds, cryLeads, cryUrl, mergeCryFirst } from "./cry-audio";
import { attachCry, prepareFactTrack } from "./yoto-fact-audio";
import { LILY_VOICE_ID } from "./kid-cards";

function sine(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", "-q:a", "5", file],
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
});
