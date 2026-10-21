import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST as postJob } from "../app/api/yoto/job/route";
import { LILY_VOICE_ID, YOTO_TRACK_LIMIT } from "./kid-cards";
import { musicPlaylistTitle, musicPlaylistUpload } from "./youtube-playlist";
import { contentCreateBody } from "./yoto-send";
import { YOTO_ICONS } from "./yoto-icons";

const icon = YOTO_ICONS.music;

function track(index: number) {
  return {
    title: index === 0 ? "Pokémon Theme" : `Song ${index + 1}`,
    youtubeId: `abc${String(index).padStart(8, "0")}`.slice(0, 11),
    trackUrl: `yoto:#${String(index).padStart(43, "a")}`,
    duration: 12.5,
    fileSize: 48_000,
  };
}

describe("music playlist", () => {
  it("names the playlist and stores each song as an mp3 track", () => {
    assert.equal(musicPlaylistTitle("  Theme  ", "Album"), "Theme");
    assert.equal(musicPlaylistTitle("", "English opening themes"), "English opening themes");
    const upload = musicPlaylistUpload("Pokémon hits", [track(0), track(1)], LILY_VOICE_ID);
    const body = contentCreateBody(upload.content);
    const chapters = (body.content as { chapters: Array<{ tracks: Array<Record<string, unknown>> }> }).chapters;
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0]?.tracks[0]?.format, "mp3");
    assert.equal(chapters[0]?.tracks[0]?.type, "audio");
    assert.equal(chapters[0]?.tracks[0]?.fileSize, 48_000);
    assert.equal(chapters[0]?.tracks[0]?.duration, 12.5);
    assert.equal(chapters[0]?.tracks[0]?.channels, "mono");
    assert.equal((chapters[0]?.tracks[0]?.display as { icon16x16: string }).icon16x16, icon);
    const media = (body.metadata as { media?: { fileSize?: number } } | undefined)?.media;
    assert.equal(media?.fileSize, 96_000);
    assert.equal(Object.hasOwn(body, "cardId"), false);
  });

  it("refuses a song that was not parsed into a finished mp3", () => {
    assert.throws(
      () => musicPlaylistUpload("Hits", [{ ...track(0), trackUrl: "https://example.com/song.mp3" }]),
      /not a finished MP3/,
    );
    assert.throws(() => musicPlaylistUpload("Hits", []), /at least one song/);
    assert.throws(
      () => musicPlaylistUpload("Hits", Array.from({ length: YOTO_TRACK_LIMIT + 1 }, (_, index) => track(index))),
      /Nothing was sent/,
    );
  });

  it("sends the mp3 playlist to Yoto as audio", async () => {
    const upload = { ...musicPlaylistUpload("Pokémon hits", [track(0)], LILY_VOICE_ID), create: true as const };
    const original = globalThis.fetch;
    let posted = "";
    globalThis.fetch = async (_input, init) => {
      posted = String(init?.body ?? "");
      return new Response(JSON.stringify({ card: { cardId: "ab12C", title: "Pokémon hits" } }), { status: 200 });
    };
    try {
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"x".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(upload),
        }),
      );
      assert.equal(response.status, 200);
      const upstream = JSON.parse(posted) as {
        title?: string;
        content?: { chapters?: Array<{ tracks?: Array<{ format?: string; type?: string }> }> };
      };
      assert.equal(upstream.title, "Pokémon hits");
      assert.equal(upstream.content?.chapters?.[0]?.tracks?.[0]?.format, "mp3");
      assert.equal(upstream.content?.chapters?.[0]?.tracks?.[0]?.type, "audio");
    } finally {
      globalThis.fetch = original;
    }
  });
});
