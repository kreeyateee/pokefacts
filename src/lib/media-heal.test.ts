import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { POST as postForget } from "../app/api/yoto/forget/route";
import { POST as postJob } from "../app/api/yoto/job/route";
import { LILY_VOICE_ID } from "./kid-cards";
import {
  forgetMissingMedia,
  healingText,
  MEDIA_HEAL_ROUNDS,
  missingMediaError,
  MissingMediaError,
  postWithMediaHeal,
} from "./media-heal";
import {
  readPendingSend,
  serializePendingSend,
  startPendingSend,
  tracksUsingMedia,
  unfinishedJobs,
  withTrackDone,
  withoutTracks,
  type PendingPlaylist,
} from "./pending-send";
import {
  FORGET_MEDIA_LIMIT,
  forgetRenderedMedia,
  readForgetHashes,
  readRenderedFile,
  recordRenderedAudio,
  renderedAccount,
} from "./rendered-media";
import { prepareFactTrack, renderedCacheKey } from "./yoto-fact-audio";
import {
  MEDIA_EXPIRED,
  missingMediaHashes,
  plainErrorSentence,
  savedCardIsGone,
  SendFailure,
  statusErrorText,
  yotoUpstreamFailure,
} from "./yoto-error";
import type { FinishedAudio } from "./yoto-send";

const H1 = "lrkTKkJQGnAZvbHkWxzRjGPn1lb3yIhT0wx8r0Q4WRM";
const H2 = "Zq9v_Xw-3bY7nPq2LmA8sTt4uVk1oRe6hJd0cFg5iWb";
const H3 = "aB3dE5fG7hJ9kL1mN3pQ5rS7tV9wX1yZ3bC5dF7gH9j";

/** The body Yoto sent back for the card that would not send. */
function yotoMissing(...hashes: string[]): string {
  const files = hashes.map((hash) => `(${hash})`).join(", ");
  return JSON.stringify({
    error: {
      code: "bad-request",
      message: `Media file not found: The track "Clues" references a media file ${files} that does not exist. Please ensure you have followed the upload and transcode process`,
    },
  });
}

