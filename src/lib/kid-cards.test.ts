import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildKidCard, KID_CARDS } from "./kid-cards";

const BANNED = [/kill/i, /death/i, /quarry/i, /stat total/i, /capture rate/i, /base stat/i];

describe("cards for ages 8 to 12", () => {
  it("ships facts and guess who", () => {
    assert.deepEqual(
      KID_CARDS.map((card) => card.id),
      ["meet", "guess"],
    );
    assert.equal(KID_CARDS[0]?.title, "Facts");
    assert.equal(KID_CARDS[1]?.title, "Guess Who");
  });

  it("tells the child how to use the player before any facts", () => {
    for (const card of KID_CARDS) {
      const start = card.chapters[0];
      assert.equal(start?.overlay, "Go");
      const script = start?.tracks.map((track) => track.text).join(" ") ?? "";
      assert.match(script, /picture/i);
      assert.match(script, /press/i);
      assert.ok(card.chapters.length <= 12);
    }
  });

  it("keeps every spoken part short, kind, and tied to a pixel", () => {
    for (const card of KID_CARDS) {
      const overlays = new Set<string>();
      for (const chapter of card.chapters) {
        assert.equal(overlays.has(chapter.overlay), false);
        overlays.add(chapter.overlay);
        assert.ok(chapter.icon.startsWith("yoto:#"));
        assert.ok(chapter.picture.length > 0);
        for (const track of chapter.tracks) {
          assert.ok(track.text.length > 40);
          assert.ok(track.text.length < 700);
          assert.ok(track.icon.startsWith("yoto:#"));
          for (const banned of BANNED) assert.doesNotMatch(track.text, banned);
          assert.doesNotMatch(track.text, /\b(feet|foot|pounds|pound)\b/i);
          if (card.id === "meet" && chapter.key !== "start") {
            assert.match(track.text, /metre|kilogram/i);
          }
        }
      }
    }
  });

  it("makes Guess Who a two-part riddle that changes the picture", () => {
    const guess = KID_CARDS.find((card) => card.id === "guess");
    assert.ok(guess);
    const riddles = guess.chapters.slice(1);
    assert.equal(riddles.length, 9);
    const wailord = riddles.find((chapter) => chapter.key === "wailord");
    assert.ok(wailord);
    const spoken = wailord.tracks.map((track) => track.text).join(" ");
    assert.match(spoken, /14\.5 metres/);
    assert.match(spoken, /398 kilograms/);
    for (const riddle of riddles) {
      assert.equal(riddle.tracks.length, 2);
      assert.match(riddle.tracks[0]?.text ?? "", /One\. Two\. Three\./);
      assert.equal(riddle.tracks[0]?.icon, riddle.icon);
      assert.notEqual(riddle.tracks[1]?.icon, riddle.tracks[0]?.icon);
      assert.match(riddle.tracks[1]?.text ?? "", /^It is /);
    }
  });

  it("builds a Yoto playlist with one chapter per picture", () => {
    const meet = KID_CARDS[0];
    assert.ok(meet);
    const payload = buildKidCard(meet, "card-meet");
    assert.equal(payload.cardId, "card-meet");
    assert.equal(payload.title, "Champdex: Pokémon Facts");
    assert.equal(payload.content.chapters.length, meet.chapters.length);
    assert.equal(payload.content.chapters[1]?.title, "Bulbasaur");
    assert.equal(payload.content.chapters[1]?.tracks[0]?.type, "elevenlabs");
  });
});
