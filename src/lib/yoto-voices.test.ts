import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LILY_VOICE_ID } from "./kid-cards";
import { voiceOrLily, YOTO_VOICES } from "./yoto-icons";

describe("Yoto voices", () => {
  it("keeps Lily first, then the voices earlier sends saved, in the same order", () => {
    assert.deepEqual(
      YOTO_VOICES.slice(0, 4).map((voice) => voice.name),
      ["Lily", "George", "Brian", "Adam"],
    );
    assert.equal(YOTO_VOICES[0].id, LILY_VOICE_ID);
  });

  it("lists each ElevenLabs voice once, with a 20-character id and a note", () => {
    const ids = YOTO_VOICES.map((voice) => voice.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const voice of YOTO_VOICES) {
      assert.match(voice.id, /^[A-Za-z0-9]{20}$/, `${voice.name} id`);
      assert.ok(voice.note.length > 0, `${voice.name} note`);
    }
  });

  it("accepts every listed voice and turns anything else into Lily", () => {
    for (const voice of YOTO_VOICES) assert.equal(voiceOrLily(voice.id), voice.id);
    assert.equal(voiceOrLily("not-a-voice"), LILY_VOICE_ID);
    assert.equal(voiceOrLily(undefined), LILY_VOICE_ID);
  });
});
