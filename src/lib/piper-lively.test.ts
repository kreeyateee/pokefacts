import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXCITED_LIFT,
  joinWavs,
  liftPitch,
  PIPER_EXCITED_ARGS,
  PIPER_POKEDEX_ARGS,
  piperSentences,
} from "./piper-lively";

/** A mono 16-bit test tone, as Piper writes it. */
function toneWav(frequency: number, seconds: number, rate = 22050): Buffer {
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 12000), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8, "ascii");
  head.write("fmt ", 12, "ascii");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "ascii");
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

function samples(wav: Buffer): Int16Array {
  const data = wav.subarray(44);
  return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
}

function pitchOf(wav: Buffer, rate = 22050): number {
  const pcm = samples(wav);
  let rises = 0;
  for (let i = 1; i < pcm.length; i += 1) if (pcm[i - 1] < 0 && pcm[i] >= 0) rises += 1;
  return rises / (pcm.length / rate);
}

function setting(args: readonly string[], name: string): number {
  return Number(args[args.indexOf(name) + 1]);
}

describe("Livelier Piper", () => {
  it("splits a line into sentences and marks the excited ones", () => {
    const line = "Pikachu! It stores electricity in its cheeks. When it's angry, it lets it all out at once!";
    assert.deepEqual(piperSentences(line), [
      { text: "Pikachu!", excited: true },
      { text: "It stores electricity in its cheeks.", excited: false },
      { text: "When it's angry, it lets it all out at once!", excited: true },
    ]);
  });

  it("keeps quotes, questions and decimals inside their sentence", () => {
    assert.deepEqual(piperSentences("'Look out!' says Mabel. It weighs 6.9 kilograms."), [
      { text: "'Look out!' says Mabel.", excited: false },
      { text: "It weighs 6.9 kilograms.", excited: false },
    ]);
    assert.deepEqual(piperSentences("'What a team!' Are you ready?"), [
      { text: "'What a team!'", excited: true },
      { text: "Are you ready?", excited: false },
    ]);
    assert.deepEqual(piperSentences("Wow!! Really?!"), [
      { text: "Wow!!", excited: true },
      { text: "Really?!", excited: true },
    ]);
    assert.deepEqual(piperSentences("  "), []);
    // No exclamation mark is added to a plain line.
    assert.ok(piperSentences("It is calm. It sleeps.").every((sentence) => !sentence.excited));
  });

  it("reads plain sentences quicker than the old Pokédex cadence and excited ones quicker still", () => {
    const plain = setting(PIPER_POKEDEX_ARGS, "--length_scale");
    const excited = setting(PIPER_EXCITED_ARGS, "--length_scale") / EXCITED_LIFT;
    assert.ok(plain < 1.12);
    assert.ok(excited < plain);
    assert.ok(setting(PIPER_EXCITED_ARGS, "--noise_scale") > setting(PIPER_POKEDEX_ARGS, "--noise_scale"));
    assert.ok(setting(PIPER_EXCITED_ARGS, "--noise_w") > setting(PIPER_POKEDEX_ARGS, "--noise_w"));
    assert.ok(Math.abs(12 * Math.log2(EXCITED_LIFT) - 1) < 1e-9);
  });

  it("lifts a take by a semitone and shortens it to match", () => {
    const wav = toneWav(220, 1);
    const lifted = liftPitch(wav);
    assert.equal(lifted.toString("ascii", 0, 4), "RIFF");
    assert.equal(samples(lifted).length, Math.floor(22050 / EXCITED_LIFT));
    assert.ok(Math.abs(pitchOf(lifted) - 220 * EXCITED_LIFT) < 2, `${pitchOf(lifted)} Hz`);
  });

  it("joins sentence takes in order and refuses takes that do not match", () => {
    const a = toneWav(220, 0.5);
    const b = toneWav(440, 0.25);
    const joined = joinWavs([a, b]);
    assert.equal(samples(joined).length, samples(a).length + samples(b).length);
    assert.equal(joined.readUInt32LE(4), joined.length - 8);
    assert.deepEqual(samples(joined).subarray(0, 100), samples(a).subarray(0, 100));
    assert.throws(() => joinWavs([a, toneWav(220, 0.5, 16000)]), /did not match/);
    assert.throws(() => joinWavs([Buffer.from("not a wav")]), /did not write/);
  });
});
