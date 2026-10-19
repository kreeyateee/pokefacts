import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { POST as postJob } from "../app/api/yoto/job/route";
import { cryUrl, inputContainer } from "./cry-audio";
import { ffmpegCommand } from "./ffmpeg-bin";
import { factsPlaylistUpload, LILY_VOICE_ID } from "./kid-cards";
import { piperSpeechCommand, type PiperCommand } from "./piper";
import { PIPER_MODEL_NAME, PIPER_VOICE_ID } from "./piper-voice";
import { demoHearBody, factTrackBody, writeVoiceId } from "./voice-choice";
import { prepareFactTrack } from "./yoto-fact-audio";
import { prepareDemoAudio } from "./yoto-demo";

function sine(file: string, frequency: number, format: "mp3" | "wav"): Promise<void> {
  const args = ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=1`];
  if (format === "mp3") args.push("-c:a", "libmp3lame", "-q:a", "5");
  else args.push("-f", "wav");
  args.push(file);
  return new Promise((resolve, reject) => {
    execFile(ffmpegCommand(), args, { timeout: 20_000 }, (error) => (error ? reject(error) : resolve()));
  });
}

describe("Piper Pokédex voice", () => {
  it("keeps Piper in the picker payload and does not swap in an ElevenLabs voice id", () => {
    const memory = { value: "" };
    const storage = {
      getItem: () => memory.value,
      setItem: (_key: string, value: string) => {
        memory.value = value;
      },
    };
    assert.equal(writeVoiceId(storage, PIPER_VOICE_ID), PIPER_VOICE_ID);
    assert.equal(memory.value, PIPER_VOICE_ID);
    const hear = demoHearBody({ text: "Bulbasaur waits. Bulbapedia.", voiceId: PIPER_VOICE_ID, dexId: 1 });
    const track = factTrackBody({ text: "Bulbasaur waits.", title: "Bulbasaur", dexId: 1, voiceId: PIPER_VOICE_ID });
    assert.equal(hear.voiceId, PIPER_VOICE_ID);
    assert.equal(track.voiceId, PIPER_VOICE_ID);
    assert.notEqual(PIPER_VOICE_ID, LILY_VOICE_ID);
    const sent = factsPlaylistUpload(
      {
        id: "meet-1",
        kind: "meet",
        title: "Pokefacts",
        rangeLabel: "Pokefacts 1",
        libraryTitle: "Pokefacts 1",
        blurb: "Facts.",
        childDoes: "Listen.",
        chapters: [
          {
            key: "bulbasaur",
            title: "Bulbasaur",
            overlay: "1",
            picture: "this Pokémon",
            mark: "1",
            icon: "/pixels/1.png",
            dexId: 1,
            tracks: [
              {
                key: "entry",
                title: "Bulbasaur",
                text: "Bulbasaur waits.",
                spoken: "Bulbasaur waits.",
                icon: "/pixels/1.png",
                overlay: "1",
              },
            ],
          },
        ],
      },
      { 1: "pixel" },
      undefined,
      PIPER_VOICE_ID,
    );
    assert.equal(sent.voiceId, PIPER_VOICE_ID);
    assert.equal(sent.content.content.chapters[0]?.tracks[0]?.voiceId, PIPER_VOICE_ID);
    assert.equal(JSON.stringify(sent).includes(LILY_VOICE_ID), false);
    assert.equal(JSON.stringify(sent).includes("JBFqnCBsd6RMkjVDRZzb"), false);
  });

  it("builds a local piper command for the Cori model", () => {
    const spec = piperSpeechCommand({
      text: "Bulbasaur is a small quadruped.",
      output: path.join("data", "piper", "sample.wav"),
      bin: path.join("data", "piper", "runtime", "piper.exe"),
      model: path.join("data", "piper", "voices", `${PIPER_MODEL_NAME}.onnx`),
    });
    assert.match(spec.command, /piper(\.exe)?$/i);
    assert.deepEqual(spec.args, [
      "--model",
      path.join("data", "piper", "voices", "en_GB-cori-high.onnx"),
      "--output_file",
      path.join("data", "piper", "sample.wav"),
    ]);
    assert.equal(spec.input, "Bulbasaur is a small quadruped.");
    assert.equal(JSON.stringify(spec).includes("elevenlabs"), false);
    assert.equal(JSON.stringify(spec).includes(LILY_VOICE_ID), false);
  });

  it("records with a local piper invocation and does not send an ElevenLabs voice id", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-piper-"));
    const wavPath = path.join(dir, "speech.wav");
    const cryPath = path.join(dir, "cry.mp3");
    await sine(wavPath, 440, "wav");
    await sine(cryPath, 220, "mp3");
    const wav = await readFile(wavPath);
    const cry = await readFile(cryPath);
    const seen: PiperCommand[] = [];
    const urls: string[] = [];
    const bodies: string[] = [];
    const puts: Buffer[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      if (typeof init?.body === "string") bodies.push(init.body);
      if (url === cryUrl(1)) return new Response(new Uint8Array(cry));
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        return Response.json({ upload: { uploadId: "up-piper", uploadUrl: "https://upload.example/piper" } });
      }
      if (url === "https://upload.example/piper") {
        const body = init?.body;
        puts.push(Buffer.from(body instanceof Uint8Array ? body : new Uint8Array()));
        return new Response("ok");
      }
      if (url.includes("/transcoded")) {
        return Response.json({
          transcode: {
            transcodedSha256: "pipermerged",
            transcodedInfo: { duration: 3, fileSize: puts.at(-1)?.length ?? 1, format: "mp3", channels: "mono" },
          },
        });
      }
      throw new Error(`Unexpected ${init?.method ?? "GET"} ${url}`);
    };
    try {
      const ready = await prepareFactTrack(
        "x".repeat(24),
        { text: "Bulbasaur is a small quadruped.", title: "Bulbasaur", name: "Bulbasaur", dexId: 1, voiceId: PIPER_VOICE_ID },
        fetchImpl,
        {
          speech: path.join(dir, "speech"),
          rendered: path.join(dir, "rendered"),
          cries: path.join(dir, "cries"),
          piper: {
            download: false,
            bin: path.join(dir, "piper.exe"),
            model: path.join(dir, "voices", "en_GB-cori-high.onnx"),
            run: async (command) => {
              seen.push(command);
              return wav;
            },
          },
        },
      );
      assert.equal(ready.phase, "ready");
      assert.equal(ready.trackUrl, "yoto:#pipermerged");
      assert.equal(seen.length, 1);
      assert.match(seen[0]?.command ?? "", /piper\.exe$/i);
      assert.ok(seen[0]?.args.includes("--model"));
      assert.ok(seen[0]?.args.some((arg) => arg.endsWith(`${path.sep}en_GB-cori-high.onnx`)));
      assert.equal(seen[0]?.input, "Bulbasaur is a small quadruped.");
      const traffic = `${urls.join("\n")}\n${bodies.join("\n")}`;
      assert.equal(traffic.includes("labs.api.yotoplay.com"), false);
      assert.equal(traffic.includes("elevenlabs"), false);
      assert.equal(traffic.includes(LILY_VOICE_ID), false);
      assert.equal(traffic.includes("voiceId="), false);
      const mixed = puts.at(-1);
      assert.ok(mixed);
      assert.equal(inputContainer(mixed), "mp3");
      assert.equal(mixed.equals(wav), false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns a short error when the Piper binary is missing and does not call Yoto", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-piper-missing-"));
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("Yoto should not be called");
    };
    try {
      await assert.rejects(
        () =>
          prepareFactTrack(
            "x".repeat(24),
            { text: "Ivysaur grows in the sun.", title: "Ivysaur", dexId: 2, voiceId: PIPER_VOICE_ID },
            fetchImpl,
            {
              speech: path.join(dir, "speech"),
              rendered: path.join(dir, "rendered"),
              piper: {
                download: false,
                bin: path.join(dir, "missing-piper.exe"),
                model: path.join(dir, "missing-model.onnx"),
              },
            },
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "Piper is not installed.");
          assert.ok(error.message.length < 80);
          return true;
        },
      );
      assert.equal(calls, 0);

      await assert.rejects(
        () =>
          prepareDemoAudio(
            "",
            { text: "Venusaur waits.", title: "Venusaur", dexId: 3, voiceId: PIPER_VOICE_ID },
            fetchImpl,
            {
              speech: path.join(dir, "demo"),
              rendered: path.join(dir, "rendered"),
              piper: {
                download: false,
                bin: path.join(dir, "missing-piper.exe"),
                model: path.join(dir, "missing-model.onnx"),
              },
            },
          ),
        /Piper is not installed\./,
      );
      assert.equal(calls, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not forward a Piper playlist of spoken text to Yoto Labs", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Yoto should not be called");
    };
    try {
      const response = await postJob(
        new Request("http://127.0.0.1:3847/api/yoto/job", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${"t".repeat(24)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            voiceId: PIPER_VOICE_ID,
            content: {
              title: "Pokefacts",
              content: {
                chapters: [
                  {
                    tracks: [
                      {
                        type: "elevenlabs",
                        trackUrl: "Bulbasaur is a small quadruped.",
                        voiceId: LILY_VOICE_ID,
                      },
                    ],
                  },
                ],
              },
            },
          }),
        }),
      );
      assert.equal(response.status, 400);
      const payload = (await response.json()) as { error?: string };
      assert.equal(payload.error, "Piper records on this computer.");
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
