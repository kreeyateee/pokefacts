import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { POST } from "../app/api/facts/local/route";
import { LILY_VOICE_ID } from "./kid-cards";
import { biologyBlocks } from "./bulbapedia";
import {
  buildLocalFactTrack,
  CONNECT_FOR_VOICE,
  downloadLabsSpeech,
  localFactScript,
} from "./local-facts";
import { PIPER_VOICE_ID } from "./piper-voice";
import { renderedCacheKey, saveCachedMergedMp3 } from "./yoto-fact-audio";

const MIX = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 4)]);
const WAV = Buffer.alloc(44);
WAV.write("RIFF", 0, "ascii");
WAV.write("WAVE", 8, "ascii");

function roots(dir: string) {
  return {
    speech: path.join(dir, "speech"),
    rendered: path.join(dir, "rendered"),
    cries: path.join(dir, "cries"),
  };
}

describe("local fact builds", () => {
  it("speaks the name and the first two biology paragraphs, not Bulbapedia", () => {
    const spoken = localFactScript("Bulbasaur", [
      { kind: "paragraph", text: "One. The first biology paragraph is about the bulb." },
      {
        kind: "paragraph",
        text: "Two. The second biology paragraph is about the sun. This line is from Bulbapedia and must not be read.",
      },
      { kind: "paragraph", text: "Three. The third biology paragraph is about the soil." },
    ]);
    assert.match(spoken, /^Bulbasaur\./);
    assert.match(spoken, /first biology paragraph is about the bulb/);
    assert.match(spoken, /second biology paragraph is about the sun/);
    assert.doesNotMatch(spoken, /third biology paragraph|Bulbapedia|Creative Commons/i);
  });

  it("skips a contents box and an image caption, and refuses a name with no biology", () => {
    const blocks = biologyBlocks(`
      <h2>Contents</h2>
      <p>Contents</p>
      <div class="thumb tright"><div class="thumbcaption"><p>Official artwork of Venusaur.</p></div></div>
      <h2>Biology</h2>
      <p>One. The first biology paragraph is about the flower.</p>
      <p>Two. The second biology paragraph is about the sun. This line is from Bulbapedia and must not be read.</p>
      <h2>Game data</h2>
      <p>Three. The third biology paragraph is about the soil.</p>
    `);
    const spoken = localFactScript("Venusaur", blocks);
    assert.match(spoken, /first biology paragraph is about the flower/);
    assert.match(spoken, /second biology paragraph is about the sun/);
    assert.doesNotMatch(spoken, /Contents|artwork|third biology paragraph|Bulbapedia/i);
    assert.throws(() => localFactScript("Venusaur", []), /no Biology description/);
    assert.throws(
      () => localFactScript("Venusaur", [{ kind: "paragraph", text: "Contents" }]),
      /no Biology description/,
    );
  });

  it("does not treat a name-only or dex-blurb mix as done and does not create a Yoto card", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-local-empty-"));
    const cache = roots(dir);
    const blurb = "Venusaur. It is number 3. It is a Grass type. It is the Seed Pokémon.";
    await saveCachedMergedMp3("Vee nuh sore.", PIPER_VOICE_ID, 3, MIX, cache.rendered);
    await saveCachedMergedMp3(blurb, PIPER_VOICE_ID, 3, MIX, cache.rendered);
    const fetchImpl: typeof fetch = async () => {
      throw new Error("A missing description must not call Yoto.");
    };
    await assert.rejects(
      () =>
        buildLocalFactTrack(
          { dexId: 3, name: "Venusaur", text: "Vee nuh sore.", voiceId: PIPER_VOICE_ID },
          { ...cache, fetchImpl, merge: async () => MIX },
        ),
      /no Biology description/,
    );
    await assert.rejects(
      () =>
        buildLocalFactTrack(
          { dexId: 3, name: "Venusaur", text: blurb, voiceId: PIPER_VOICE_ID },
          { ...cache, fetchImpl, merge: async () => MIX },
        ),
      /no Biology description/,
    );
    const spoken = localFactScript("Venusaur", [
      { kind: "paragraph", text: "One. The first biology paragraph is about the flower." },
      { kind: "paragraph", text: "Two. The second biology paragraph is about the sun." },
    ]);
    let merged = 0;
    const built = await buildLocalFactTrack(
      { dexId: 3, name: "Venusaur", text: spoken, voiceId: PIPER_VOICE_ID },
      {
        ...cache,
        fetchImpl,
        loadCry: async () => Buffer.from("OggS"),
        merge: async () => {
          merged += 1;
          return Buffer.from(MIX);
        },
        piper: { run: async () => WAV },
      },
    );
    assert.equal(built.status, "built");
    assert.equal(merged, 1);
    const again = await buildLocalFactTrack(
      { dexId: 3, name: "Venusaur", text: spoken, voiceId: PIPER_VOICE_ID },
      { ...cache, fetchImpl, merge: async () => { throw new Error("ffmpeg should not run"); } },
    );
    assert.equal(again.status, "cached");
  });

  it("skips a cached mix and does not create a Yoto card", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-local-skip-"));
    const text = "Oddish stores moonlight in its leaves.";
    const voiceId = LILY_VOICE_ID;
    const dexId = 43;
    const cache = roots(dir);
    await saveCachedMergedMp3(text, voiceId, dexId, MIX, cache.rendered, {
      cryVolume: 4,
      voiceVolume: 1,
      pauseSeconds: 0.35,
    });
    let calls = 0;
    let merged = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("A cached mix must not call Yoto.");
    };
    const first = await buildLocalFactTrack(
      { dexId, name: "Oddish", text, voiceId, cryVolume: 4, voiceVolume: 1, pauseSeconds: 0.35 },
      {
        ...cache,
        fetchImpl,
        merge: async () => {
          merged += 1;
          throw new Error("ffmpeg should not run");
        },
        speak: async () => {
          throw new Error("Lily should not record a cached mix.");
        },
      },
    );
    assert.equal(first.status, "cached");
    assert.equal(calls, 0);
    assert.equal(merged, 0);
    const again = await buildLocalFactTrack(
      { dexId, name: "Oddish", text, voiceId },
      { ...cache, fetchImpl },
    );
    assert.equal(again.status, "cached");
    assert.equal(calls, 0);

    let mixed = 0;
    const louder = await buildLocalFactTrack(
      {
        dexId,
        name: "Oddish",
        text,
        voiceId,
        token: "x".repeat(24),
        cryVolume: 4,
        voiceVolume: 2,
        pauseSeconds: 0.35,
      },
      {
        ...cache,
        fetchImpl,
        loadCry: async () => Buffer.from("OggS"),
        merge: async () => {
          mixed += 1;
          return Buffer.from(MIX);
        },
        speak: async () => Buffer.from(MIX),
      },
    );
    assert.equal(louder.status, "built");
    assert.equal(mixed, 1);
    assert.equal(calls, 0);
  });

  it("mixes a new fact without posting a Yoto content card", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-local-mix-"));
    const text = "Bulbasaur waits in the tall grass.";
    const cache = roots(dir);
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url.includes("yotoplay.com/content")) throw new Error("created a Yoto card");
      throw new Error(`unexpected ${method} ${url}`);
    };
    const built = await buildLocalFactTrack(
      { dexId: 1, name: "Bulbasaur", text, voiceId: PIPER_VOICE_ID, token: "" },
      {
        ...cache,
        fetchImpl,
        loadCry: async () => Buffer.from("OggS"),
        merge: async () => MIX,
        piper: {
          run: async () => WAV,
        },
      },
    );
    assert.equal(built.status, "built");
    assert.equal(calls.length, 0);
    const key = renderedCacheKey(text, 1, PIPER_VOICE_ID);
    const saved = await readFile(path.join(cache.rendered, `${key}.mp3`));
    assert.equal(saved.equals(MIX), true);
    const skipped = await buildLocalFactTrack(
      { dexId: 1, name: "Bulbasaur", text, voiceId: PIPER_VOICE_ID },
      {
        ...cache,
        fetchImpl,
        merge: async () => {
          throw new Error("ffmpeg should not run");
        },
      },
    );
    assert.equal(skipped.status, "cached");
  });

  it("refuses a Labs voice with no login and writes nothing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-local-labs-"));
    const cache = roots(dir);
    await assert.rejects(
      () =>
        buildLocalFactTrack(
          {
            dexId: 25,
            name: "Pikachu",
            text: "Pikachu. Pikachu is a small rodent Pokémon with yellow fur and long ears. It stores electricity in the pouches of its cheeks.",
            voiceId: LILY_VOICE_ID,
          },
          {
            ...cache,
            fetchImpl: async () => {
              throw new Error("Yoto should not be called");
            },
            speak: async () => {
              throw new Error("speech should not start");
            },
          },
        ),
      new RegExp(CONNECT_FOR_VOICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });

  it("deletes a Labs scratch recording and does not post a playlist card", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const speech = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(180, 9)]);
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url });
      if (method === "POST" && url.startsWith("https://api.yotoplay.com/content")) {
        throw new Error("playlist card");
      }
      if (url.includes("/content/job?") && method === "POST") {
        return Response.json({ jobId: "job-local-1", status: "completed", result: { cardId: "scratch1" } });
      }
      if (url.includes("/content/job/job-local-1")) {
        return Response.json({ jobId: "job-local-1", status: "completed", result: { cardId: "scratch1" } });
      }
      if (url.includes("/content/scratch1") && method === "GET") {
        return Response.json({
          card: { content: { chapters: [{ tracks: [{ trackUrl: "https://cdn.example/line.mp3" }] }] } },
        });
      }
      if (url === "https://cdn.example/line.mp3") return new Response(new Uint8Array(speech));
      if (url.includes("/content/scratch1") && method === "DELETE") return new Response(null, { status: 200 });
      throw new Error(`unexpected ${method} ${url}`);
    };
    const audio = await downloadLabsSpeech("x".repeat(24), "Pikachu stores electricity.", "Pikachu", LILY_VOICE_ID, fetchImpl);
    assert.equal(audio.equals(speech), true);
    assert.equal(
      calls.some((call) => call.method === "POST" && call.url.startsWith("https://api.yotoplay.com/content")),
      false,
    );
    assert.equal(
      calls.some((call) => call.method === "DELETE" && call.url.includes("/content/scratch1")),
      true,
    );
  });

  it("does not start a Labs build from the route when Yoto is not connected", async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/facts/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dexId: 1, voiceId: LILY_VOICE_ID, limit: 1025 }),
      }),
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, CONNECT_FOR_VOICE);
  });
});
