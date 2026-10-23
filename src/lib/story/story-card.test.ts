import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST as postJob } from "../../app/api/yoto/job/route";
import { buildKidCard, LILY_VOICE_ID, type KidCard } from "../kid-cards";
import { YOTO_ICONS } from "../yoto-icons";
import type { YotoContent, YotoTrackEvents } from "../kid-cards";
import {
  applyFinishedAudio,
  contentCreateBody,
  renderJobs,
  type FinishedAudio,
  type PlaylistUpload,
} from "../yoto-send";
import { STORY_CONFIG, STORY_EDIT_SETTINGS, storyCard, storyPixels } from "./story-card";
import { smallStory } from "./story-fixture";

type Nested = YotoContent["content"];

function nested(content: PlaylistUpload["content"]): Nested {
  return content.content as Nested;
}

function trackEvents(upload: PlaylistUpload, key: string): YotoTrackEvents | undefined {
  for (const chapter of nested(upload.content).chapters) {
    const track = chapter.tracks.find((item) => item.key === key);
    if (track) return track.events;
  }
  return undefined;
}

const MEDIA = { realById: { 113: "real113" }, shadowById: { 113: "shadow113" } };

function compiled() {
  return storyCard(smallStory(), { voiceId: LILY_VOICE_ID, ...MEDIA });
}

/** Every track recorded, as the studio's track loop would return it. */
function recorded(upload: PlaylistUpload, card: KidCard): PlaylistUpload {
  const audio: Record<string, FinishedAudio> = {};
  for (const job of renderJobs(card.libraryTitle, card, upload)) {
    audio[job.key] = { trackUrl: `yoto:#audio-${job.key}`, duration: 12, fileSize: 3000, format: "mp3", channels: "mono" };
  }
  return applyFinishedAudio(upload, audio);
}

