/**
 * Writes every sound the Safari adventure plays, synthesised here from plain waves and noise.
 * Nothing is copied from the games or downloaded, so each sound can be tuned freely.
 *
 *   npx tsx scripts/make-safari-sounds.ts          every sound
 *   npx tsx scripts/make-safari-sounds.ts catch    just the ones named
 *
 * Effects are 128 kb/s MP3, like the card's tracks. Ambience and music loops are 64 kb/s and are
 * crossfaded end to start so they loop without a click. To use your own recording instead, replace
 * the file at that sound's path in src/lib/story/story-sound.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { YOTO_MP3_ARGS } from "../src/lib/cry-audio";
import { ffmpegCommand } from "../src/lib/ffmpeg-bin";
import {
  CATCH_CLICK,
  CATCH_WOBBLES,
  STORY_AMBIENCE,
  STORY_MUSIC,
  STORY_SOUNDS,
  type StoryAmbience,
  type StoryMusic,
  type StorySound,
} from "../src/lib/story/story-sound";

const RATE = 44100;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// A very small synthesiser

/** Repeatable noise, so the files only change when this script does. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (((value ^ (value >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE));
}

/** Adds `fn(t)` from `start` for `length` seconds, where t counts from the start of the note. */
function add(out: Float32Array, start: number, length: number, fn: (t: number) => number) {
  const first = Math.max(0, Math.round(start * RATE));
  const last = Math.min(out.length, Math.round((start + length) * RATE));
  for (let index = first; index < last; index += 1) out[index] = (out[index] ?? 0) + fn((index - first) / RATE);
}

/** Quick attack, exponential fall. */
const decay = (t: number, rate: number, attack = 0.004) => (t < attack ? t / attack : Math.exp(-(t - attack) * rate));

/** A soft swell in and out over `length`. */
const swell = (t: number, length: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, t / length))) ** 2;

