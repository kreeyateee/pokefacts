import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildKidCard, KID_CARDS } from "./kid-cards";

const BANNED = [/kill/i, /death/i, /quarry/i, /stat total/i, /capture rate/i, /base stat/i];

describe("cards a seven-year-old can play", () => {
  it("ships three cards, with Meet Them first", () => {
    assert.deepEqual(
      KID_CARDS.map((card) => card.id),
      ["meet", "guess", "grow"],
    );
    assert.equal(KID_CARDS[0]?.recommended, true);
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
        }
      }
    }
  });

  it("makes Guess Who a two-part riddle that changes the picture", () => {
    const guess = KID_CARDS.find((card) => card.id === "guess");
    assert.ok(guess);
    const riddles = guess.chapters.slice(1);
    assert.equal(riddles.length, 8);
    for (const riddle of riddles) {
      assert.equal(riddle.tracks.length, 2);
      assert.match(riddle.tracks[0]?.text ?? "", /One\. Two\. Three\./);
      assert.equal(riddle.tracks[0]?.icon, riddle.icon);
      assert.notEqual(riddle.tracks[1]?.icon, riddle.tracks[0]?.icon);
      assert.match(riddle.tracks[1]?.text ?? "", /^It is /);
    }
  });

  it("walks Grow Up from picture to picture", () => {
    const grow = KID_CARDS.find((card) => card.id === "grow");
    assert.ok(grow);
    const body = grow.chapters.slice(1);
    assert.equal(body.length, 9);
    body.slice(0, 8).forEach((chapter, index) => {
      assert.match(chapter.tracks[0]?.text ?? "", new RegExp(`number ${index + 2}`, "i"));
    });
    assert.match(body[8]?.tracks[0]?.text ?? "", /back to number 1/i);
    assert.match(grow.chapters[0]?.tracks[0]?.text ?? "", /plant family/);
  });

  it("builds a Yoto playlist with one chapter per picture", () => {
    const meet = KID_CARDS[0];
    assert.ok(meet);
    const payload = buildKidCard(meet, "card-meet");
    assert.equal(payload.cardId, "card-meet");
    assert.equal(payload.title, "Champdex: Meet Them");
    assert.equal(payload.content.chapters.length, meet.chapters.length);
    assert.equal(payload.content.chapters[1]?.title, "Bulbasaur");
    assert.equal(payload.content.chapters[1]?.tracks[0]?.type, "elevenlabs");
  });
});