function jobRequest(body: unknown): Request {
  return new Request("http://localhost/api/yoto/job", {
    method: "POST",
    headers: { Authorization: `Bearer ${"x".repeat(24)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("storyCard", () => {
  it("compiles one chapter per node, start first, with node ids as keys", () => {
    const { card, upload } = compiled();
    assert.deepEqual(
      card.chapters.map((chapter) => chapter.key),
      ["gate", "lake", "grass", "rock", "catch"],
    );
    assert.deepEqual(
      nested(upload.content).chapters.map((chapter) => [chapter.key, chapter.tracks.map((track) => track.key)]),
      [
        ["gate", ["gatea"]],
        ["lake", ["lakea"]],
        ["grass", ["grassa", "grassq"]],
        ["rock", ["rocka"]],
        ["catch", ["catcha"]],
      ],
    );
    assert.deepEqual(
      card.chapters.map((chapter) => chapter.tracks.map((track) => track.key)),
      nested(upload.content).chapters.map((chapter) => chapter.tracks.map((track) => track.key)),
    );
    assert.equal(upload.create, true);
    assert.equal(upload.voiceId, LILY_VOICE_ID);
    assert.equal(card.kind, "story");
  });

  it("sets Yoto's interactive playback settings", () => {
    const { upload } = compiled();
    const content = nested(upload.content);
    assert.equal(content.playbackType, "interactive");
    assert.deepEqual(content.config, {
      autoadvance: "none",
      disableTrackNav: true,
      disableChapterNav: true,
      resumeTimeout: 2592000,
    });
    assert.deepEqual(content.editSettings, { autoOverlayLabels: "chapters", editKeys: false, interactiveContent: true });
    assert.deepEqual(content.config, STORY_CONFIG);
    assert.deepEqual(content.editSettings, STORY_EDIT_SETTINGS);
  });

  it("carries a scene on to the next node's first track", () => {
    assert.deepEqual(trackEvents(compiled().upload, "gatea"), {
      onEnd: { cmd: "goto", params: { chapterKey: "grass", trackKey: "grassa" } },
    });
  });

  it("loops a choice's question until a button is pressed", () => {
    const { upload } = compiled();
    assert.deepEqual(trackEvents(upload, "grassq"), {
      onLhb: { cmd: "goto", params: { chapterKey: "lake", trackKey: "lakea" } },
      onRhb: { cmd: "goto", params: { chapterKey: "rock", trackKey: "rocka" } },
      onEnd: { cmd: "goto", params: { chapterKey: "grass", trackKey: "grassq" } },
    });
    const question = nested(upload.content).chapters[2]?.tracks[1];
    assert.equal(question?.trackUrl, "Press left to head for the lake. Press right to throw a rock.");
  });

  it("takes an early press during the choice narration", () => {
    assert.deepEqual(trackEvents(compiled().upload, "grassa"), {
      onLhb: { cmd: "goto", params: { chapterKey: "lake", trackKey: "lakea" } },
      onRhb: { cmd: "goto", params: { chapterKey: "rock", trackKey: "rocka" } },
      onEnd: { cmd: "goto", params: { chapterKey: "grass", trackKey: "grassq" } },
    });
  });

  it("says which ending it was, then starts the card again from the beginning", () => {
    const { upload } = compiled();
    const restart = { cmd: "goto", params: { chapterKey: "gate", trackKey: "gatea" } };
    assert.deepEqual(trackEvents(upload, "lakea"), { onLhb: restart, onRhb: restart, onEnd: restart });
    const tracks = nested(upload.content).chapters.flatMap((chapter) => chapter.tracks);
    assert.match(
      tracks.find((track) => track.key === "lakea")?.trackUrl ?? "",
      /You found ending 1 of 2\. Now the adventure starts again from the beginning\.$/,
    );
    const golden = tracks.find((track) => track.key === "catcha")?.trackUrl ?? "";
    assert.match(golden, /golden ending/);
    assert.match(golden, /You found ending 2 of 2\. Now the adventure starts again/);
  });

  it("speaks with the chosen voice and respelled names", () => {
    const { upload } = compiled();
    for (const chapter of nested(upload.content).chapters) {
      for (const track of chapter.tracks) {
        assert.equal(track.type, "elevenlabs");
        assert.equal(track.voiceId, LILY_VOICE_ID);
      }
    }
  });

  it("plays the cry before a node's narration, not before its repeating question", () => {
    const { card, upload } = compiled();
    const jobs = renderJobs(card.libraryTitle, card, upload);
    assert.deepEqual(
      jobs.map((job) => [job.key, job.dexId]),
      [
        ["gatea", undefined],
        ["lakea", undefined],
        ["grassa", 113],
        ["grassq", undefined],
        ["rocka", undefined],
        ["catcha", undefined],
      ],
    );
    assert.deepEqual(
      jobs.map((job) => job.progress),
      [1, 2, 3, 4, 5, 6].map((index) => `Safari test, track ${index} of 6`),
    );
    assert.equal(jobs[2]?.text, "Something rustles in the grass.");
  });

  it("uses uploaded pixels, shadows and stock icons", () => {
    assert.deepEqual(storyPixels(smallStory()), { real: [113], shadow: [113], named: [] });
    const { card, upload } = compiled();
    const icons = Object.fromEntries(card.chapters.map((chapter) => [chapter.key, chapter.icon]));
    assert.deepEqual(icons, {
      gate: YOTO_ICONS.book,
      lake: YOTO_ICONS.celebrate,
      grass: "yoto:#shadow113",
      rock: "yoto:#real113",
      catch: "yoto:#abc123",
    });
    const grass = nested(upload.content).chapters[2];
    assert.equal(grass?.display.icon16x16, "yoto:#shadow113");
    assert.deepEqual(grass?.tracks.map((track) => track.display.icon16x16), ["yoto:#shadow113", "yoto:#shadow113"]);
  });

  it("leaves a pixel path when it was not uploaded, so the send stops with a clear error", () => {
    const { card, upload } = storyCard(smallStory());
    assert.equal(card.chapters[2]?.icon, "/pixels/113-shadow.png");
    assert.throws(() => contentCreateBody(recorded(upload, card).content), /Yoto cannot use the picture on Tall grass/);
  });

  it("refuses a story that does not check out", () => {
    const story = smallStory();
    story.start = "cave";
    assert.throws(() => storyCard(story), /Safari test is not ready\. The start node cave is not in the story\./);
  });
});

describe("sending a story card", () => {
  it("keeps every key, event and setting through the finished audio and the create body", () => {
    const { card, upload } = compiled();
    const ready = recorded(upload, card);
    assert.deepEqual(nested(ready.content).playbackType, "interactive");
    const body = contentCreateBody(ready.content);
    const sent = nested(body);
    assert.equal(sent.playbackType, "interactive");
    assert.deepEqual(sent.config, STORY_CONFIG);
    assert.deepEqual(sent.editSettings, STORY_EDIT_SETTINGS);
    const before = nested(upload.content).chapters;
    assert.deepEqual(
      sent.chapters.map((chapter) => [chapter.key, chapter.tracks.map((track) => [track.key, track.events])]),
      before.map((chapter) => [chapter.key, chapter.tracks.map((track) => [track.key, track.events])]),
    );
    const trackKeys = new Map(sent.chapters.map((chapter) => [chapter.key, chapter.tracks.map((track) => track.key)]));
    let gotos = 0;
    for (const chapter of sent.chapters) {
      for (const track of chapter.tracks) {
        assert.equal(track.type, "audio");
        assert.equal(track.trackUrl, `yoto:#audio-${track.key}`);
        assert.equal((track as { uid?: string }).uid, track.key);
        for (const event of Object.values(track.events ?? {})) {
          if (event?.cmd !== "goto") continue;
          gotos += 1;
          assert.ok(trackKeys.get(event.params.chapterKey)?.includes(event.params.trackKey), JSON.stringify(event));
        }
      }
    }
    // 8 between the scenes and choices, and 3 on each of the 2 endings back to the start.
    assert.equal(gotos, 14);
  });

  it("fails instead of renaming a key a jump depends on", () => {
    const { card, upload } = compiled();
    const ready = recorded(upload, card);
    const long = structuredClone(ready.content);
    const longTrack = nested(long).chapters[0]?.tracks[0];
    if (!longTrack) throw new Error("no track");
    longTrack.key = "k".repeat(21);
    assert.throws(() => contentCreateBody(long), /longer than the 20 characters Yoto allows/);

    const twice = structuredClone(ready.content);
    const chapters = nested(twice).chapters;
    const lake = chapters[1];
    if (!lake) throw new Error("no chapter");
    lake.key = "gate";
    assert.throws(() => contentCreateBody(twice), /The key gate is used twice/);
  });

  it("refuses a goto to a track that is not on the card", () => {
    const { card, upload } = compiled();
    const ready = recorded(upload, card);
    const broken = structuredClone(ready.content);
    const gate = nested(broken).chapters[0]?.tracks[0];
    if (!gate) throw new Error("no track");
    gate.events = { onEnd: { cmd: "goto", params: { chapterKey: "grass", trackKey: "grassz" } } };
    assert.throws(() => contentCreateBody(broken), /jumps to grass\/grassz, which is not on this card/);
  });

  it("leaves a normal card's keys and body as they were", () => {
    const card: KidCard = {
      id: "meet-1",
      kind: "meet",
      title: "Pokefacts",
      rangeLabel: "Pokefacts 1 (1)",
      libraryTitle: "Pokefacts 1",
      blurb: "Facts.",
      childDoes: "Press play.",
      chapters: ["same", "same"].map((key) => ({
        key,
        title: "Bulbasaur",
        overlay: "1",
        picture: "this Pokémon",
        mark: "1",
        icon: YOTO_ICONS.star,
        dexId: 1,
        tracks: [{ key: "entry", title: "Bulbasaur", text: "A seed.", spoken: "A seed.", icon: YOTO_ICONS.star, overlay: "1" }],
      })),
    };
    const upload: PlaylistUpload = { voiceId: LILY_VOICE_ID, content: buildKidCard(card) };
    const jobs = renderJobs(card.libraryTitle, card, upload);
    assert.deepEqual(
      jobs.map((job) => [job.key, job.dexId, job.progress]),
      [
        ["same-entry", 1, "Pokefacts 1, track 1 of 2"],
        ["same-entry", 1, "Pokefacts 1, track 2 of 2"],
      ],
    );
    const body = contentCreateBody(
      applyFinishedAudio(upload, {
        "same-entry": { trackUrl: "yoto:#done", duration: 5, fileSize: 100 },
      }).content,
    );
    assert.deepEqual(
      nested(body).chapters.map((chapter) => [chapter.key, chapter.tracks.map((track) => track.key)]),
      [
        ["same", ["same-entry"]],
        ["same2", ["same-entry2"]],
      ],
    );
    assert.equal(nested(body).playbackType, undefined);
    assert.equal(nested(body).chapters[0]?.tracks[0]?.events, undefined);
  });
});

