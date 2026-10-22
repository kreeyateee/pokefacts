import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST as postJob } from "../app/api/yoto/job/route";
import { saveMusicPlaylistToYoto, readSavedTrack, type MusicSaveFetch, type MusicSaveStep } from "./music-yoto-save";
import { YOTO_ICONS } from "./yoto-icons";

const TOKEN = "x".repeat(24);
const PIXEL = "p".repeat(43);

const SONGS = [
  { page: "Song_of_Jigglypuff", title: "Song of Jigglypuff", youtubeId: "R4GIyJxvk94" },
  { page: "Pokémon_Theme", title: "Pokémon Theme", youtubeId: "7Vmw9xqaryM" },
];

function mp3Track(song: (typeof SONGS)[number], index: number) {
  return {
    page: song.page,
    title: song.title,
    youtubeId: song.youtubeId,
    duration: 120 + index,
    fileSize: 48_000,
    format: "mp3",
    channels: "mono",
    trackUrl: `yoto:#${String(index).padStart(43, "t")}`,
    ...(index === 0 ? { dexId: 39 } : {}),
  };
}

/** The page's routes, with Yoto itself replaced by a stub. */
function fakeSite(calls: string[]): MusicSaveFetch {
  return async (path, init) => {
    calls.push(path);
    if (path === "/api/music/mp3") {
      const body = JSON.parse(String(init?.body)) as { page: string; youtubeId: string; upload: boolean };
      assert.equal(body.upload, true);
      const index = SONGS.findIndex((song) => song.page === body.page);
      const song = SONGS[index];
      assert.ok(song);
      assert.equal(body.youtubeId, song.youtubeId);
      return Response.json({ tracks: [mp3Track(song, index)] });
    }
    if (path === "/api/yoto/icon?id=39") return Response.json({ mediaId: PIXEL });
    if (path === "/api/yoto/job") {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${TOKEN}`);
      return postJob(new Request("http://127.0.0.1:3847/api/yoto/job", { ...init, headers }));
    }
    throw new Error(`Unexpected ${path}`);
  };
}

describe("save My playlist to Yoto", () => {
  it("saves each song as an MP3, adds its pixel, and creates one playlist", async () => {
    const calls: string[] = [];
    const steps: MusicSaveStep[] = [];
    const original = globalThis.fetch;
    let posted = "";
    globalThis.fetch = async (_input, init) => {
      posted = String(init?.body ?? "");
      return Response.json({ card: { cardId: "ab12C" } });
    };
    try {
      const saved = await saveMusicPlaylistToYoto({
        title: "  Johto songs ",
        songs: SONGS,
        fetcher: fakeSite(calls),
        onStep: (step) => steps.push(step),
      });
      assert.deepEqual(saved, { cardId: "ab12C", title: "Johto songs" });
    } finally {
      globalThis.fetch = original;
    }
    assert.deepEqual(calls, ["/api/music/mp3", "/api/music/mp3", "/api/yoto/icon?id=39", "/api/yoto/job"]);
    assert.equal(steps[0]?.text, "Saving Song of Jigglypuff as an MP3 (1 of 2)…");
    assert.equal(steps.at(-1)?.text, "Saving the playlist to Yoto…");

    const upstream = JSON.parse(posted) as {
      cardId?: string;
      content?: { chapters?: Array<{ display?: { icon16x16?: string }; tracks?: Array<Record<string, unknown>> }> };
    };
    assert.equal(upstream.cardId, undefined);
    const chapters = upstream.content?.chapters ?? [];
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0]?.display?.icon16x16, `yoto:#${PIXEL}`);
    assert.equal(chapters[1]?.display?.icon16x16, YOTO_ICONS.music);
    assert.equal(chapters[0]?.tracks?.[0]?.type, "audio");
    assert.equal(chapters[0]?.tracks?.[0]?.format, "mp3");
    assert.equal(chapters[0]?.tracks?.[0]?.trackUrl, mp3Track(SONGS[0]!, 0).trackUrl);
  });

  it("keeps the music icon when a picture upload fails", async () => {
    const calls: string[] = [];
    const site = fakeSite(calls);
    const original = globalThis.fetch;
    let posted = "";
    globalThis.fetch = async (_input, init) => {
      posted = String(init?.body ?? "");
      return Response.json({ card: { cardId: "ab12C" } });
    };
    try {
      await saveMusicPlaylistToYoto({
        title: "Songs",
        songs: SONGS.slice(0, 1),
        fetcher: async (path, init) =>
          path.startsWith("/api/yoto/icon") ? Response.json({ error: "No." }, { status: 500 }) : site(path, init),
      });
    } finally {
      globalThis.fetch = original;
    }
    const upstream = JSON.parse(posted) as { content?: { chapters?: Array<{ display?: { icon16x16?: string } }> } };
    assert.equal(upstream.content?.chapters?.[0]?.display?.icon16x16, YOTO_ICONS.music);
  });

  it("stops on a song that could not be saved and names it", async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        saveMusicPlaylistToYoto({
          title: "Songs",
          songs: SONGS,
          fetcher: async (path) => {
            calls.push(path);
            return Response.json({ error: "YouTube asked for a sign-in." }, { status: 422 });
          },
        }),
      /YouTube asked for a sign-in\./,
    );
    assert.deepEqual(calls, ["/api/music/mp3"]);
  });

  it("stops before the next step once cancelled", async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const site = fakeSite(calls);
    await assert.rejects(() =>
      saveMusicPlaylistToYoto({
        title: "Songs",
        songs: SONGS,
        signal: controller.signal,
        fetcher: async (path, init) => {
          const response = await site(path, init);
          controller.abort();
          return response;
        },
      }),
    );
    assert.deepEqual(calls, ["/api/music/mp3"]);
  });

  it("refuses a track that did not come back as a finished upload", () => {
    assert.throws(() => readSavedTrack({ tracks: [{ trackUrl: "https://example.com/a.mp3" }] }, SONGS[0]!), /did not reach Yoto/);
    assert.throws(() => readSavedTrack({}, SONGS[0]!), /did not reach Yoto/);
    const track = readSavedTrack({ tracks: [mp3Track(SONGS[0]!, 0)] }, SONGS[0]!);
    assert.equal(track.dexId, 39);
    assert.equal(track.duration, 120);
  });
});
