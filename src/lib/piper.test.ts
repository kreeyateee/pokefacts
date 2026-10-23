import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { POST as postJob } from "../app/api/yoto/job/route";
import { cryUrl, inputContainer } from "./cry-audio";
import { ffmpegCommand } from "./ffmpeg-bin";
import { factsPlaylistUpload, LILY_VOICE_ID } from "./kid-cards";
import {
  PIPER_EXCITED_ARGS,
  piperReleaseArchive,
  piperSpeechCommand,
  PIPER_POKEDEX_ARGS,
  synthesizePiper,
  type PiperCommand,
} from "./piper";
import {
  PICKER_VOICES,
  PIPER_MODEL_NAME,
  PIPER_SYNTH_ID,
  PIPER_VOICE_ID,
  pickerVoice,
  piperCacheToken,
} from "./piper-voice";
import { demoHearBody, factTrackBody, readVoiceId, voiceSampleBody, writeVoiceId } from "./voice-choice";
import { prepareFactTrack, renderedCacheKey } from "./yoto-fact-audio";
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
    assert.equal(readVoiceId({ getItem: () => null }), LILY_VOICE_ID);
    assert.equal(voiceSampleBody().voiceId, LILY_VOICE_ID);
    assert.equal(voiceSampleBody("").voiceId, LILY_VOICE_ID);
    assert.equal(pickerVoice(undefined).id, LILY_VOICE_ID);
    assert.equal(pickerVoice("").name, "Lily");
    assert.equal(PICKER_VOICES[0]?.id, LILY_VOICE_ID);
    assert.equal(writeVoiceId(storage, PIPER_VOICE_ID), PIPER_VOICE_ID);
    assert.equal(memory.value, PIPER_VOICE_ID);
    const sample = voiceSampleBody(PIPER_VOICE_ID);
    assert.equal(sample.voiceId, PIPER_VOICE_ID);
    assert.equal(sample.dexId, undefined);
    assert.equal("dexId" in sample, false);
    assert.match(sample.text, /Pikachu/);
    assert.equal(sample.title, "Voice sample");
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
      ...PIPER_POKEDEX_ARGS,
    ]);
    assert.equal(spec.args.includes("--length_scale"), true);
    assert.equal(spec.input, "Bulbasaur is a small quadruped.");
    assert.equal(JSON.stringify(spec).includes("elevenlabs"), false);
    assert.equal(JSON.stringify(spec).includes(LILY_VOICE_ID), false);
    assert.equal(piperCacheToken(PIPER_VOICE_ID), PIPER_SYNTH_ID);
    assert.equal(piperCacheToken(LILY_VOICE_ID), "");
  });

  it("gives Piper a tagged script without its tags, and with Piper's respellings", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-piper-tags-"));
    const wavPath = path.join(dir, "speech.wav");
    await sine(wavPath, 440, "wav");
    const wav = await readFile(wavPath);
    const seen: PiperCommand[] = [];
    try {
      const said = await synthesizePiper("{excited} Pikachu meets {whispers} Gyarados.", {
        download: false,
        run: async (command) => {
          seen.push(command);
          return wav;
        },
      });
      assert.equal(said, wav);
      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.input, "Peekachoo meets Ghyara dos.");
      assert.equal(/[{}[\]]|excited|whispers/.test(seen[0]?.input ?? ""), false);
      assert.deepEqual(seen[0]?.args.slice(-PIPER_POKEDEX_ARGS.length), [...PIPER_POKEDEX_ARGS]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads excited sentences in their own run and joins every take in order", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-piper-lively-"));
    const wavPath = path.join(dir, "speech.wav");
    await sine(wavPath, 440, "wav");
    const wav = await readFile(wavPath);
    const seen: Array<PiperCommand & { outputs?: string[] }> = [];
    try {
      const said = await synthesizePiper("Pikachu! It stores electricity. It lets it all out at once!", {
        download: false,
        run: async (command: PiperCommand & { outputs?: string[] }) => {
          seen.push(command);
          for (const file of command.outputs ?? []) await writeFile(file, wav);
          return wav;
        },
      });
      assert.equal(seen.length, 2);
      const [plain, excited] = seen;
      assert.ok(plain?.args.includes("--json-input"));
      assert.deepEqual(plain?.args.slice(-PIPER_POKEDEX_ARGS.length), [...PIPER_POKEDEX_ARGS]);
      assert.deepEqual(excited?.args.slice(-PIPER_EXCITED_ARGS.length), [...PIPER_EXCITED_ARGS]);
      const texts = (command?: PiperCommand) =>
        (command?.input ?? "").split("\n").map((line) => (JSON.parse(line) as { text: string }).text);
      assert.deepEqual(texts(plain), ["It stores electricity."]);
      assert.deepEqual(texts(excited), ["Peekachoo!", "It lets it all out at once!"]);
      assert.equal(said.toString("ascii", 0, 4), "RIFF");
      // One plain take and two lifted (shorter) takes.
      assert.ok(said.length > wav.length * 2 && said.length < wav.length * 3);

      // A line with no "!" is one run, as before.
      seen.length = 0;
      await synthesizePiper("It is calm. Is it asleep?", { download: false, run: async (command) => (seen.push(command), wav) });
      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.input, "It is calm. Is it asleep?");
      assert.equal(seen[0]?.args.includes("--json-input"), false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downloads the Linux x86_64 Piper binary on Oracle Pokefacts", () => {
    const archive = piperReleaseArchive("linux", "x64");
    assert.equal(archive?.name, "piper_linux_x86_64.tar.gz");
    assert.match(archive?.url ?? "", /piper_linux_x86_64\.tar\.gz$/);
    assert.equal(piperReleaseArchive("linux", "arm64")?.name, "piper_linux_aarch64.tar.gz");
    assert.equal(piperReleaseArchive("win32", "x64")?.name, "piper_windows_amd64.zip");
    assert.equal(piperReleaseArchive("linux", "ia32"), null);
  });

  it("misses old Piper mixes after the Pokédex cadence change and leaves Lily keys alone", () => {
    const text = "Bulbasaur. A strange seed was planted on its back at birth.";
    const lily = renderedCacheKey(text, 1, LILY_VOICE_ID);
    const piper = renderedCacheKey(text, 1, PIPER_VOICE_ID);
    const oldLily = createHash("sha256")
      .update(Buffer.from(`${LILY_VOICE_ID}\nvolume=4\npad=0.35\n1\n${text}`))
      .digest("hex");
    const oldPiper = createHash("sha256")
      .update(Buffer.from(`${PIPER_VOICE_ID}\nvolume=4\npad=0.35\n1\n${text}`))
      .digest("hex");
    assert.equal(lily, oldLily);
    assert.notEqual(piper, oldPiper);
    assert.notEqual(piper, lily);
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