describe("job route with a story card", () => {
  it("posts the recorded card to Yoto with its events", async () => {
    const { card, upload } = compiled();
    const ready = recorded(upload, card);
    const original = globalThis.fetch;
    let posted: PlaylistUpload["content"] | undefined;
    globalThis.fetch = async (_url, init) => {
      posted = JSON.parse(String(init?.body)) as PlaylistUpload["content"];
      return new Response(JSON.stringify({ card: { cardId: "abCD1" } }), { status: 200 });
    };
    try {
      const response = await postJob(jobRequest(ready));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "completed", result: { cardId: "abCD1", title: "Safari test" } });
    } finally {
      globalThis.fetch = original;
    }
    if (!posted) throw new Error("nothing posted");
    assert.equal(nested(posted).playbackType, "interactive");
    assert.deepEqual(nested(posted).chapters[2]?.tracks[1]?.events, trackEvents(upload, "grassq"));
  });

  it("refuses to add a story onto another playlist", async () => {
    const { card, upload } = compiled();
    const ready = recorded(upload, card);
    const response = await postJob(
      jobRequest({ ...ready, create: undefined, append: true, content: { ...ready.content, cardId: "abCD1" } }),
    );
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /cannot be added onto another one/);
  });

  it("refuses a story that still has spoken text instead of recordings", async () => {
    const response = await postJob(jobRequest(compiled().upload));
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /once every track is recorded/);
  });

  it("checks every event command and target", async () => {
    const { card, upload } = compiled();
    const ready = recorded(upload, card);
    const badCommand = structuredClone(ready);
    const gate = nested(badCommand.content).chapters[0]?.tracks[0];
    if (!gate) throw new Error("no track");
    gate.events = { onEnd: { cmd: "jump" } as unknown as { cmd: "stop" } };
    let response = await postJob(jobRequest(badCommand));
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /Track gatea onEnd must be goto, stop or repeat/);

    const badTarget = structuredClone(ready);
    const grass = nested(badTarget.content).chapters[2]?.tracks[1];
    if (!grass) throw new Error("no track");
    grass.events = { onLhb: { cmd: "goto", params: { chapterKey: "lake", trackKey: "grassq" } } };
    response = await postJob(jobRequest(badTarget));
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /jumps to lake\/grassq, which is not on this card/);

    const notInteractive = structuredClone(ready);
    delete nested(notInteractive.content).playbackType;
    response = await postJob(jobRequest(notInteractive));
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /only work on an interactive card/);
  });
});