const note = (name: string): number => {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!match) throw new Error(`Not a note: ${name}`);
  const steps: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const semis = (steps[match[1] as string] ?? 0) + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + (Number(match[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
};

/** A soft triangle-ish tone: sine with a little second and third harmonic. */
const warm = (freq: number, t: number) =>
  Math.sin(TAU * freq * t) + 0.25 * Math.sin(TAU * 2 * freq * t) + 0.08 * Math.sin(TAU * 3 * freq * t);

/** A bell: inharmonic partials that die at different speeds. */
const bell = (freq: number, t: number) =>
  Math.sin(TAU * freq * t) * Math.exp(-t * 3) +
  0.4 * Math.sin(TAU * freq * 2.76 * t) * Math.exp(-t * 6) +
  0.2 * Math.sin(TAU * freq * 5.4 * t) * Math.exp(-t * 10);

/** Noise through a one-pole low-pass. `cut` is roughly the cutoff in Hz. */
function lowNoise(random: () => number, cut: number): () => number {
  const k = 1 - Math.exp((-TAU * cut) / RATE);
  let low = 0;
  return () => {
    low += k * (random() - low);
    return low;
  };
}

/** Noise in a band: high-passed then low-passed. */
function bandNoise(random: () => number, low: number, high: number): () => number {
  const lp = lowNoise(random, high);
  const k = 1 - Math.exp((-TAU * low) / RATE);
  let floor = 0;
  return () => {
    const value = lp();
    floor += k * (value - floor);
    return value - floor;
  };
}

/** A two-pole resonant band-pass whose centre can move every sample. */
function resonator(q = 6) {
  let a = 0;
  let b = 0;
  return (input: number, freq: number) => {
    const f = 2 * Math.sin((Math.PI * Math.min(freq, RATE / 6)) / RATE);
    a += f * b;
    b += f * (input - a - b / q);
    return b;
  };
}

/** A short room so dry tones sit together. */
function reverb(out: Float32Array, mix = 0.25): Float32Array {
  const delays = [1557, 1617, 1491, 1422].map((d) => Math.round((d * RATE) / 44100));
  const lines = delays.map((d) => new Float32Array(d));
  const marks = delays.map(() => 0);
  const wet = new Float32Array(out.length);
  for (let index = 0; index < out.length; index += 1) {
    let sum = 0;
    lines.forEach((line, n) => {
      const mark = marks[n] as number;
      const echo = line[mark] ?? 0;
      line[mark] = (out[index] ?? 0) + echo * 0.78;
      marks[n] = (mark + 1) % line.length;
      sum += echo;
    });
    wet[index] = (out[index] ?? 0) * (1 - mix) + (sum / lines.length) * mix;
  }
  return wet;
}

/** Scales to a peak, so every file sits at a known level. */
function normalise(out: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const value of out) max = Math.max(max, Math.abs(value));
  if (max === 0) return out;
  return out.map((value) => (value / max) * peak);
}

/** Fades the start and the end so a one-shot never clicks. */
function edges(out: Float32Array, fadeIn = 0.005, fadeOut = 0.05): Float32Array {
  const a = Math.round(fadeIn * RATE);
  const b = Math.round(fadeOut * RATE);
  for (let index = 0; index < a && index < out.length; index += 1) out[index] = (out[index] ?? 0) * (index / a);
  for (let index = 0; index < b && index < out.length; index += 1) {
    const at = out.length - 1 - index;
    out[at] = (out[at] ?? 0) * (index / b);
  }
  return out;
}

/** Makes a loop seamless: the last `overlap` seconds fade into the first. */
function loopable(out: Float32Array, overlap = 1.5): Float32Array {
  const n = Math.round(overlap * RATE);
  const body = out.slice(0, out.length - n);
  for (let index = 0; index < n; index += 1) {
    const mix = index / n;
    body[index] = (body[index] ?? 0) * mix + (out[out.length - n + index] ?? 0) * (1 - mix);
  }
  return body;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), index * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function writeMp3(file: string, samples: Float32Array, loop: boolean) {
  const output = path.join(process.cwd(), "public", file);
  mkdirSync(path.dirname(output), { recursive: true });
  const args = loop
    ? ["-c:a", "libmp3lame", "-b:a", "64k", "-ar", "44100", "-ac", "1", "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0"]
    : [...YOTO_MP3_ARGS];
  execFileSync(ffmpegCommand(), ["-y", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", ...args, output], {
    input: wav(samples),
  });
  console.log(`Wrote ${file} (${(samples.length / RATE).toFixed(1)}s)`);
}

// ---------------------------------------------------------------------------
// Effects

/** One wobble: a low "dun" that drops in pitch, an octave above for small speakers, and a rattle. */
function wobble(out: Float32Array, at: number, level = 1) {
  add(out, at, 0.5, (t) => {
    const phase = TAU * (330 * t - 170 * t * t);
    const body = 0.55 * Math.sin(phase) + 0.3 * Math.sin(2 * phase);
    return level * (Math.exp(-t * 11) * body + 0.18 * Math.sin(TAU * 1150 * t) * Math.exp(-t * 90));
  });
}

function sparkle(out: Float32Array, at: number, notes: string[], gap = 0.09, level = 0.3) {
  notes.forEach((name, index) => add(out, at + index * gap, 1.2, (t) => level * bell(note(name), t)));
}

const EFFECTS: Record<StorySound, () => Float32Array> = {
  catch() {
    const out = buffer(2.6);
    for (const at of CATCH_WOBBLES) wobble(out, at);
    add(out, CATCH_CLICK, 0.05, (t) => 0.6 * Math.sign(Math.sin(TAU * 2600 * t)) * Math.exp(-t * 140));
    add(out, CATCH_CLICK + 0.06, 0.74, (t) => 0.22 * Math.sin(TAU * 1568 * t) * Math.exp(-t * 7));
    add(out, CATCH_CLICK + 0.17, 0.63, (t) => 0.22 * Math.sin(TAU * 2093 * t) * Math.exp(-t * 7));
    return edges(normalise(out, 0.89), 0.002, 0.25);
  },
  escape() {
    const out = buffer(1.9);
    const random = rng(7);
    wobble(out, CATCH_WOBBLES[0]);
    wobble(out, CATCH_WOBBLES[1], 1.1);
    const pop = 1.0;
    const crack = bandNoise(random, 900, 6000);
    add(out, pop, 0.25, (t) => 0.9 * crack() * decay(t, 30, 0.002));
    add(out, pop, 0.3, (t) => 0.5 * Math.sin(TAU * (300 * t + 2200 * t * t)) * decay(t, 12));
    sparkle(out, pop + 0.08, ["E6", "C6", "G5"], 0.07, 0.25);
    return edges(normalise(out, 0.89), 0.002, 0.2);
  },
  throw() {
    const out = buffer(0.7);
    const air = rng(11);
    const band = resonator(2.5);
    add(out, 0, 0.7, (t) => band(air(), 600 + 2600 * Math.sin(Math.PI * Math.min(1, t / 0.6))) * swell(t, 0.62));
    return edges(normalise(out, 0.7));
  },
  run() {
    const out = buffer(1.2);
    const random = rng(23);
    let at = 0.02;
    let gap = 0.13;
    for (let step = 0; step < 9; step += 1) {
      const tap = bandNoise(random, 300, 2500);
      const level = 0.9 * (1 - step / 10);
      add(out, at, 0.06, (t) => level * tap() * decay(t, 70, 0.002));
      at += gap;
      gap *= 0.9;
    }
    const air = bandNoise(rng(29), 800, 4000);
    add(out, 0.55, 0.6, (t) => 0.35 * air() * swell(t, 0.6));
    return edges(normalise(out, 0.75));
  },
  gate() {
    const out = buffer(1.9);
    const random = rng(31);
    const body = resonator(12);
    const friction = lowNoise(random, 40);
    add(out, 0, 1.45, (t) => {
      const pitch = 140 + 90 * Math.sin(t * 2.2) + 35 * friction();
      const grain = Math.sign(Math.sin(TAU * pitch * t)) * (0.5 + 0.5 * Math.abs(friction()) * 6);
      return 0.6 * body(grain, 900 + 300 * Math.sin(t * 3)) * swell(t, 1.45);
    });
    const thud = lowNoise(rng(37), 180);
    add(out, 1.5, 0.35, (t) => 1.2 * thud() * decay(t, 14) + 0.4 * Math.sin(TAU * 70 * t) * decay(t, 12));
    return edges(normalise(reverb(out, 0.2), 0.8));
  },
  whistle() {
    const out = buffer(1.1);
    const breath = bandNoise(rng(41), 1500, 7000);
    add(out, 0, 1.05, (t) => {
      const trill = 0.65 + 0.35 * Math.sin(TAU * 38 * t);
      const shape = Math.min(1, t / 0.03) * (t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.2) : 1);
      return shape * (0.8 * trill * Math.sin(TAU * (2850 + 40 * Math.sin(TAU * 5 * t)) * t) + 0.15 * breath());
    });
    return edges(normalise(out, 0.38));
  },
  footsteps() {
    const out = buffer(2.0);
    const random = rng(43);
    for (let step = 0; step < 4; step += 1) {
      const crunch = bandNoise(random, 200, 3000);
      const thump = lowNoise(random, 120);
      add(out, 0.05 + step * 0.45, 0.22, (t) => 0.7 * crunch() * decay(t, 18, 0.01) + 1.5 * thump() * decay(t, 25));
    }
    return edges(normalise(out, 0.6));
  },
  fanfare() {
    const out = buffer(2.2);
    const run = ["C5", "E5", "G5"];
    run.forEach((name, index) =>
      add(out, index * 0.12, 0.3, (t) => 0.5 * warm(note(name), t) * decay(t, 9)),
    );
    for (const name of ["C5", "E5", "G5", "C6"]) {
      add(out, 0.4, 1.6, (t) => 0.3 * warm(note(name), t) * decay(t, 2.2, 0.02) * (1 + 0.05 * Math.sin(TAU * 5 * t)));
    }
    sparkle(out, 0.42, ["G6", "C7"], 0.1, 0.12);
    return edges(normalise(reverb(out, 0.25), 0.7), 0.002, 0.3);
  },
  ending() {
    const out = buffer(2.6);
    ["G4", "E5", "D5", "C5"].forEach((name, index) =>
      add(out, index * 0.28, 1.6, (t) => 0.5 * bell(note(name), t)),
    );
    for (const name of ["C4", "G4", "E5"]) add(out, 1.1, 1.5, (t) => 0.18 * warm(note(name), t) * swell(t, 1.5));
    return edges(normalise(reverb(out, 0.3), 0.65), 0.002, 0.4);
  },
  golden() {
    const out = buffer(3.6);
    ["C5", "E5", "G5", "C6", "E6", "G6"].forEach((name, index) =>
      add(out, index * 0.1, 0.4, (t) => 0.4 * warm(note(name), t) * decay(t, 7)),
    );
    for (const name of ["C4", "G4", "C5", "E5", "G5", "C6"]) {
      add(out, 0.7, 2.6, (t) => 0.2 * warm(note(name), t) * decay(t, 1.2, 0.03) * (1 + 0.06 * Math.sin(TAU * 5.5 * t)));
    }
    const random = rng(53);
    for (let n = 0; n < 14; n += 1) {
      const pitch = 2000 + 3000 * Math.abs(random());
      add(out, 0.8 + n * 0.15, 0.5, (t) => 0.07 * Math.sin(TAU * pitch * t) * decay(t, 12));
    }
    return edges(normalise(reverb(out, 0.3), 0.75), 0.002, 0.5);
  },
};