function jwt(sub: string): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part({ sub, aud: "https://api.yotoplay.com" })}.signature-not-checked`;
}

describe("Yoto's missing media error", () => {
  it("names the one hash Yoto said is gone", () => {
    assert.deepEqual(missingMediaHashes(yotoMissing(H1)), [H1]);
    assert.deepEqual(missingMediaHashes(JSON.parse(yotoMissing(H1))), [H1]);
  });

  it("names every hash when there are several, once each", () => {
    assert.deepEqual(missingMediaHashes(yotoMissing(H1, H2, H1)), [H1, H2]);
  });

  it("reads the other wordings", () => {
    assert.deepEqual(missingMediaHashes(`Media file not found: ${H1}`), [H1]);
    assert.deepEqual(missingMediaHashes(`Media files yoto:#${H1} and yoto:#${H2} do not exist.`), [H1, H2]);
    assert.deepEqual(missingMediaHashes(`Track "Answer" uses unknown media ${H3}`), [H3]);
    assert.deepEqual(missingMediaHashes({ message: `The media file ${H2} is missing.` }), [H2]);
    // Our own job route's structured 409.
    assert.deepEqual(missingMediaHashes({ error: "Yoto had lost 2 recordings", missingMedia: [H1, H2, "bad id"] }), [H1, H2]);
  });

  it("leaves other errors alone", () => {
    assert.deepEqual(missingMediaHashes({ error: { message: "Card ab12C does not exist." } }), []);
    assert.deepEqual(missingMediaHashes({ message: "Request failed with status code 400" }), []);
    assert.deepEqual(missingMediaHashes(`Title is too long. ${H1}`), []);
    // The wording without a hash names nothing to upload again.
    assert.deepEqual(missingMediaHashes("Media file not found"), []);
    assert.deepEqual(missingMediaHashes(null), []);
    assert.equal(missingMediaError(200, yotoMissing(H1)), undefined);
    assert.ok(missingMediaError(400, yotoMissing(H1)) instanceof MissingMediaError);
  });

  it("is not mistaken for a deleted playlist", () => {
    assert.equal(savedCardIsGone(400, JSON.parse(yotoMissing(H1))), false);
    assert.equal(savedCardIsGone(400, { error: { message: "Card ab12C does not exist." } }), true);
  });

  it("shows one plain sentence instead of Yoto's raw JSON", () => {
    const raw = yotoMissing(H1);
    const upstream = yotoUpstreamFailure(raw);
    assert.equal(upstream.message.includes("{"), false);
    assert.equal(upstream.yotoBody, raw);
    assert.equal(statusErrorText(400, upstream, "Yoto did not accept this card."), MEDIA_EXPIRED);

    const other = yotoUpstreamFailure(JSON.stringify({ error: { code: "bad-request", message: "Title is too long." } }));
    const shown = statusErrorText(400, other, "Yoto did not accept this card.");
    assert.equal(shown, "Title is too long.");
    assert.equal(plainErrorSentence('Yoto did not return the playlist. {"x":1}', "fallback"), "Yoto did not return the playlist.");
    assert.equal(plainErrorSentence('{"x":1}', "Yoto did not accept this card."), "Yoto did not accept this card.");
    assert.equal(
      plainErrorSentence("This playlist has 2 free slots left. This send needs 5 tracks.", ""),
      "This playlist has 2 free slots left. This send needs 5 tracks.",
    );
  });

  it("comes back from the job route as a 409 with every hash", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(yotoMissing(H1, H2), { status: 400 });
    try {
      const track = (key: string, hash: string) => ({
        key,
        title: key,
        type: "audio",
        trackUrl: `yoto:#${hash}`,
        duration: 3,
        fileSize: 100,
        format: "mp3",
        channels: "mono",
      });
      const response = await postJob(
        new Request("http://localhost/api/yoto/job", {
          method: "POST",
          headers: { Authorization: `Bearer ${"x".repeat(24)}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            voiceId: LILY_VOICE_ID,
            create: true,
            content: {
              title: "Who's That",
              content: { chapters: [{ key: "c1", title: "One", tracks: [track("clue1", H1), track("answer1", H2)] }] },
            },
          }),
        }),
      );
      assert.equal(response.status, 409);
      const body = (await response.json()) as { missingMedia?: string[]; message?: string };
      assert.deepEqual(body.missingMedia, [H1, H2]);
      assert.equal(body.message?.includes("{"), false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const KEY_C = "c".repeat(64);

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

describe("forgetting lost uploads", () => {
  it("drops only this account's matching entries and keeps every .mp3", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-forget-"));
    const root = path.join(dir, "rendered");
    await mkdir(root, { recursive: true });
    const me = renderedAccount(jwt("auth0|me"));
    const them = renderedAccount(jwt("auth0|them"));
    const audio = (hash: string) => ({ trackUrl: `yoto:#${hash}`, duration: 1, fileSize: 10, format: "mp3", channels: "mono" });
    try {
      // A: only mine, dead. B: mine dead and theirs too (same hash), theirs stays. C: mine, still good.
      await writeFile(path.join(root, `${KEY_A}.json`), JSON.stringify({ cryFirst: true, accounts: { [me]: audio(H1) } }));
      await writeFile(path.join(root, `${KEY_A}.mp3`), "mp3");
      await writeFile(
        path.join(root, `${KEY_B}.json`),
        JSON.stringify({ cryFirst: true, accounts: { [me]: audio(H1), [them]: audio(H1) } }),
      );
      await writeFile(path.join(root, `${KEY_C}.json`), JSON.stringify({ cryFirst: true, accounts: { [me]: audio(H3) } }));
      // An ownerless entry from before uploads had owners.
      const legacy = "d".repeat(64);
      await writeFile(path.join(root, `${legacy}.json`), JSON.stringify({ ...audio(H2), cryFirst: true }));
      // Not cache entries: never read, never renamed.
      await writeFile(path.join(root, "upload-abc.json"), JSON.stringify({ trackUrl: `yoto:#${H1}` }));
      await writeFile(path.join(root, "notes.json"), JSON.stringify({ trackUrl: `yoto:#${H1}` }));
      await mkdir(path.join(root, "nested"), { recursive: true });
      await writeFile(path.join(root, "nested", `${KEY_A}.json`), JSON.stringify({ accounts: { [me]: audio(H1) } }));
      await writeFile(path.join(dir, `${KEY_A}.json`), JSON.stringify({ accounts: { [me]: audio(H1) } }));

      const result = await forgetRenderedMedia([H1, H2], me, root);
      assert.equal(result.forgotten, 3);
      assert.deepEqual([...result.files].sort(), [`${KEY_A}.json`, `${KEY_B}.json`, `${legacy}.json`].sort());

      const names = await readdir(root);
      assert.equal(names.includes(`${KEY_A}.json`), false);
      assert.equal(names.includes(`${KEY_A}.json.stale`), true);
      assert.equal(names.includes(`${KEY_A}.mp3`), true);
      assert.equal(names.includes(`${legacy}.json.stale`), true);
      assert.deepEqual(await json(path.join(root, `${KEY_B}.json`)), { cryFirst: true, accounts: { [them]: audio(H1) } });
      assert.deepEqual(await json(path.join(root, `${KEY_C}.json`)), { cryFirst: true, accounts: { [me]: audio(H3) } });
      assert.equal(names.includes("upload-abc.json"), true);
      assert.equal(names.includes("notes.json"), true);
      assert.equal((await readdir(path.join(root, "nested"))).includes(`${KEY_A}.json`), true);
      assert.equal((await readdir(dir)).includes(`${KEY_A}.json`), true);

      // A hash that is not a Yoto id is ignored, even if it would match by text.
      assert.equal((await forgetRenderedMedia(["../../etc", "*"], me, root)).forgotten, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks and caps the hashes it is given", () => {
    assert.deepEqual(readForgetHashes([H1, H1, H2]), [H1, H2]);
    assert.throws(() => readForgetHashes([]));
    assert.throws(() => readForgetHashes("nope"));
    assert.throws(() => readForgetHashes([H1, "../rendered/x"]));
    assert.throws(() => readForgetHashes([`yoto:#${H1}`]));
    assert.throws(() => readForgetHashes(Array.from({ length: FORGET_MEDIA_LIMIT + 1 }, () => H1)));
  });

  it("needs a Yoto login and good hashes at the route", async () => {
    const call = (body: unknown, auth = true) =>
      postForget(
        new Request("http://localhost/api/yoto/forget", {
          method: "POST",
          headers: {
            ...(auth ? { Authorization: `Bearer ${jwt("auth0|route")}` } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    assert.equal((await call({ hashes: [H1] }, false)).status, 401);
    assert.equal((await call({ hashes: ["..\\..\\secret"] })).status, 400);
    assert.equal((await call({ hashes: Array.from({ length: FORGET_MEDIA_LIMIT + 1 }, () => H1) })).status, 400);
  });
});

describe("cached uploads belong to one Yoto account", () => {
  it("never hands A's yoto:# to B; B uploads the kept mp3 and gets its own entry; A keeps reusing its own", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-owner-"));
    const rendered = path.join(dir, "rendered");
    await mkdir(rendered, { recursive: true });
    const text = "Pikachu stores electricity in its cheeks.";
    const dexId = 25;
    const key = renderedCacheKey(text, dexId, LILY_VOICE_ID);
    const merged = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 7)]);
    await writeFile(path.join(rendered, `${key}.mp3`), merged);
    const tokenA = jwt("auth0|alice");
    const tokenB = jwt("auth0|bob");
    const accountA = renderedAccount(tokenA);
    const accountB = renderedAccount(tokenB);
    assert.notEqual(accountA, accountB);
    assert.equal(renderedAccount(jwt("auth0|alice")), accountA);
    await recordRenderedAudio(
      path.join(rendered, `${key}.json`),
      accountA,
      { trackUrl: `yoto:#${H1}`, duration: 2, fileSize: merged.length, format: "mp3", channels: "mono" },
      true,
    );
    const stored = await readFile(path.join(rendered, `${key}.json`), "utf8");
    assert.equal(stored.includes("alice"), false);
    assert.equal(stored.includes(tokenA), false);

    const calls: string[] = [];
    let puts = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${tokenB}`);
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        // Yoto already has these bytes, so it skips the PUT.
        return Response.json({ upload: { uploadId: "up-bob", uploadUrl: null } });
      }
      if (init?.method === "PUT") puts += 1;
      if (url.includes("/media/upload/up-bob/transcoded")) {
        return Response.json({
          transcode: { transcodedSha256: H2, transcodedInfo: { duration: 2, fileSize: 99, format: "mp3", channels: "mono" } },
        });
      }
      throw new Error(`Unexpected ${url}`);
    };
    const noNetwork: typeof fetch = async (input) => {
      throw new Error(`A's own cached upload must not call Yoto (${String(input)}).`);
    };
    const roots = {
      speech: path.join(dir, "speech"),
      rendered,
      merge: async () => {
        throw new Error("ffmpeg should not run: the mix is kept.");
      },
    };
    const request = { text, title: "Pikachu", name: "Pikachu", dexId, voiceId: LILY_VOICE_ID };
    try {
      const forB = await prepareFactTrack(tokenB, request, fetchImpl, roots);
      assert.equal(forB.phase, "ready");
      assert.equal(forB.trackUrl, `yoto:#${H2}`);
      assert.equal(puts, 0);
      assert.equal(calls.filter((url) => url.includes("uploadUrl")).length, 1);
      const file = await readRenderedFile(path.join(rendered, `${key}.json`));
      assert.equal(file?.accounts?.[accountA]?.trackUrl, `yoto:#${H1}`);
      assert.equal(file?.accounts?.[accountB]?.trackUrl, `yoto:#${H2}`);

      const againA = await prepareFactTrack(tokenA, request, noNetwork, roots);
      assert.equal(againA.trackUrl, `yoto:#${H1}`);
      const againB = await prepareFactTrack(tokenB, request, noNetwork, roots);
      assert.equal(againB.trackUrl, `yoto:#${H2}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("treats an entry with no owner as unknown, uploads for this account and records it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-ownerless-"));
    const rendered = path.join(dir, "rendered");
    await mkdir(rendered, { recursive: true });
    const text = "Eevee adapts to wherever it lives.";
    const dexId = 133;
    const key = renderedCacheKey(text, dexId, LILY_VOICE_ID);
    await writeFile(
      path.join(rendered, `${key}.mp3`),
      Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 3)]),
    );
    await writeFile(
      path.join(rendered, `${key}.json`),
      JSON.stringify({ trackUrl: `yoto:#${H1}`, duration: 1, fileSize: 9, format: "mp3", channels: "mono", cryFirst: true }),
    );
    const token = jwt("auth0|carol");
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("uploadUrl")) return Response.json({ upload: { uploadId: "up-carol", uploadUrl: null } });
      if (url.includes("/transcoded")) return Response.json({ transcode: { transcodedSha256: H3 } });
      throw new Error(`Unexpected ${url}`);
    };
    try {
      const ready = await prepareFactTrack(
        token,
        { text, title: "Eevee", name: "Eevee", dexId, voiceId: LILY_VOICE_ID },
        fetchImpl,
        { speech: path.join(dir, "speech"), rendered },
      );
      assert.equal(ready.trackUrl, `yoto:#${H3}`);
      const file = await readRenderedFile(path.join(rendered, `${key}.json`));
      assert.equal(file?.trackUrl, undefined);
      assert.equal(file?.cryFirst, true);
      assert.deepEqual(Object.keys(file?.accounts ?? {}), [renderedAccount(token)]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const done = (hash: string): FinishedAudio => ({ trackUrl: `yoto:#${hash}`, duration: 2, fileSize: 20, format: "mp3" });

describe("sending again after Yoto lost a recording", () => {
  /** A fake of the three Pokefacts routes the page calls while healing. */
  function fakeServer(jobReplies: Array<() => Response>) {
    const log: Array<{ url: string; body: unknown }> = [];
    let replies = 0;
    const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
      const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : null;
      log.push({ url, body });
      if (url === "/api/yoto/job") {
        const reply = jobReplies[Math.min(replies, jobReplies.length - 1)];
        replies += 1;
        return (reply as () => Response)();
      }
      if (url === "/api/yoto/forget") return Response.json({ forgotten: 1 });
      if (url === "/api/yoto/track") return Response.json({ phase: "ready", ...done(H3) });
      throw new Error(`Unexpected ${url}`);
    };
    const post = async (audio: Record<string, FinishedAudio>) => {
      const response = await fetcher("/api/yoto/job", { method: "POST", body: JSON.stringify({ audio }) });
      const payload = (await response.json()) as { result?: { cardId?: string } };
      const lost = missingMediaError(response.status, payload);
      if (lost) throw lost;
      if (!response.ok) throw new SendFailure("Yoto did not accept this card.", false);
      return payload.result?.cardId;
    };
    const redo = async (keys: string[], kept: Record<string, FinishedAudio>) => {
      const audio = { ...kept };
      for (const key of keys) {
        const response = await fetcher("/api/yoto/track", { method: "POST", body: JSON.stringify({ key }) });
        audio[key] = (await response.json()) as FinishedAudio;
      }
      return audio;
    };
    return { log, fetcher, post, redo };
  }

  const lost409 = (...hashes: string[]) => () =>
    Response.json({ error: "Yoto had lost a recording.", missingMedia: hashes }, { status: 409 });
  const created = () => Response.json({ status: "completed", result: { cardId: "ab12C" } });

  it("forgets the lost track, prepares it again and posts once more", async () => {
    const server = fakeServer([lost409(H1), created]);
    const heals: Array<{ keys: string[]; round: number }> = [];
    const cardId = await postWithMediaHeal({
      audio: { clue1: done(H1), answer1: done(H2) },
      post: server.post,
      forget: (hashes) => forgetMissingMedia(hashes, server.fetcher),
      redo: server.redo,
      onHeal: (keys, round) => heals.push({ keys, round }),
    });
    assert.equal(cardId, "ab12C");
    assert.deepEqual(heals, [{ keys: ["clue1"], round: 1 }]);
    assert.deepEqual(
      server.log.map((entry) => entry.url),
      ["/api/yoto/job", "/api/yoto/forget", "/api/yoto/track", "/api/yoto/job"],
    );
    assert.deepEqual(server.log[1]?.body, { hashes: [H1] });
    const second = server.log[3]?.body as { audio: Record<string, FinishedAudio> };
    assert.equal(second.audio.clue1?.trackUrl, `yoto:#${H3}`);
    assert.equal(second.audio.answer1?.trackUrl, `yoto:#${H2}`);
    assert.equal(healingText(1), "Re-uploading 1 recording Yoto had lost…");
    assert.equal(healingText(3), "Re-uploading 3 recordings Yoto had lost…");
  });

  it("gives up after two rounds with one plain sentence", async () => {
    // Every post loses whichever recording the clue track has now.
    const server = fakeServer([lost409(H1), lost409(H3), lost409(H3)]);
    let redos = 0;
    await assert.rejects(
      postWithMediaHeal({
        audio: { clue1: done(H1), answer1: done(H2) },
        post: server.post,
        forget: (hashes) => forgetMissingMedia(hashes, server.fetcher),
        redo: async (keys, kept) => {
          redos += 1;
          return server.redo(keys, kept);
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof SendFailure);
        assert.equal(error.message, MEDIA_EXPIRED);
        assert.equal(error.message.includes("{"), false);
        return true;
      },
    );
    assert.equal(redos, MEDIA_HEAL_ROUNDS);
    assert.equal(server.log.filter((entry) => entry.url === "/api/yoto/job").length, MEDIA_HEAL_ROUNDS + 1);
  });

  it("does not loop when the lost hash is on none of this send's tracks", async () => {
    const server = fakeServer([lost409(H3)]);
    await assert.rejects(
      postWithMediaHeal({
        audio: { clue1: done(H1) },
        post: server.post,
        forget: (hashes) => forgetMissingMedia(hashes, server.fetcher),
        redo: server.redo,
      }),
      (error: unknown) => error instanceof SendFailure && error.message === MEDIA_EXPIRED,
    );
    assert.equal(server.log.length, 1);
  });

  it("passes any other failure straight through", async () => {
    const server = fakeServer([() => Response.json({ error: "Title is too long." }, { status: 400 })]);
    await assert.rejects(
      postWithMediaHeal({ audio: { clue1: done(H1) }, post: server.post, forget: async () => undefined, redo: server.redo }),
      /Yoto did not accept this card/,
    );
  });
});

describe("a saved send with dead recordings", () => {
  const playlist: PendingPlaylist = {
    playlistId: "whos-that",
    libraryTitle: "Who's That",
    headline: "Who's That",
    rangeLabel: "1-2",
    upload: { voiceId: LILY_VOICE_ID, content: { title: "Who's That" } },
    jobs: ["clue1", "answer1", "clue2"].map((key) => ({ key, title: key, text: `Say ${key}`, progress: key })),
  };

  it("drops just the tracks whose audio Yoto lost, so a resume prepares them again", () => {
    let send = startPendingSend({
      title: "Who's That",
      now: 1_800_000_000_000,
      voiceId: LILY_VOICE_ID,
      mix: { cryVolume: 4, voiceVolume: 1, pauseSeconds: 0.35 },
      current: playlist,
    });
    send = withTrackDone(send, "clue1", done(H1));
    send = withTrackDone(send, "answer1", done(H2));
    send = withTrackDone(send, "clue2", done(H1));
    assert.deepEqual(unfinishedJobs(send), []);

    const dead = tracksUsingMedia(send.audio, [H1]);
    assert.deepEqual(dead, ["clue1", "clue2"]);
    const healed = withoutTracks(send, dead);
    assert.deepEqual(Object.keys(healed.audio), ["answer1"]);
    assert.deepEqual(
      unfinishedJobs(healed).map((job) => job.key),
      ["clue1", "clue2"],
    );
    assert.equal(withoutTracks(healed, ["clue1"]), healed);
    const back = readPendingSend(serializePendingSend(healed), 1_800_000_000_500);
    assert.deepEqual(back?.audio, { answer1: done(H2) });
  });
});
