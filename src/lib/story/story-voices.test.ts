import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PIPER_VOICE_ID } from "../piper-voice";
import { YOTO_VOICES } from "../yoto-icons";
import { SAFARI_CAST } from "./safari";
import { CATCH_SOUND_PATH, STORY_SOUNDS, withoutCues } from "./story-sound";
import { RECONNECT_YOTO } from "../yoto-error";
import { labsRefusal, sendSummary, speechKey } from "../yoto-fact-audio";
import {
  castVoices,
  fallbackVoices,
  NARRATOR,
  partKey,
  piperParts,
  readTrackParts,
  slotPieces,
  speakerLines,
  storyChunks,
  trackParts,
  type SpeakerLine,
  type TrackPart,
} from "./story-voices";
import { adventureSendId, pollFailureFallsBack, VOICE_FALLBACK_NOTE } from "./voice-fallback";

const voice = (name: string) => YOTO_VOICES.find((item) => item.name === name)?.id as string;
const [LILY, GEORGE, ALICE, MATILDA, LIAM, WILL] = ["Lily", "George", "Alice", "Matilda", "Liam", "Will"].map(voice) as [
  string,
  string,
  string,
  string,
  string,
  string,
];

function who(lines: SpeakerLine[]): string[] {
  return lines.map((line) =>
    "sound" in line ? `[${line.sound}]` : "cry" in line ? `[cry ${line.cry}]` : `${line.speaker}: ${line.text}`,
  );
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

  it("plays a cry where it is cued, and only for a real Pokédex number", () => {
    const lines = speakerLines("Basil sends out [cry:74] Geodude! 'Go,' says Marigold.", SAFARI_CAST);
    assert.deepEqual(who(lines), [
      "narrator: Basil sends out",
      "[cry 74]",
      "narrator: Geodude!",
      "marigold: Go,",
      "narrator: says Marigold.",
    ]);
    assert.equal(withoutCues("Out comes [cry:25] Pikachu! [hit]"), "Out comes Pikachu!");
    assert.deepEqual(who(speakerLines("A [cry:0] and a [cry:9999].", SAFARI_CAST)), ["narrator: A [cry:0] and a [cry:9999]."]);
  });
});