// ---------------------------------------------------------------------------
// Ambience: 16 seconds each, made to loop

const BED_SECONDS = 17.5;

function chirps(out: Float32Array, random: () => number, count: number, level: number, low = 2500, high = 5200) {
  for (let n = 0; n < count; n += 1) {
    const at = Math.abs(random()) * (BED_SECONDS - 1);
    const base = low + Math.abs(random()) * (high - low);
    const notes = 2 + Math.floor(Math.abs(random()) * 4);
    for (let k = 0; k < notes; k += 1) {
      const up = random() > 0 ? 1 : -1;
      add(out, at + k * 0.11, 0.09, (t) => level * Math.sin(TAU * (base * t + up * 3000 * t * t)) * swell(t, 0.09));
    }
  }
}

function crickets(out: Float32Array, random: () => number, level: number, pitch = 4600) {
  const rate = 0.55 + Math.abs(random()) * 0.2;
  for (let at = Math.abs(random()) * 0.4; at < BED_SECONDS; at += rate) {
    for (let k = 0; k < 3; k += 1) {
      add(out, at + k * 0.045, 0.03, (t) => level * Math.sin(TAU * pitch * t) * swell(t, 0.03));
    }
  }
}

function breeze(out: Float32Array, random: () => number, level: number, low = 200, high = 1600, speed = 0.15) {
  const air = bandNoise(random, low, high);
  const offset = Math.abs(random()) * 10;
  add(out, 0, BED_SECONDS, (t) => level * air() * (0.55 + 0.45 * Math.sin(TAU * speed * (t + offset)) ** 2));
}

