import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PIPER_VOICE_ID } from "../piper-voice";
import { YOTO_VOICES } from "../yoto-icons";
import { SAFARI_CAST } from "./safari";
import { CATCH_SOUND_PATH, STORY_SOUNDS, withoutCues } from "./story-sound";
import {
  castVoices,
  NARRATOR,
  partKey,
  readTrackParts,
  speakerLines,
  storyChunks,
  trackParts,
  type SpeakerLine,
} from "./story-voices";

const [LILY, GEORGE, BRIAN] = YOTO_VOICES.map((voice) => voice.id) as [string, string, string];

function who(lines: SpeakerLine[]): string[] {
  return lines.map((line) => ("sound" in line ? `[${line.sound}]` : `${line.speaker}: ${line.text}`));
}

describe("story lines by speaker", () => {
  it("keeps apostrophes inside words and splits on quotes", () => {
    assert.deepEqual(storyChunks("It's Marigold's hat. 'Don't touch it,' she says."), [
      { kind: "narration", text: "It's Marigold's hat." },
      { kind: "quote", text: "Don't touch it," },
      { kind: "narration", text: "she says." },
    ]);
  });

  it("refuses a quote that never closes", () => {
    assert.throws(() => storyChunks("'Hello, says nobody."), /never closes/);
  });

  it("gives each quote to the character the narration names, then to whoever spoke last", () => {
    const text =
      "'Marigold,' she says, shaking your hand. 'Head warden. Forty years.' Behind her, a boy polishes a ball. " +
      "'That's Barnaby,' Marigold mutters. Barnaby smiles. 'I don't say it,' he says. 'I know it.'";
    assert.deepEqual(who(speakerLines(text, SAFARI_CAST)), [
      "marigold: Marigold,",
      "narrator: she says, shaking your hand.",
      "marigold: Head warden. Forty years.",
      "narrator: Behind her, a boy polishes a ball.",
      "marigold: That's Barnaby,",
      "narrator: Marigold mutters. Barnaby smiles.",
      "barnaby: I don't say it,",
      "narrator: he says.",
      "barnaby: I know it.",
    ]);
  });

  it("reads the speaker from just before a quote", () => {
    assert.deepEqual(who(speakerLines("Marigold whispers, 'Grass type.'", SAFARI_CAST)), [
      "narrator: Marigold whispers,",
      "marigold: Grass type.",
    ]);
    assert.deepEqual(who(speakerLines("Barnaby pops up. 'Boo,' he says.", SAFARI_CAST)), [
      "narrator: Barnaby pops up.",
      "barnaby: Boo,",
      "narrator: he says.",
    ]);
  });

  it("does not take a new sentence after a quote as its speaker", () => {
    // "'Thanks!' he calls" names Barnaby; the next quote follows "she says" and is Marigold's.
    const text = "Barnaby walks away. 'Thanks!' he calls. Marigold squints. 'He's caught one,' she says.";
    assert.deepEqual(who(speakerLines(text, SAFARI_CAST)), [
      "narrator: Barnaby walks away.",
      "barnaby: Thanks!",
      "narrator: he calls. Marigold squints.",
      "marigold: He's caught one,",
      "narrator: she says.",
    ]);
  });

  it("does not take a possessive as the speaker", () => {
    assert.deepEqual(who(speakerLines("Barnaby's ball rolls away. 'Oh dear,' says Marigold.", SAFARI_CAST)), [
      "narrator: Barnaby's ball rolls away.",
      "marigold: Oh dear,",
      "narrator: says Marigold.",
    ]);
  });

  it("puts a sound cue in its place and never reads it", () => {
    const lines = speakerLines("The ball flies. [catch] Gotcha! 'Well thrown,' says Marigold.", SAFARI_CAST);
    assert.deepEqual(who(lines), [
      "narrator: The ball flies.",
      "[catch]",
      "narrator: Gotcha!",
      "marigold: Well thrown,",
      "narrator: says Marigold.",
    ]);
    assert.equal(withoutCues("The ball flies. [catch] Gotcha!"), "The ball flies. Gotcha!");
  });

  it("leaves an unknown cue as words", () => {
    assert.deepEqual(who(speakerLines("A [mystery] noise.", SAFARI_CAST)), ["narrator: A [mystery] noise."]);
  });
});

