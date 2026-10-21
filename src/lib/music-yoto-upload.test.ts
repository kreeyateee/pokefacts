import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { finishFactUpload, prepareFactTrack } from "./yoto-fact-audio";
import { YOUTUBE_MP3_PUBLIC } from "./youtube-mp3-site";
import { musicPlaylistUpload } from "./youtube-playlist";
import { contentCreateBody, uploadForPlaylist } from "./yoto-send";

const SONG = "Kanto Pokérap";
const OLD_FAILURE = `Yoto could not transcode track ${SONG}.`;

function mp3(): Buffer {
  return Buffer.from([0xff, 0xfb, 0x90, 0xc4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

describe("music playlist uses the Pokémon upload", () => {
  it("keeps YouTube to MP3 off the public site and leaves the downloader in the repo", () => {
    const route = readFileSync(new URL("../app/api/music/mp3/route.ts", import.meta.url), "utf8");
    const stream = readFileSync(new URL("../app/api/music/mp3/[youtubeId]/route.ts", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/music-panel.tsx", import.meta.url), "utf8");
    const playlist = readFileSync(new URL("../components/music-playlist.tsx", import.meta.url), "utf8");
    const trackRoute = readFileSync(new URL("../app/api/yoto/track/route.ts", import.meta.url), "utf8");
    const jobRoute = readFileSync(new URL("../app/api/yoto/job/route.ts", import.meta.url), "utf8");
    const helper = finishFactUpload.toString();

    assert.equal(YOUTUBE_MP3_PUBLIC, false);
    assert.match(route, /YOUTUBE_MP3_PUBLIC/);
    assert.match(stream, /YOUTUBE_MP3_PUBLIC/);
    assert.equal(panel.includes("/api/music/mp3"), false);
    assert.equal(panel.includes("Play MP3"), false);
    assert.equal(playlist.includes("Save to Yoto"), false);
    assert.equal(route.includes("uploadPlainMp3"), false);
    assert.match(route, /finishFactUpload\(token, song\.bytes, song\.title\)/);
    assert.match(helper, /prepareFactTrack\(/);
    assert.equal(prepareFactTrack.name, "prepareFactTrack");
    assert.match(trackRoute, /prepareFactTrack\(token, body\)/);
    assert.match(jobRoute, /contentCreateBody\(content\)/);
  });

  it("does not report the old transcode failure for a file this path accepts", async () => {
    const audio = mp3();
    const hash = createHash("sha256").update(audio).digest("hex");
    const sha = "a".repeat(43);
    const dir = await mkdtemp(path.join(tmpdir(), "music-yoto-"));
    const puts: Buffer[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        assert.match(url, /filename=pokefacts-intro\.mp3/);
        assert.match(url, new RegExp(`sha256=${hash}`));
        return Response.json({ upload: { uploadId: "up-kanto", uploadUrl: "https://upload.example/kanto" } });
      }
      if (url === "https://upload.example/kanto") {
        assert.equal(new Headers(init?.headers).get("content-type"), "audio/mpeg");
        const body = init?.body;
        puts.push(Buffer.from(body instanceof Uint8Array ? body : new Uint8Array()));
        return new Response(null, { status: 200 });
      }
      if (url.includes("/transcoded")) {
        assert.match(url, /loudnorm=false/);
        return Response.json({
          transcode: {
            transcodedSha256: sha,
            transcodedInfo: { duration: 183, fileSize: audio.length, format: "mp3", channels: "mono" },
          },
        });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };

    try {
      const uploaded = await finishFactUpload(token(), audio, SONG, fetchImpl, {
        speech: path.join(dir, "speech"),
        rendered: path.join(dir, "rendered"),
      });
      assert.equal(uploaded.trackUrl, `yoto:#${sha}`);
      assert.equal(puts.length, 1);
      assert.equal(puts[0]?.equals(audio), true);
      assert.equal(JSON.stringify(uploaded).includes(OLD_FAILURE), false);

      const playlist = uploadForPlaylist(
        musicPlaylistUpload("Pokémon music", [
          {
            title: SONG,
            youtubeId: "iMV62YrmNVo",
            trackUrl: uploaded.trackUrl,
            duration: uploaded.duration ?? 0,
            fileSize: uploaded.fileSize ?? 0,
            channels: uploaded.channels,
          },
        ]),
        undefined,
      );
      const body = contentCreateBody(playlist.content);
      assert.equal(playlist.create, true);
      assert.equal(body.cardId, undefined);
      assert.equal(body.metadata?.title, undefined);
      const chapters = body.content as {
        chapters?: Array<{ tracks?: Array<{ type?: string; trackUrl?: string; format?: string }> }>;
      };
      const track = chapters.chapters?.[0]?.tracks?.[0];
      assert.equal(track?.type, "audio");
      assert.equal(track?.trackUrl, uploaded.trackUrl);
      assert.equal(track?.format, "mp3");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("names a refused transcode with the Pokémon track label", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "music-yoto-fail-"));
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        return Response.json({ upload: { uploadId: "up-fail", uploadUrl: "https://upload.example/fail" } });
      }
      if (url === "https://upload.example/fail") return new Response(null, { status: 200 });
      if (url.includes("/transcoded")) {
        return Response.json({ transcode: { progress: { phase: "error" } } });
      }
      throw new Error(`Unexpected ${url}`);
    };
    try {
      await assert.rejects(
        () =>
          finishFactUpload(token(), mp3(), SONG, fetchImpl, {
            speech: path.join(dir, "speech"),
            rendered: path.join(dir, "rendered"),
          }),
        (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          assert.equal(message.includes(SONG), false);
          assert.equal(message, "Yoto could not transcode track intro.");
          return true;
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function token(): string {
  return "x".repeat(24);
}
