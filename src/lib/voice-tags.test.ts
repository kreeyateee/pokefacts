import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { forElevenLabs, hasVoiceTags, withoutVoiceTags } from "./voice-tags";

describe("voice tags", () => {
  it("turns brace tags into ElevenLabs audio tags", () => {
    assert.equal(forElevenLabs("{excited} Wow! {whispers} Shh."), "[excited] Wow! [whispers] Shh.");
    assert.equal(forElevenLabs("{Laughs} Ha!"), "[laughs] Ha!");
    assert.equal(forElevenLabs("{ sighs } Oh well."), "[sighs] Oh well.");
  });

  it("leaves story sound cues and plain text alone", () => {
    assert.equal(forElevenLabs("You throw. [catch] Gotcha! [cry:25]"), "You throw. [catch] Gotcha! [cry:25]");
    assert.equal(forElevenLabs("No tags here."), "No tags here.");
    assert.equal(withoutVoiceTags("You throw. [catch] Gotcha!"), "You throw. [catch] Gotcha!");
  });

  it("drops tags cleanly for Piper and the page", () => {
    assert.equal(withoutVoiceTags("{excited} Wow! {whispers} Shh."), "Wow! Shh.");
    assert.equal(withoutVoiceTags("It's a Pikachu {laughs}!"), "It's a Pikachu!");
    assert.equal(withoutVoiceTags("Line one.\n{gasps} Line two."), "Line one.\nLine two.");
  });

  it("ignores braces that are not tags", () => {
    assert.equal(forElevenLabs("{1} and {}"), "{1} and {}");
    assert.equal(hasVoiceTags("{excited} Hi"), true);
    assert.equal(hasVoiceTags("Hi [catch]"), false);
  });
});

describe("contentForElevenLabs", () => {
  it("tags only the spoken tracks of a card", async () => {
    const { contentForElevenLabs } = await import("./voice-tags");
    const card = {
      title: "Test",
      content: {
        chapters: [
          {
            key: "a",
            tracks: [
              { key: "1", type: "elevenlabs", trackUrl: "{excited} Pikachu!" },
              { key: "2", type: "audio", trackUrl: "yoto:#abc" },
            ],
          },
        ],
      },
    };
    const sent = contentForElevenLabs(card);
    assert.equal(sent.content.chapters[0]?.tracks[0]?.trackUrl, "[excited] Pikachu!");
    assert.equal(sent.content.chapters[0]?.tracks[1]?.trackUrl, "yoto:#abc");
    assert.equal(card.content.chapters[0]?.tracks[0]?.trackUrl, "{excited} Pikachu!");
  });
});
