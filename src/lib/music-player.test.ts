import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PLAYER_STATE,
  lookupQueue,
  needsLookup,
  readVideoLookup,
  songVideoId,
  songVideoNote,
  type VideoLookup,
} from "./music-player";

const STORED = "R4GIyJxvk94";
const FOUND = "7Vmw9xqaryM";

describe("music player video", () => {
  it("plays the stored id at once and only looks up a song without one", () => {
    const stored = { page: "Pokémon_Theme", youtubeId: STORED };
    const bare = { page: "Pokérap", youtubeId: null };
    assert.equal(songVideoId(stored, undefined), STORED);
    assert.equal(songVideoId(stored, { state: "found", youtubeId: FOUND }), STORED);
    assert.equal(needsLookup(stored, undefined), false);

    assert.equal(songVideoId(bare, undefined), null);
    assert.equal(needsLookup(bare, undefined), true);
    assert.equal(songVideoId(bare, { state: "found", youtubeId: FOUND }), FOUND);
    assert.equal(needsLookup(bare, { state: "none" }), false);
    assert.equal(needsLookup(bare, { state: "error" }), false);
  });

  it("looks up the selected song first and skips songs that are known", () => {
    const songs = [
      { page: "A", youtubeId: null },
      { page: "B", youtubeId: STORED },
      { page: "C", youtubeId: null },
      { page: "D", youtubeId: null },
    ];
    const lookups: Record<string, VideoLookup> = { D: { state: "none" } };
    assert.deepEqual(lookupQueue(songs, "C", lookups), ["C", "A"]);
    assert.deepEqual(lookupQueue(songs, "B", lookups), ["A", "C"]);
    assert.deepEqual(lookupQueue(songs, undefined, { ...lookups, A: { state: "error" } }), ["C"]);
  });

  it("tells a missing video apart from a failed lookup", () => {
    assert.deepEqual(readVideoLookup(true, { youtubeId: FOUND }), { state: "found", youtubeId: FOUND });
    assert.deepEqual(readVideoLookup(true, { youtubeId: null }), { state: "none" });
    assert.deepEqual(readVideoLookup(true, { youtubeId: "not an id" }), { state: "error" });
    assert.deepEqual(readVideoLookup(false, { error: "Bulbapedia did not answer." }), { state: "error" });
    assert.deepEqual(readVideoLookup(true, null), { state: "error" });
  });

  it("explains why there is no video, and says nothing when there is one", () => {
    assert.equal(songVideoNote({ videoId: STORED, lookup: undefined, gap: "missingtitle" }), "");
    assert.equal(
      songVideoNote({ videoId: null, lookup: undefined, gap: "missingtitle" }),
      "Bulbapedia does not have a page for this song.",
    );
    assert.equal(
      songVideoNote({ videoId: null, lookup: undefined, gap: "http" }),
      "This song page did not load from Bulbapedia.",
    );
    assert.equal(songVideoNote({ videoId: null, lookup: undefined }), "Finding this song on YouTube…");
    assert.equal(songVideoNote({ videoId: null, lookup: { state: "none" } }), "No YouTube video was found for this song.");
    assert.equal(songVideoNote({ videoId: null, lookup: { state: "error" } }), "YouTube could not be searched just now.");
  });

  it("names the YouTube player states", () => {
    assert.equal(PLAYER_STATE.ENDED, 0);
    assert.equal(PLAYER_STATE.PLAYING, 1);
    assert.equal(PLAYER_STATE.PAUSED, 2);
    assert.equal(PLAYER_STATE.BUFFERING, 3);
  });
});
