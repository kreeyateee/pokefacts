import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { appendToPlaylist, contentCreateBody, freeSlotMessage } from "./yoto-send";
import { YOTO_ICONS } from "./yoto-icons";
import { syncLocalPlaylist } from "./webaoo-api";
import {
  addLocalTracks,
  LOCAL_FILE_ONLY,
  musicPlaylistContent,
  reorderLocalTracks,
  WEBAOO_TRACK_CAP,
  YOUTUBE_STAYS_EMBED,
  youtubeStayEmbedMessage,
  type WebaooTrack,
} from "./webaoo";

function keysOf(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      found.push(key);
      keysOf(item, found);
    }
  }
  return found;
}

function staged(id: string, fileName = `${id}.mp3`): WebaooTrack {
  return {
    id,
    fileName,
    title: id,
    icon: YOTO_ICONS.music,
    mime: "audio/mpeg",
    order: 0,
  };
}

describe("webaoo local files", () => {
  it("rejects a youtube url and does not treat it as a file to add", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      assert.equal(youtubeStayEmbedMessage(link), YOUTUBE_STAYS_EMBED);
      const added = addLocalTracks([], [{ id: "clip", fileName: link }]);
      assert.equal(added.tracks.length, 0);
      assert.equal(added.errors[0], YOUTUBE_STAYS_EMBED);
    }
    assert.equal(youtubeStayEmbedMessage("road-song.mp3"), null);
    assert.equal(localOnly("notes.txt"), LOCAL_FILE_ONLY);
  });

  it("orders tracks by moving one into another place", () => {
    const tracks = [staged("a"), staged("b"), staged("c"), staged("d")];
    assert.deepEqual(
      reorderLocalTracks(tracks, 0, 2).map((track) => track.id),
      ["b", "c", "a", "d"],
    );
    assert.deepEqual(
      reorderLocalTracks(tracks, 3, 1).map((track) => track.id),
      ["a", "d", "b", "c"],
    );
    assert.deepEqual(
      reorderLocalTracks(tracks, 1, 1).map((track) => track.id),
      ["a", "b", "c", "d"],
    );
  });

  it("stops at 100 tracks", () => {
    const existing = Array.from({ length: WEBAOO_TRACK_CAP }, (_, index) => staged(`t${index}`));
    const full = addLocalTracks(existing, [{ id: "extra", fileName: "extra.mp3" }]);
    assert.equal(full.tracks.length, WEBAOO_TRACK_CAP);
    assert.match(full.errors[0] ?? "", /100/);
    const room = addLocalTracks(existing.slice(0, 99), [
      { id: "ninety", fileName: "ninety.mp3" },
      { id: "past", fileName: "past.m4a" },
    ]);
    assert.equal(room.tracks.length, 100);
    assert.equal(room.tracks.at(-1)?.id, "ninety");
    assert.match(room.errors[0] ?? "", /100/);
  });

  it("builds an audio playlist with no dex id and no cry", () => {
    const raw = musicPlaylistContent(
      {
        title: "Road songs",
        tracks: [
          { id: "a", title: "One", icon: YOTO_ICONS.music },
          { id: "b", title: "Two" },
        ],
      },
      {
        a: { trackUrl: "yoto:#readyhashone", duration: 12, fileSize: 1000, format: "mp3", channels: "mono" },
        b: { trackUrl: "yoto:#readyhashtwo", duration: 8, fileSize: 800, format: "mp3", channels: 1 },
      },
    );
    const posted = contentCreateBody(raw);
    const chapters = (posted.content as { chapters: Array<{ tracks: Array<Record<string, unknown>> }> }).chapters;
    assert.equal(chapters[0]?.tracks[0]?.type, "audio");
    assert.equal(chapters[1]?.tracks[0]?.type, "audio");
    assert.equal(chapters[0]?.tracks[0]?.trackUrl, "yoto:#readyhashone");
    const body = JSON.stringify(posted);
    assert.equal(body.includes("dexId"), false);
    assert.equal(body.toLowerCase().includes("cry"), false);
    const keys = keysOf(posted);
    assert.equal(keys.includes("dexId"), false);
    assert.equal(keys.includes("lead"), false);
    assert.equal(keys.includes("cry"), false);
    assert.equal(Object.hasOwn(chapters[0]?.tracks[0] ?? {}, "voiceId"), false);
  });

  it("uses the free-slot message when the card is already full", () => {
    const addition = musicPlaylistContent(
      { title: "Road songs", tracks: [{ id: "a", title: "One", icon: YOTO_ICONS.music }] },
      { a: { trackUrl: "yoto:#readyhashone", duration: 12, fileSize: 1000, format: "mp3", channels: "mono" } },
    );
    const existing = {
      cardId: "ab12C",
      title: "Full",
      content: { chapters: Array.from({ length: 100 }, () => ({ tracks: [{}] })) },
      metadata: { description: "Full" },
    };
    assert.throws(
      () => appendToPlaylist(existing, addition),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, freeSlotMessage(0, 1));
        return true;
      },
    );
  });

  it("does not fetch or transcode a youtube url", async () => {
    let called = false;
    await assert.rejects(
      () =>
        syncLocalPlaylist({
          token: "t".repeat(24),
          title: "Songs",
          tracks: [
            {
              id: "a",
              title: "Clip",
              fileName: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              bytes: Buffer.from("not-audio"),
            },
          ],
          fetchImpl: async () => {
            called = true;
            throw new Error("network");
          },
          encode: async () => {
            called = true;
            return Buffer.from("mp3");
          },
          upload: async () => {
            called = true;
            return { trackUrl: "yoto:#abc", duration: 2, fileSize: 10, format: "mp3", channels: "mono" };
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, YOUTUBE_STAYS_EMBED);
        return true;
      },
    );
    assert.equal(called, false);
  });

  it("posts audio chapters and does not call a video host", async () => {
    const urls: string[] = [];
    const posts: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      assert.equal(/youtube|googlevideo|yt-dlp|ytdl/i.test(url), false);
      if (url === "https://api.yotoplay.com/content" && init?.method === "POST") {
        posts.push(String(init.body));
        return Response.json({ cardId: "ab12C", title: "Road songs" });
      }
      throw new Error(`unexpected ${url}`);
    };
    const result = await syncLocalPlaylist({
      token: "t".repeat(24),
      title: "Road songs",
      tracks: [
        {
          id: "a",
          title: "One",
          fileName: "one.mp3",
          icon: YOTO_ICONS.music,
          bytes: Buffer.from("mp3-bytes"),
        },
      ],
      fetchImpl,
      encode: async (bytes) => bytes,
      upload: async () => ({
        trackUrl: "yoto:#readyhashone",
        duration: 4,
        fileSize: 9,
        format: "mp3",
        channels: "mono",
      }),
    });
    assert.equal(result.cardId, "ab12C");
    assert.deepEqual(urls, ["https://api.yotoplay.com/content"]);
    const body = JSON.parse(posts[0] ?? "{}") as {
      content?: { chapters?: Array<{ tracks?: Array<{ type?: string }> }> };
    };
    assert.equal(body.content?.chapters?.[0]?.tracks?.[0]?.type, "audio");
    const json = JSON.stringify(body);
    assert.equal(json.includes("dexId"), false);
    assert.equal(json.toLowerCase().includes("cry"), false);
    assert.equal(keysOf(body).includes("lead"), false);
  });

  it("has no youtube download path in the wrapper or the route", () => {
    const api = readFileSync(new URL("./webaoo-api.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../app/api/yoto/webaoo/route.ts", import.meta.url), "utf8");
    const library = readFileSync(new URL("./webaoo.ts", import.meta.url), "utf8");
    for (const source of [api, route, library]) {
      assert.equal(source.includes("yt-dlp"), false);
      assert.equal(source.includes("youtubedl"), false);
      assert.equal(source.includes("googlevideo"), false);
      assert.equal(/youtube\.com\/watch/.test(source), false);
    }
    assert.equal(api.includes("prepareFactTrack"), false);
    assert.equal(api.includes("encodeYotoMp3"), true);
    assert.equal(api.includes("uploadTrackAudio"), true);
    assert.equal(api.includes("contentCreateBody"), true);
    assert.equal(api.includes("appendToPlaylist"), true);
  });
});

function localOnly(fileName: string): string | null {
  const added = addLocalTracks([], [{ id: "x", fileName }]);
  return added.errors[0] ?? null;
}