describe("story voices", () => {
  it("reads the narration in the Settings voice and gives each character a real voice of their own", () => {
    const voices = castVoices(LILY, SAFARI_CAST);
    assert.deepEqual(voices[NARRATOR], { voiceId: LILY, pitch: 0, tempo: 1 });
    assert.deepEqual(voices.marigold, { voiceId: ALICE, pitch: 0, tempo: 0.97 });
    assert.deepEqual(voices.barnaby, { voiceId: LIAM, pitch: 0, tempo: 1.03 });
    const george = castVoices(GEORGE, SAFARI_CAST);
    assert.equal(george.marigold?.voiceId, ALICE);
    assert.equal(george.barnaby?.voiceId, LIAM);
  });

  it("moves a character off the narrator's voice", () => {
    assert.equal(castVoices(ALICE, SAFARI_CAST).marigold?.voiceId, MATILDA);
    assert.equal(castVoices(LIAM, SAFARI_CAST).barnaby?.voiceId, WILL);
  });

  it("gives every speaker a Piper voice to fall back to, told apart by pitch and speed", () => {
    const backup = fallbackVoices(SAFARI_CAST);
    for (const id of [NARRATOR, "marigold", "barnaby"]) assert.equal(backup[id]?.voiceId, PIPER_VOICE_ID);
    assert.ok((backup.marigold?.pitch ?? 0) < 0 && (backup.barnaby?.pitch ?? 0) > 0);
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

describe("names recorded on their own", () => {
  it("cuts a line around the names, keeping the punctuation with the name", () => {
    assert.deepEqual(slotPieces("Click! It's a Dodrio! Its three heads argue.", ["Dodrio"]), [
      { text: "Click! It's a", slot: false },
      { text: "Dodrio!", slot: true },
      { text: "Its three heads argue.", slot: false },
    ]);
    assert.deepEqual(slotPieces("Morning, Mia.", ["Mia", "Mr Mime"]), [
      { text: "Morning,", slot: false },
      { text: "Mia.", slot: true },
    ]);
  });

  it("only cuts whole names, longest first", () => {
    assert.deepEqual(slotPieces("Mia's hat", ["Mia"]), [
      { text: "Mia's", slot: true },
      { text: "hat", slot: false },
    ]);
    assert.deepEqual(slotPieces("Miami beach", ["Mia"]), [{ text: "Miami beach", slot: false }]);
    assert.deepEqual(
      slotPieces("A Kabutops, not a Kabuto.", ["Kabuto", "Kabutops"]).map((piece) => piece.text),
      ["A", "Kabutops,", "not a", "Kabuto."],
    );
    assert.deepEqual(slotPieces("No names here.", []), [{ text: "No names here.", slot: false }]);
  });

  it("never cuts a sentence around a name: the name is read in its sentence", () => {
    const voices = castVoices(LILY, SAFARI_CAST);
    const options = { slots: ["Dodrio", "Ditto"], fallback: fallbackVoices(SAFARI_CAST), sentences: true };
    const parts = trackParts("Click! It's a Dodrio! [fanfare]", voices, SAFARI_CAST, (w) => w, options) ?? [];
    assert.deepEqual(
      parts.flatMap((part) => ("text" in part ? [part.text] : [])),
      ["Click!", "It's a Dodrio!"],
    );
    assert.ok(parts.every((part) => !("tight" in part)), "nothing is spliced in mid-sentence");
    const [first] = parts;
    assert.deepEqual(first && "fallback" in first ? first.fallback : undefined, fallbackVoices(SAFARI_CAST)[NARRATOR]);
  });

  it("keeps a line's recording under its words and voice alone", () => {
    assert.equal(speechKey("Click! It's a", LILY), speechKey("Click! It's a", LILY));
    assert.notEqual(speechKey("Click! It's a", LILY), speechKey("Click! It's a", ALICE));
    assert.notEqual(speechKey("Dodrio!", LILY), speechKey("Dodrio.", LILY));
    assert.match(speechKey("Dodrio!", LILY), /^[a-f0-9]{64}$/);
  });
});

describe("falling back to Piper", () => {
  it("decides from Yoto's answer", () => {
    assert.equal(labsRefusal(429), "piper", "a 429 that outlasted the retries");
    assert.equal(labsRefusal(400), "piper");
    assert.equal(labsRefusal(403), "piper", "a voice Yoto no longer offers");
    assert.equal(labsRefusal(404), "piper");
    assert.equal(labsRefusal(undefined, true), "piper", "a failed recording job");
    assert.equal(labsRefusal(401), "reconnect");
    assert.equal(labsRefusal(500), "retry");
    assert.equal(labsRefusal(503), "retry");
    assert.equal(labsRefusal(undefined), "retry");
  });

  it("decides from what the browser saw while waiting for a recording", () => {
    assert.equal(pollFailureFallsBack({ message: "Yoto could not finish the recording." }), true);
    assert.equal(pollFailureFallsBack({ message: "Timed out", gateway: true }), false);
    assert.equal(pollFailureFallsBack({ message: RECONNECT_YOTO }), false);
  });

  it("swaps every line for its Piper voice, and only accepts Piper as a fallback", () => {
    const parts = trackParts("'Boo to you.' Barnaby grins.", castVoices(LILY, SAFARI_CAST), SAFARI_CAST, (w) => w, {
      fallback: fallbackVoices(SAFARI_CAST),
    }) as TrackPart[];
    const piper = piperParts(parts);
    assert.ok(piper.every((part) => !("voiceId" in part) || part.voiceId === PIPER_VOICE_ID));
    assert.deepEqual(readTrackParts(JSON.parse(JSON.stringify(parts))), parts);
    assert.equal(readTrackParts([{ text: "Hi", voiceId: LILY, fallback: { voiceId: GEORGE } }]), null);
    assert.deepEqual(readTrackParts([{ text: "Hi", voiceId: LILY, tight: true }]), [
      { text: "Hi", voiceId: LILY, pitch: 0, tempo: 1, tight: true },
    ]);
  });

  it("names a send by when it started, and logs counts with no words or names", () => {
    assert.equal(adventureSendId(1_000_000), "slfls");
    const line = sendSummary("slfls", {
      tracks: 3,
      labsNew: 4,
      piperNew: 0,
      cached: 9,
      refused429: 1,
      refusedOther: 0,
      failedJobs: 0,
      fallback: true,
    });
    assert.equal(
      line,
      "[adventure voices] send slfls: 3 tracks, 4 new Yoto voice lines, 0 new Piper lines, 9 reused; refused 429 x1, other x0, failed jobs x0, reading with Piper",
    );
    assert.match(VOICE_FALLBACK_NOTE, /Piper/);
  });
});

describe("track parts", () => {
  const voices = castVoices(LILY, SAFARI_CAST);

  it("records a plain narrator line as before", () => {
    assert.equal(trackParts("Press left to throw a rock.", voices, SAFARI_CAST), null);
  });

  it("gives each whole sentence its voice and keeps the catch sound in order", () => {
    const parts = trackParts("The ball flies. [catch] 'Gotcha!' Marigold punches the air.", voices, SAFARI_CAST, (words) =>
      words.toUpperCase(),
    );
    assert.deepEqual(parts, [
      { text: "THE BALL FLIES.", ...voices[NARRATOR] },
      { sound: "catch" },
      { text: "GOTCHA!", ...voices.marigold },
      { text: "MARIGOLD PUNCHES THE AIR.", ...voices[NARRATOR] },
    ]);
  });

  it("never cuts a sentence between a quote and who said it: the narrator reads it whole", () => {
    const parts = trackParts("The ball flies. [catch] 'Gotcha,' says Marigold. 'Boo!' he says.", voices, SAFARI_CAST);
    assert.deepEqual(
      parts?.map((part) => ("text" in part ? [part.text, part.voiceId === voices[NARRATOR]?.voiceId] : ["sound"])),
      [
        ["The ball flies.", true],
        ["sound"],
        ["Gotcha, says Marigold. Boo! he says.", true],
      ],
    );
  });

  it("checks parts from a request", () => {
    const parts = trackParts("'Boo to you.' Barnaby grins.", voices, SAFARI_CAST) ?? [];
    assert.deepEqual(readTrackParts(JSON.parse(JSON.stringify(parts))), parts);
    assert.equal(readTrackParts([]), null);
    assert.equal(readTrackParts([{ sound: "explosion" }]), null);
    assert.equal(readTrackParts([{ sound: "catch" }]), null, "a track needs at least one spoken line");
    const withCry = trackParts("Out comes [cry:25] Pikachu!", voices, SAFARI_CAST) ?? [];
    assert.deepEqual(withCry[1], { cry: 25 });
    assert.deepEqual(readTrackParts(JSON.parse(JSON.stringify(withCry))), withCry);
    assert.equal(readTrackParts([{ cry: 2000 }, { text: "Hi", voiceId: LILY }]), null);
    assert.equal(readTrackParts([{ cry: "25" }, { text: "Hi", voiceId: LILY }]), null);
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
