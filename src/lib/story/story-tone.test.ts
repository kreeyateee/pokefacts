import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LILY_VOICE_ID } from "@/lib/kid-cards";
import { safariAdventure } from "@/lib/story/safari";
import { storyCard } from "@/lib/story/story-card";
import { trackParts, withStoryTone, type StoryCharacter, type VoiceStyle } from "@/lib/story/story-voices";
import { hasVoiceTags } from "@/lib/voice-tags";

const NARRATOR = { narrator: true };
const CHARACTER = { narrator: false };

describe("the tone of an adventure's lines", () => {
  it("reads a let-down sadly, sneaking in a whisper, an exclamation excited and a question curious", () => {
    assert.equal(withStoryTone("When you look round, it has gone.", NARRATOR), "{sadly} When you look round, it has gone.");
    assert.equal(withStoryTone("It broke free!", NARRATOR), "{sadly} It broke free!");
    assert.equal(withStoryTone("You creep closer.", NARRATOR), "{whispers} You creep closer.");
    assert.equal(withStoryTone("Gotcha!", NARRATOR), "{excited} Gotcha!");
    assert.equal(withStoryTone("Which one is it?", NARRATOR), "{curious} Which one is it?");
  });

  it("gives a character's other lines their mood, cheerful unless the story says otherwise", () => {
    assert.equal(withStoryTone("Common ones, just throw the ball,", CHARACTER), "{cheerfully} Common ones, just throw the ball,");
    assert.equal(withStoryTone("I know it.", { narrator: false, mood: "smugly" }), "{smugly} I know it.");
    // A mood the voices don't know is not passed on.
    assert.equal(withStoryTone("I know it.", { narrator: false, mood: "grumpily" }), "{cheerfully} I know it.");
  });

  it("leaves the narrator's plain sentences, and any line the story already tagged, as written", () => {
    assert.equal(withStoryTone("The path forks.", NARRATOR), "The path forks.");
    assert.equal(withStoryTone("{laughs} Boo!", CHARACTER), "{laughs} Boo!");
    assert.equal(withStoryTone("   ", CHARACTER), "   ");
  });

  it("never tags a name recorded on its own, so it stays reusable", () => {
    const narrator: VoiceStyle = { voiceId: LILY_VOICE_ID, pitch: 0, tempo: 1 };
    const rival: StoryCharacter = { id: "barnaby", name: "Barnaby", voices: [LILY_VOICE_ID], pitch: 2, mood: "smugly" };
    const voices = { narrator, barnaby: { voiceId: LILY_VOICE_ID, pitch: 2, tempo: 1 } };
    const parts = trackParts("'Mia, I caught one!' says Barnaby.", voices, [rival], (text) => text, {
      slots: ["Mia"],
      tone: true,
    });
    assert.deepEqual(
      parts?.map((part) => ("text" in part ? part.text : "")),
      ["Mia,", "{excited} I caught one!", "says Barnaby."],
    );
    const plain = trackParts("'Mia, I caught one!' says Barnaby.", voices, [rival], (text) => text, { slots: ["Mia"] });
    assert.equal(plain?.some((part) => "text" in part && hasVoiceTags(part.text)), false, "off unless asked for");
  });

  it("tones several times more of a real Safari card's lines than the story tags itself", () => {
    const { card } = storyCard(safariAdventure({ seed: 2024, owner: "Mia" }), { voiceId: LILY_VOICE_ID });
    const lines = card.chapters.flatMap((chapter) =>
      chapter.tracks.flatMap((track) => (track.parts ?? []).filter((part) => "text" in part)),
    );
    const toned = lines.filter((part) => "text" in part && hasVoiceTags(part.text)).length;
    // The story itself tags about 6% of its lines; with the tone rules it is several times that.
    assert.ok(toned / lines.length > 0.3, `${toned} of ${lines.length} lines have a tone`);
  });
});
