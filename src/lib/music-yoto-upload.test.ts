import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import rawIndex from "@/data/music-index.json";
import { GET as mp3Available, POST as mp3Post } from "../app/api/music/mp3/route";
import { GET as mp3Stream } from "../app/api/music/mp3/[youtubeId]/route";
import { GET as youtubeLookup } from "../app/api/music/youtube/route";
import { readMusicIndex } from "./music-index";
import { finishFactUpload, prepareFactTrack } from "./yoto-fact-audio";
import { LOCAL_MODE_ENV, isLoopbackHost, localToolsAllowed } from "./youtube-mp3-site";
import { musicPlaylistUpload } from "./youtube-playlist";
import { contentCreateBody, uploadForPlaylist } from "./yoto-send";

const SONG = "Kanto Pokérap";
const OLD_FAILURE = `Yoto could not transcode track ${SONG}.`;

function mp3(): Buffer {
  return Buffer.from([0xff, 0xfb, 0x90, 0xc4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

const LOCAL = { [LOCAL_MODE_ENV]: "1" };

function request(headers: Record<string, string>, path = "/api/music/mp3", init?: RequestInit): Request {
  return new Request(`http://127.0.0.1:3847${path}`, { ...init, headers });
}

/** Run `body` with the home launcher's flag set, then put the old value back. */
async function asHomeServer<T>(body: () => Promise<T>): Promise<T> {
  const before = process.env[LOCAL_MODE_ENV];
  process.env[LOCAL_MODE_ENV] = "1";
  try {
    return await body();
  } finally {
    if (before === undefined) delete process.env[LOCAL_MODE_ENV];
    else process.env[LOCAL_MODE_ENV] = before;
  }
}

/** A song with no stored id and no cached search, so only yt-dlp could find it. */
function unknownSongPage(): string {
  let cache: Record<string, unknown> = {};
  try {
    cache = JSON.parse(readFileSync(path.join(process.cwd(), "data", "music-youtube.json"), "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    cache = {};
  }
  const song = readMusicIndex(rawIndex).index.songs.find(
    (item) => !item.youtubeId && !(item.page in cache) && /^[^#?&/\\]{1,180}$/.test(item.page),
  );
  assert.ok(song, "the music index has a song without a video");
  return song.page;
}

describe("YouTube to MP3 runs only on a home computer used from that computer", () => {
  it("accepts a loopback Host when the home launcher started the server", () => {
    for (const host of ["127.0.0.1:3847", "localhost:3847", "localhost", "LOCALHOST", "[::1]:3847", "pokefacts.localhost:3847"]) {
      assert.equal(localToolsAllowed(request({ host }), LOCAL), true, host);
    }
    assert.equal(localToolsAllowed(request({ host: "127.0.0.1:3847", origin: "http://127.0.0.1:3847" }), LOCAL), true);
    assert.equal(localToolsAllowed(request({ host: "localhost:3847", "sec-fetch-site": "same-origin" }), LOCAL), true);
  });

  it("refuses the public site, even when its proxy headers name a loopback host", () => {
    assert.equal(localToolsAllowed(request({ host: "pokefacts.online" }), LOCAL), false);
    assert.equal(
      localToolsAllowed(
        request({ host: "pokefacts.online", "x-forwarded-host": "127.0.0.1:3847", forwarded: "host=localhost" }),
        LOCAL,
      ),
      false,
    );
    // systemd starts `next start --hostname 127.0.0.1` without the flag, so curl on the server is refused too.
    assert.equal(localToolsAllowed(request({ host: "127.0.0.1:3847" }), {}), false);
    assert.equal(localToolsAllowed(request({ host: "127.0.0.1:3847" }), { [LOCAL_MODE_ENV]: "true" }), false);
    for (const host of [
      "localhost.evil.example",
      "127.0.0.1.nip.io",
      "evil.example:3847@127.0.0.1",
      ".localhost",
      "",
      "192.168.1.20:3847",
    ]) {
      assert.equal(isLoopbackHost(host), false, host);
    }
    assert.equal(isLoopbackHost(null), false);
  });

  it("refuses a request sent by another site open in the same browser", () => {
    assert.equal(localToolsAllowed(request({ host: "127.0.0.1:3847", origin: "https://evil.example" }), LOCAL), false);
    assert.equal(localToolsAllowed(request({ host: "127.0.0.1:3847", origin: "null" }), LOCAL), false);
    assert.equal(localToolsAllowed(request({ host: "127.0.0.1:3847", "sec-fetch-site": "cross-site" }), LOCAL), false);
  });

  it("tells the page whether Save to Yoto is available, and never caches the answer", async () => {
    const closed = mp3Available(request({ host: "pokefacts.online" }));
    assert.deepEqual(await closed.json(), { available: false });
    assert.equal(closed.headers.get("cache-control"), "private, no-store");
    const open = await asHomeServer(async () => mp3Available(request({ host: "127.0.0.1:3847" })));
    assert.deepEqual(await open.json(), { available: true });
  });

  it("refuses the MP3 routes on the public site before reading the request", async () => {
    await asHomeServer(async () => {
      const post = await mp3Post(
        request({ host: "pokefacts.online", "content-type": "application/json" }, "/api/music/mp3", {
          method: "POST",
          body: JSON.stringify({ url: "https://www.youtube.com/watch?v=R4GIyJxvk94" }),
        }),
      );
      assert.equal(post.status, 403);
      const stream = await mp3Stream(request({ host: "pokefacts.online" }, "/api/music/mp3/R4GIyJxvk94"), {
        params: Promise.resolve({ youtubeId: "R4GIyJxvk94" }),
      });
      assert.equal(stream.status, 403);
    });
  });

  it("answers a public song lookup from stored ids without starting yt-dlp", async () => {
    const page = unknownSongPage();
    const lookup = (host: string) =>
      youtubeLookup(request({ host }, `/api/music/youtube?page=${encodeURIComponent(page)}`));
    // A spawn would fail here (no flag) or search YouTube. Neither may happen: the answer is "no video".
    const plain = await lookup("pokefacts.online");
    assert.equal(plain.status, 200);
    assert.equal(((await plain.json()) as { youtubeId: unknown }).youtubeId, null);
    const flagged = await asHomeServer(() => lookup("pokefacts.online"));
    assert.equal(flagged.status, 200);
    assert.equal(((await flagged.json()) as { youtubeId: unknown }).youtubeId, null);
  });

  it("checks the gate in every route that can reach yt-dlp, and keeps the Yoto upload path", () => {
    const route = readFileSync(new URL("../app/api/music/mp3/route.ts", import.meta.url), "utf8");
    const stream = readFileSync(new URL("../app/api/music/mp3/[youtubeId]/route.ts", import.meta.url), "utf8");
    const lookup = readFileSync(new URL("../app/api/music/youtube/route.ts", import.meta.url), "utf8");
    const download = readFileSync(new URL("./youtube-mp3.ts", import.meta.url), "utf8");
    const gate = readFileSync(new URL("./youtube-mp3-site.ts", import.meta.url), "utf8");
    const playlist = readFileSync(new URL("../components/music-playlist.tsx", import.meta.url), "utf8");
    const trackRoute = readFileSync(new URL("../app/api/yoto/track/route.ts", import.meta.url), "utf8");
    const jobRoute = readFileSync(new URL("../app/api/yoto/job/route.ts", import.meta.url), "utf8");
    const helper = finishFactUpload.toString();

    assert.match(route, /if \(!localToolsAllowed\(request\)\) return jsonError/);
    assert.match(stream, /if \(!localToolsAllowed\(request\)\) return jsonError/);
    assert.match(lookup, /local: localToolsAllowed\(request\)/);
    assert.match(download, /if \(!localModeEnabled\(\)\) return Promise\.reject/);
    assert.equal(/headers\.get\("x-forwarded|headers\.get\("forwarded/i.test(gate), false);
    assert.match(playlist, /Save to Yoto/);
    assert.match(playlist, /\/api\/music\/mp3/);
    assert.equal(route.includes("uploadPlainMp3"), false);
    assert.match(route, /finishFactUpload\(token, song\.bytes, song\.title\)/);
    assert.match(helper, /prepareFactTrack\(/);
    assert.equal(prepareFactTrack.name, "prepareFactTrack");
    assert.match(trackRoute, /prepareFactTrack\(token, body\)/);
    assert.match(jobRoute, /contentCreateBody\(content\)/);
  });
});

describe("music playlist uses the Pokémon upload", () => {
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
