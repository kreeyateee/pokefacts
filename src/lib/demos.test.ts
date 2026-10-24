import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { cleanFeedback, DEMOS, demoTrackSrc, FEEDBACK_NOTE_LIMIT, findDemo } from "@/lib/demos";

describe("demos", () => {
  it("has an MP3 for every track", () => {
    for (const demo of DEMOS) {
      for (const track of demo.tracks) {
        assert.ok(existsSync(path.join("public", demoTrackSrc(demo, track))), `${demo.slug} ${track.id}`);
      }
    }
  });

  it("has 19 bird tracks and 10 Pokémon tracks", () => {
    assert.equal(findDemo("animalia-birds")?.tracks.length, 19);
    assert.equal(findDemo("pokefacts")?.tracks.length, 10);
  });

  it("keeps feedback about a real track", () => {
    assert.deepEqual(cleanFeedback({ slug: "pokefacts", track: "quick-04-pikachu", vote: "up", note: "  Great   voice " }), {
      slug: "pokefacts",
      track: "quick-04-pikachu",
      vote: "up",
      note: "Great voice",
    });
    assert.deepEqual(cleanFeedback({ slug: "pokefacts", track: "", vote: "sideways", note: "Overall nice" }), {
      slug: "pokefacts",
      track: "",
      vote: null,
      note: "Overall nice",
    });
  });

  it("turns away feedback about nothing", () => {
    assert.equal(cleanFeedback(null), null);
    assert.equal(cleanFeedback({ slug: "nope", vote: "up" }), null);
    assert.equal(cleanFeedback({ slug: "pokefacts", track: "quick-99-mew", vote: "up" }), null);
    assert.equal(cleanFeedback({ slug: "pokefacts", track: "", vote: null, note: "   " }), null);
  });

  it("cuts a long note", () => {
    const row = cleanFeedback({ slug: "pokefacts", note: "a".repeat(5000) });
    assert.equal(row?.note.length, FEEDBACK_NOTE_LIMIT);
  });
});