describe("story voices", () => {
  it("reads the narration in the Settings voice and gives each character a different one", () => {
    const voices = castVoices(LILY, SAFARI_CAST);
    assert.deepEqual(voices[NARRATOR], { voiceId: LILY, pitch: 0, tempo: 1 });
    assert.equal(voices.marigold?.voiceId, LILY);
    assert.ok((voices.marigold?.pitch ?? 0) < 0, "Marigold is lower and older");
    assert.ok((voices.marigold?.tempo ?? 1) < 1, "and a touch slower");
    assert.equal(voices.barnaby?.voiceId, GEORGE);
    assert.ok((voices.barnaby?.pitch ?? 0) > 0, "Barnaby is younger");
    assert.ok((voices.barnaby?.tempo ?? 1) > 1, "and quicker");
  });

  it("moves Barnaby off George when George is the narrator", () => {
    const voices = castVoices(GEORGE, SAFARI_CAST);
    assert.equal(voices[NARRATOR]?.voiceId, GEORGE);
    assert.equal(voices.barnaby?.voiceId, BRIAN);
    assert.equal(voices.marigold?.voiceId, LILY);
  });

  it("keeps every character on Piper when Piper narrates, told apart by pitch and speed", () => {
    const voices = castVoices(PIPER_VOICE_ID, SAFARI_CAST);
    for (const id of [NARRATOR, "marigold", "barnaby"]) assert.equal(voices[id]?.voiceId, PIPER_VOICE_ID);
    const styles = new Set([NARRATOR, "marigold", "barnaby"].map((id) => `${voices[id]?.pitch}/${voices[id]?.tempo}`));
    assert.equal(styles.size, 3);
  });

  it("falls back to Lily for an unknown narrator voice", () => {
    assert.equal(castVoices("not-a-voice", SAFARI_CAST)[NARRATOR]?.voiceId, LILY);
  });
});

describe("track parts", () => {
  const voices = castVoices(LILY, SAFARI_CAST);

  it("records a plain narrator line as before", () => {
    assert.equal(trackParts("Press left to throw a rock.", voices, SAFARI_CAST), null);
  });

  it("gives each line its voice and keeps the catch sound in order", () => {
    const parts = trackParts("The ball flies. [catch] 'Gotcha,' says Marigold.", voices, SAFARI_CAST, (words) =>
      words.toUpperCase(),
    );
    assert.deepEqual(parts, [
      { text: "THE BALL FLIES.", ...voices[NARRATOR] },
      { sound: "catch" },
      { text: "GOTCHA,", ...voices.marigold },
      { text: "SAYS MARIGOLD.", ...voices[NARRATOR] },
    ]);
  });

  it("checks parts from a request", () => {
    const parts = trackParts("'Boo,' he says.", voices, SAFARI_CAST) ?? [];
    assert.deepEqual(readTrackParts(JSON.parse(JSON.stringify(parts))), parts);
    assert.equal(readTrackParts([]), null);
    assert.equal(readTrackParts([{ sound: "explosion" }]), null);
    assert.equal(readTrackParts([{ sound: "catch" }]), null, "a track needs at least one spoken line");
    assert.equal(readTrackParts([{ text: "Hi", voiceId: 7 }]), null);
    assert.equal(readTrackParts([{ text: "x".repeat(3001), voiceId: LILY }]), null);
    const clamped = readTrackParts([{ text: "Hi", voiceId: "nobody", pitch: 40, tempo: 9 }]);
    assert.deepEqual(clamped, [{ text: "Hi", voiceId: LILY, pitch: 6, tempo: 1.25 }]);
  });

  it("keys a line by its words and voice", () => {
    assert.equal(partKey({ text: "Hello", voiceId: LILY }), partKey({ text: "Hello", voiceId: LILY }));
    assert.notEqual(partKey({ text: "Hello", voiceId: LILY }), partKey({ text: "Hello", voiceId: GEORGE }));
    assert.match(partKey({ text: "Hello", voiceId: LILY }), /^[a-z0-9]{1,16}$/);
  });

  it("serves the catch sound from one path", () => {
    assert.equal(STORY_SOUNDS.catch, CATCH_SOUND_PATH);
    assert.match(CATCH_SOUND_PATH, /^\/sounds\/.+\.mp3$/);
  });
});
