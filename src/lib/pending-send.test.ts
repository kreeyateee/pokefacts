import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PENDING_SEND_MAX_AGE_MS,
  SEND_LOCK_STALE_MS,
  finishedTrackCount,
  isSendDone,
  readPendingSend,
  sendLockFree,
  sendLockValue,
  serializePendingSend,
  startPendingSend,
  unfinishedJobs,
  withCover,
  withCurrent,
  withPlaylistSent,
  withScratch,
  withFailure,
  withTrackDone,
  withoutFailure,
  withoutScratch,
  type PendingPlaylist,
} from "./pending-send";

const NOW = 1_800_000_000_000;

function playlist(id: string, keys: string[]): PendingPlaylist {
  return {
    playlistId: id,
    libraryTitle: `Title ${id}`,
    headline: `Sending ${id}`,
    rangeLabel: "1-3",
    coverId: 25,
    upload: { voiceId: "voice", content: { title: `Title ${id}` } },
    jobs: keys.map((key) => ({ key, title: key, text: `Say ${key}`, progress: key })),
  };
}

const VOICE = { voiceId: "lily", mix: { cryVolume: 0.8, voiceVolume: 1, pauseSeconds: 0.5 } };

const audio = (n: number) => ({ trackUrl: `yoto:#hash${n}`, duration: n, format: "mp3" });

describe("pending send", () => {
  it("survives a round trip through storage with its finished tracks", () => {
    let send = startPendingSend({
      title: "Pokefacts 1",
      now: NOW,
      ...VOICE,
      current: playlist("meet-1", ["a", "b", "c"]),
      finish: { detail: "Done.", toastTitle: "Pokefacts 1", updated: false, tracks: 3 },
    });
    send = withTrackDone(send, "a", audio(1));
    send = withScratch(send, "scratch-1");
    const back = readPendingSend(serializePendingSend(send), NOW + 1000);
    assert.deepEqual(back, send);
    assert.deepEqual(
      unfinishedJobs(back!).map((job) => job.key),
      ["b", "c"],
    );
    assert.equal(finishedTrackCount(back!), 1);
  });

  it("drops a send that is too old, broken, or has nothing left", () => {
    const send = startPendingSend({ title: "x", now: NOW, ...VOICE, current: playlist("meet-1", ["a"]) });
    const raw = serializePendingSend(send);
    assert.equal(readPendingSend(raw, NOW + PENDING_SEND_MAX_AGE_MS + 1), null);
    assert.equal(readPendingSend("{", NOW), null);
    assert.equal(readPendingSend(null, NOW), null);
    assert.equal(readPendingSend(JSON.stringify({ ...send, version: 2 }), NOW), null);
    assert.equal(readPendingSend(JSON.stringify({ ...send, current: { playlistId: 3 } }), NOW), null);
    const empty = startPendingSend({ title: "x", now: NOW, ...VOICE });
    assert.equal(readPendingSend(serializePendingSend(empty), NOW), null);
  });

  it("ignores a saved track that is not a finished Yoto recording", () => {
    const send = startPendingSend({ title: "x", now: NOW, ...VOICE, current: playlist("meet-1", ["a", "b"]) });
    const raw = JSON.stringify({ ...send, audio: { a: audio(1), b: { trackUrl: "https://elsewhere" } } });
    assert.deepEqual(Object.keys(readPendingSend(raw, NOW)!.audio), ["a"]);
  });

  it("keeps a missing cover apart from no cover", () => {
    const send = startPendingSend({ title: "x", now: NOW, ...VOICE, current: playlist("meet-1", ["a"]) });
    assert.equal(readPendingSend(serializePendingSend(send), NOW)!.cover, undefined);
    assert.equal(readPendingSend(serializePendingSend(withCover(send, undefined)), NOW)!.cover, null);
    assert.equal(readPendingSend(serializePendingSend(withCover(send, "https://c")), NOW)!.cover, "https://c");
  });

  it("walks a bulk send one numbered playlist at a time", () => {
    let send = startPendingSend({
      title: "Pokefacts 1",
      now: NOW,
      ...VOICE,
      bulk: { remaining: ["meet-1", "meet-2"], created: [], total: 2, dexNote: "" },
    });
    assert.equal(isSendDone(send), false);
    send = withCurrent(send, playlist("meet-1", ["a"]));
    assert.deepEqual(send.bulk?.remaining, ["meet-2"]);
    send = withCover(withTrackDone(send, "a", audio(1)), "https://c");
    send = withPlaylistSent(send);
    assert.deepEqual(send.bulk?.created, ["Title meet-1"]);
    assert.deepEqual(send.audio, {});
    assert.equal(send.cover, undefined);
    assert.notEqual(readPendingSend(serializePendingSend(send), NOW), null);
    send = withPlaylistSent(withCurrent(send, playlist("meet-2", ["a"])));
    assert.equal(isSendDone(send), true);
  });

  it("forgets scratch cards once they are deleted", () => {
    let send = startPendingSend({ title: "x", now: NOW, ...VOICE, current: playlist("meet-1", ["a"]) });
    send = withScratch(withScratch(withScratch(send, "s1"), "s2"), "s1");
    assert.deepEqual(send.scratch, ["s1", "s2"]);
    assert.deepEqual(withoutScratch(send, ["s1"]).scratch, ["s2"]);
  });

  it("lets one tab drive the send until its heartbeat goes quiet", () => {
    const held = sendLockValue("tab-a", NOW);
    assert.equal(sendLockFree(null, "tab-b", NOW), true);
    assert.equal(sendLockFree(held, "tab-a", NOW + 1000), true);
    assert.equal(sendLockFree(held, "tab-b", NOW + 1000), false);
    assert.equal(sendLockFree(held, "tab-b", NOW + SEND_LOCK_STALE_MS + 1), true);
    assert.equal(sendLockFree("junk", "tab-b", NOW), true);
  });

  it("remembers a failure so the send waits for Retry, and clears it on Retry", () => {
    const send = withFailure(startPendingSend({ title: "x", now: NOW, ...VOICE, current: playlist("meet-1", ["a"]) }), "Full");
    const back = readPendingSend(serializePendingSend(send), NOW)!;
    assert.equal(back.failed, "Full");
    assert.equal("failed" in withoutFailure(back), false);
  });
});