const AMBIENCE: Record<StoryAmbience, () => Float32Array> = {
  gate() {
    const out = buffer(BED_SECONDS);
    const random = rng(101);
    breeze(out, random, 0.35, 150, 900, 0.1);
    chirps(out, random, 9, 0.12);
    return out;
  },
  grass() {
    const out = buffer(BED_SECONDS);
    const random = rng(103);
    const rustle = bandNoise(random, 1500, 7000);
    const sway = lowNoise(random, 0.6);
    add(out, 0, BED_SECONDS, (t) => 0.5 * rustle() * Math.max(0.15, 0.5 + 6 * sway()) * (0.6 + 0.4 * Math.sin(TAU * 0.13 * t) ** 2));
    crickets(out, random, 0.07);
    chirps(out, random, 4, 0.07);
    return out;
  },
  woods() {
    const out = buffer(BED_SECONDS);
    const random = rng(107);
    breeze(out, random, 0.18, 100, 600, 0.07);
    crickets(out, random, 0.06, 5200);
    crickets(out, random, 0.04, 3900);
    for (const at of [2.5, 10.5]) {
      for (const [offset, pitch, length] of [
        [0, 410, 0.35],
        [0.5, 360, 0.3],
        [0.85, 360, 0.55],
      ] as const) {
        add(out, at + offset, length, (t) => 0.22 * Math.sin(TAU * pitch * t) * swell(t, length));
      }
    }
    return out;
  },
  cave() {
    const out = buffer(BED_SECONDS);
    const random = rng(109);
    const rumble = lowNoise(random, 60);
    add(out, 0, BED_SECONDS, () => 2.2 * rumble());
    for (let n = 0; n < 11; n += 1) {
      const at = Math.abs(random()) * (BED_SECONDS - 1);
      const pitch = 900 + Math.abs(random()) * 900;
      add(out, at, 0.25, (t) => 0.3 * Math.sin(TAU * (pitch * t + 900 * t * t)) * decay(t, 25));
      add(out, at + 0.18, 0.25, (t) => 0.08 * Math.sin(TAU * (pitch * t + 900 * t * t)) * decay(t, 25));
    }
    return reverb(out, 0.45);
  },
  mountain() {
    const out = buffer(BED_SECONDS);
    const random = rng(113);
    const air = rng(127);
    const howl = resonator(9);
    const drift = lowNoise(random, 0.3);
    add(out, 0, BED_SECONDS, (t) => {
      const gust = 0.5 + 0.5 * Math.sin(TAU * 0.09 * t + 1.3) ** 2;
      return 0.7 * gust * howl(air(), 500 + 250 * Math.sin(TAU * 0.05 * t) + 4000 * drift());
    });
    breeze(out, random, 0.25, 100, 500, 0.06);
    return out;
  },
  canyon() {
    const out = buffer(BED_SECONDS);
    const random = rng(131);
    breeze(out, random, 0.4, 300, 2500, 0.11);
    for (let n = 0; n < 6; n += 1) {
      const at = 1 + Math.abs(random()) * (BED_SECONDS - 3);
      for (let k = 0; k < 3; k += 1) {
        const tick = bandNoise(random, 1500, 6000);
        add(out, at + k * (0.08 + k * 0.03), 0.03, (t) => 0.35 * tick() * decay(t, 120));
      }
    }
    return out;
  },
  sea() {
    const out = buffer(BED_SECONDS);
    const random = rng(137);
    const surf = lowNoise(random, 900);
    const hiss = bandNoise(random, 2000, 8000);
    add(out, 0, BED_SECONDS, (t) => {
      const wave = Math.sin(Math.PI * ((t % 5.8) / 5.8)) ** 3;
      return 1.4 * surf() * (0.25 + wave) + 0.12 * hiss() * wave;
    });
    return out;
  },
  lake() {
    const out = buffer(BED_SECONDS);
    const random = rng(139);
    const water = lowNoise(random, 500);
    add(out, 0, BED_SECONDS, (t) => 1.1 * water() * (0.35 + 0.65 * Math.sin(Math.PI * ((t % 2.3) / 2.3)) ** 2));
    for (let n = 0; n < 7; n += 1) {
      const at = Math.abs(random()) * (BED_SECONDS - 1);
      add(out, at, 0.2, (t) => 0.2 * Math.sin(TAU * (700 * t - 900 * t * t)) * decay(t, 18));
    }
    for (const at of [3.1, 3.5, 11.2]) {
      add(out, at, 0.3, (t) => 0.2 * Math.sign(Math.sin(TAU * 140 * t)) * Math.sin(TAU * 18 * t) ** 2 * swell(t, 0.3));
    }
    chirps(out, random, 3, 0.05);
    return out;
  },
  house() {
    const out = buffer(BED_SECONDS);
    const random = rng(149);
    const room = lowNoise(random, 300);
    add(out, 0, BED_SECONDS, () => 0.6 * room());
    for (let at = 0.2; at < BED_SECONDS; at += 1) {
      const pitch = Math.round(at) % 2 === 0 ? 2400 : 2000;
      add(out, at, 0.04, (t) => 0.18 * Math.sin(TAU * pitch * t) * decay(t, 120));
    }
    chirps(out, random, 4, 0.04);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Music: gentle loops, one mood each

const BEAT = 0.5;

/** Plays a list of [beat, note, beats] with a voice function. */
function play(out: Float32Array, notes: Array<[number, string, number]>, voice: (freq: number, t: number, length: number) => number, beat = BEAT) {
  for (const [at, name, beats] of notes) {
    const length = beats * beat;
    add(out, at * beat, length + 0.6, (t) => voice(note(name), t, length));
  }
}

const pluck = (level: number) => (freq: number, t: number) => level * warm(freq, t) * decay(t, 5);
const pad = (level: number) => (freq: number, t: number, length: number) =>
  level * Math.sin(TAU * freq * t) * (1 + 0.3 * Math.sin(TAU * 2 * freq * t)) * swell(t, length + 0.5);
const chime = (level: number) => (freq: number, t: number) => level * bell(freq, t);

/** Repeats a pattern of `beats` beats `times` times. */
function repeat(pattern: Array<[number, string, number]>, beats: number, times: number): Array<[number, string, number]> {
  return Array.from({ length: times }, (_, n) => pattern.map(([at, name, length]) => [at + n * beats, name, length] as [number, string, number])).flat();
}

const MUSIC: Record<StoryMusic, () => Float32Array> = {
  bright() {
    const out = buffer(17.5);
    const chords = [
      ["C4", "E4", "G4", "E4"],
      ["F4", "A4", "C5", "A4"],
      ["G4", "B4", "D5", "B4"],
      ["C4", "E4", "G4", "C5"],
    ];
    play(out, chords.flatMap((chord, bar) => chord.flatMap((name, k) => [[bar * 8 + k * 2, name, 1], [bar * 8 + k * 2 + 1, name, 1]] as Array<[number, string, number]>)).slice(0, 64), pluck(0.22), 0.25 * 2);
    play(out, [[0, "C3", 7], [8, "F2", 7], [16, "G2", 7], [24, "C3", 7]], pad(0.18), 0.25 * 2);
    play(out, [[2, "G5", 1], [3, "E5", 1], [10, "A5", 1], [11, "F5", 1], [18, "B5", 1], [19, "G5", 1], [28, "C6", 2]], chime(0.12), 0.5);
    return loopable(reverb(out, 0.2));
  },
  calm() {
    const out = buffer(17.5);
    play(out, [[0, "F3", 8], [0, "A3", 8], [0, "E4", 8], [8, "C3", 8], [8, "G3", 8], [8, "E4", 8], [16, "F3", 8], [16, "A3", 8], [16, "C4", 8]], pad(0.16), 0.66);
    play(out, [[1, "A5", 2], [4, "G5", 2], [9, "E5", 2], [12, "G5", 2], [17, "C6", 3]], chime(0.12), 0.66);
    return loopable(reverb(out, 0.35));
  },
  mysterious() {
    const out = buffer(17.5);
    play(out, [[0, "A2", 8], [0, "E3", 8], [8, "F2", 8], [8, "C3", 8], [16, "A2", 8], [16, "E3", 8]], pad(0.2), 0.7);
    play(out, [[1, "E5", 1], [2, "F#5", 1], [3, "G#5", 2], [9, "C5", 1], [10, "D5", 1], [11, "E5", 2], [17, "B4", 1], [18, "C5", 1], [19, "E5", 3]], chime(0.13), 0.7);
    return loopable(reverb(out, 0.45));
  },
  adventure() {
    const out = buffer(17.5);
    play(out, repeat([[0, "D3", 1], [1, "A3", 1], [2, "D4", 1], [3, "A3", 1], [4, "C3", 1], [5, "G3", 1], [6, "C4", 1], [7, "G3", 1]], 8, 4), pluck(0.2), 0.5);
    const tick = bandNoise(rng(211), 3000, 9000);
    for (let at = 0; at < 16; at += 0.5) add(out, at, 0.05, (t) => 0.06 * tick() * decay(t, 80));
    play(out, [[2, "F4", 2], [4, "E4", 2], [10, "A4", 3], [18, "D5", 2], [20, "C5", 2], [26, "A4", 4]], pad(0.1), 0.5);
    return loopable(reverb(out, 0.2));
  },
  tense() {
    const out = buffer(16.5);
    play(out, repeat([[0, "E2", 0.5], [0.5, "E2", 0.5], [1, "F2", 0.5], [1.5, "E2", 0.5]], 2, 15), pluck(0.28), 0.5);
    play(out, [[0, "B3", 8], [8, "C4", 8], [16, "B3", 8], [24, "A#3", 6]], pad(0.1), 0.5);
    return loopable(reverb(out, 0.15), 1);
  },
  homely() {
    const out = buffer(17.5);
    const box = chime(0.15);
    play(out, repeat([[0, "C5", 1], [1, "E5", 1], [2, "G5", 1], [3, "E5", 1], [4, "F5", 1], [5, "A5", 1], [6, "G5", 2]], 8, 2), box, 0.55);
    play(out, [[0, "C3", 4], [4, "F3", 4], [8, "C3", 4], [12, "G3", 4]], pad(0.12), 1.1);
    return loopable(reverb(out, 0.25));
  },
  magical() {
    const out = buffer(17.5);
    play(out, repeat([[0, "C5", 1], [1, "G5", 1], [2, "E6", 1], [3, "G5", 1], [4, "B4", 1], [5, "G5", 1], [6, "D6", 1], [7, "G5", 1]], 8, 4), chime(0.11), 0.25);
    play(out, [[0, "C4", 16], [0, "E4", 16], [0, "G4", 16], [16, "A3", 16], [16, "E4", 16], [16, "C5", 16]], pad(0.12), 0.25 * 2);
    return loopable(reverb(out, 0.4));
  },
};

// ---------------------------------------------------------------------------

const wanted = new Set(process.argv.slice(2));
const pick = (name: string) => wanted.size === 0 || wanted.has(name);

for (const [name, make] of Object.entries(EFFECTS) as Array<[StorySound, () => Float32Array]>) {
  if (pick(name)) writeMp3(STORY_SOUNDS[name], make(), false);
}
for (const [name, make] of Object.entries(AMBIENCE) as Array<[StoryAmbience, () => Float32Array]>) {
  if (pick(name)) writeMp3(STORY_AMBIENCE[name], normalise(loopable(make()), 0.7), true);
}
for (const [name, make] of Object.entries(MUSIC) as Array<[StoryMusic, () => Float32Array]>) {
  if (pick(name)) writeMp3(STORY_MUSIC[name], normalise(make(), 0.7), true);
}
