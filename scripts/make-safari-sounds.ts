/**
 * Writes every sound the adventures play, synthesised here from plain waves and noise with the building
 * blocks in sound-kit.ts. Nothing is copied from the games or downloaded, so each sound can be tuned freely.
 *
 *   npx tsx scripts/make-safari-sounds.ts          every sound
 *   npx tsx scripts/make-safari-sounds.ts catch    just the ones named
 *
 * Effects are 128 kb/s MP3, like the card's tracks. Ambience and music loops are 64 kb/s and are
 * crossfaded end to start so they loop without a click. Effects and ambience are brought to the loudness
 * in LOUDNESS, so a new version of a sound sits in the mix with the voices exactly where the old one did.
 * To use your own recording instead, replace the file at that sound's path in src/lib/story/story-sound.ts.
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
import {
  RATE,
  TAU,
  VOWELS,
  add,
  bandNoise,
  between,
  blendVowel,
  brighter,
  brass,
  buffer,
  celesta,
  choir,
  clap,
  cymbal,
  decay,
  edges,
  filterAll,
  glock,
  held,
  loopable,
  lowNoise,
  master,
  modes,
  mouth,
  normalise,
  note,
  pinkNoise,
  resonator,
  reverb,
  rng,
  room,
  saw,
  shout,
  sine,
  strike,
  strings,
  svf,
  swell,
  timpani,
  type Vowel,
} from "./sound-kit";

/**
 * How loud each sound is, in LUFS. These are the loudnesses of the first set, measured with ffmpeg, so the
 * effects and beds keep the same place under and between the voices whatever their recipe becomes.
 */
const LOUDNESS: Record<StorySound, number> & Record<`bed-${StoryAmbience}`, number> = {
  catch: -18.5,
  escape: -20.5,
  throw: -13.6,
  run: -19.4,
  gate: -15.6,
  whistle: -13.4,
  footsteps: -24.6,
  fanfare: -18.2,
  ending: -17.9,
  golden: -19.2,
  hit: -14.6,
  fizzle: -19.5,
  cheer: -17.2,
  badge: -18.4,
  "bed-gate": -19.0,
  "bed-grass": -12.7,
  "bed-woods": -20.8,
  "bed-cave": -21.6,
  "bed-mountain": -19.6,
  "bed-canyon": -14.9,
  "bed-sea": -17.8,
  "bed-lake": -19.0,
  "bed-house": -17.5,
  "bed-stadium": -17.1,
};

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

/**
 * Adds a layer into `out` at a set RMS level. Layers made in very different ways (a buzz, a noise, a ring)
 * come out at wildly different sizes, so each is balanced by how loud it is rather than by its numbers.
 */
function blend(out: Float32Array, part: Float32Array, level: number) {
  let sum = 0;
  for (const value of part) sum += value * value;
  const rms = Math.sqrt(sum / Math.max(1, part.length));
  if (rms === 0) return;
  for (let index = 0; index < out.length; index += 1) out[index] = (out[index] ?? 0) + ((part[index] ?? 0) * level) / rms;
}

// ---------------------------------------------------------------------------
// Effects

/** The hollow plastic shell of a Poké Ball: [frequency, level, decay per second]. */
const SHELL = [
  [420, 1, 38],
  [890, 0.6, 45],
  [1530, 0.35, 60],
  [2380, 0.18, 80],
] as const;

/** The metal catch in the button. */
const LATCH = [
  [2350, 1, 70],
  [3910, 0.6, 95],
  [5620, 0.35, 130],
  [7300, 0.2, 170],
] as const;

/**
 * One wobble of a Poké Ball rocking on the ground: the thump of it tipping, the hollow knock of its shell,
 * the low "dun" children know, and two smaller knocks as it settles back.
 */
function wobble(out: Float32Array, at: number, random: () => number, level = 1) {
  const part = buffer(0.8);
  const knock = modes(SHELL, 0.0015);
  add(part, 0, 0.4, (t) => 0.8 * Math.sin(TAU * (210 * t - 110 * t * t)) * strike(t, 0.004, 14));
  add(part, 0, 0.3, (t) => 0.3 * knock(t));
  const contact = svf("low");
  add(part, 0, 0.05, (t) => 2 * contact(random(), 1600) * strike(t, 0.002, 80));
  add(part, 0, 0.45, (t) => 0.45 * Math.sin(TAU * (330 * t - 170 * t * t)) * strike(t, 0.006, 9));
  for (const [delay, size] of [
    [0.12, 0.2],
    [0.2, 0.1],
  ] as const) {
    add(part, delay, 0.2, (t) => size * knock(t));
  }
  add(out, at, part.length / RATE, (t) => level * (part[Math.round(t * RATE)] ?? 0));
}

/** The button clicking shut: a crisp snap, the ring of the metal catch, then the catch settling a moment later. */
function latch(out: Float32Array, at: number, random: () => number) {
  const snap = svf("high");
  add(out, at, 0.03, (t) => 0.6 * snap(random(), 2500) * strike(t, 0.0006, 200));
  const ping = modes(LATCH, 0.0006);
  add(out, at, 0.15, (t) => 0.3 * ping(t));
  add(out, at, 0.15, (t) => 0.35 * Math.sin(TAU * 180 * t) * strike(t, 0.002, 35));
  const settle = modes([
    [1650, 1, 90],
    [2900, 0.5, 120],
  ] as const, 0.0006);
  const tick = svf("high");
  add(out, at + 0.024, 0.1, (t) => 0.2 * settle(t) + 0.25 * tick(random(), 2000) * strike(t, 0.0006, 250));
}

/** A crowd cheering from `at` for `length` seconds: people shouting, hands clapping, and the roar under them. */
function crowd(out: Float32Array, at: number, length: number, random: () => number, voices: number, clappers: number) {
  const cries: ReadonlyArray<readonly [Vowel, Vowel]> = [
    ["eh", "ee"],
    ["oo", "oo"],
    ["oo", "eh"],
    ["ah", "eh"],
    ["ah", "ah"],
  ];
  const shouts = new Float32Array(out.length);
  for (let n = 0; n < voices; n += 1) {
    const child = random() > -0.2;
    const freq = child ? between(random, 280, 460) : between(random, 140, 260);
    const start = at + Math.abs(random()) ** 2 * 0.6;
    const left = at + length - start;
    const span = between(random, Math.min(0.6, left), Math.min(1.6, left));
    const cry = cries[Math.floor(Math.abs(random()) * cries.length)] ?? ["eh", "ee"];
    const size = between(random, 0.4, 1);
    const voice = shout(freq, span, cry, random, { child, rise: between(random, 0.15, 0.45) });
    add(shouts, start, span, (t) => size * voice(t));
  }
  const hands = new Float32Array(out.length);
  for (let n = 0; n < clappers; n += 1) {
    const centre = between(random, 900, 2400);
    const rate = between(random, 3.4, 5);
    for (let when = at + 0.1 + Math.abs(random()) * 0.3; when < at + length - 0.1; when += (1 / rate) * (1 + 0.08 * random())) {
      const hand = clap(random, centre);
      const size = swell(when - at, length);
      add(hands, when, 0.05, (t) => size * hand(t));
    }
  }
  const roar = new Float32Array(out.length);
  const pink = pinkNoise(random);
  const [chest, throat] = [svf("band"), svf("band")];
  add(roar, at, length, (t) => {
    const value = pink();
    return (chest(value, 1000, 0.9) + 0.7 * throat(value, 2200, 1.2)) * swell(t, length);
  });
  // A crowd heard from the stands has little below the voices themselves, so the rumble is taken out.
  blend(out, filterAll(shouts, "high", 250), 1);
  blend(out, hands, 0.45);
  blend(out, filterAll(roar, "high", 250), 0.5);
}

const EFFECTS: Record<StorySound, () => Float32Array> = {
  catch() {
    const out = buffer(2.9);
    const random = rng(5);
    for (const at of CATCH_WOBBLES) wobble(out, at, random);
    latch(out, CATCH_CLICK, random);
    // A warm little chime: it's caught.
    const low = celesta(note("G5"));
    const high = celesta(note("C6"));
    const top = glock(note("C7"));
    add(out, CATCH_CLICK + 0.08, 1, (t) => 0.2 * low(t));
    add(out, CATCH_CLICK + 0.2, 0.9, (t) => 0.2 * high(t) + 0.04 * top(t));
    return edges(room(out, { size: 0.45, mix: 0.18, damp: 0.5 }), 0.002, 0.25);
  },
  escape() {
    // Two wobbles, then the ball opens with a soft pop and a happy little bloop, and the Pokémon skips off
    // with a twinkle: no burst, nothing harsh. It got away, and that's fine.
    const out = buffer(2.3);
    const random = rng(7);
    wobble(out, CATCH_WOBBLES[0], random);
    wobble(out, CATCH_WOBBLES[1], random, 0.9);
    const pop = 1.0;
    const puff = svf("low");
    add(out, pop, 0.2, (t) => 0.5 * puff(random(), 1800) * strike(t, 0.004, 30));
    const bloop = sine();
    add(out, pop + 0.02, 0.22, (t) => 0.4 * bloop(380 * 2 ** (t * 6)) * strike(t, 0.006, 16));
    // A light twinkle rising: off it goes.
    ["G5", "C6", "E6"].forEach((name, index) => {
      const bar = celesta(note(name));
      add(out, pop + 0.15 + index * 0.09, 0.9, (t) => 0.14 * bar(t));
    });
    return edges(room(out, { size: 0.45, mix: 0.18 }), 0.002, 0.2);
  },
  throw() {
    // A ball spinning through the air: a rush that rises and falls as it passes, with the whirr of the spin.
    const out = buffer(0.8);
    const air = rng(11);
    const band = svf("band");
    const body = svf("low");
    add(out, 0, 0.7, (t) => {
      const p = Math.min(1, t / 0.62);
      const centre = 500 + 2400 * Math.sin(Math.PI * p) ** 1.5 * (1 - 0.25 * p);
      const spin = 1 - 0.35 * (0.5 + 0.5 * Math.sin(TAU * (14 * t + 6 * t * t)));
      const value = air();
      return swell(t, 0.62) * spin * (band(value, centre, 1.8) + 0.6 * body(value, 320));
    });
    return edges(room(out, { size: 0.3, mix: 0.1 }));
  },
  run() {
    // A Pokémon scampering off: quick four-footed steps fading into the distance, then a dive into the bushes.
    const out = buffer(1.5);
    const random = rng(23);
    const gait = [0, 0.045, 0.12, 0.165];
    let at = 0.02;
    for (let stride = 0; stride < 4; stride += 1) {
      for (const offset of gait) {
        const step = at + offset;
        const far = Math.min(1, step / 1.1);
        const level = 1 - 0.7 * far;
        const thud = svf("low");
        const brush = svf("band");
        add(out, step, 0.14, (t) =>
          level * (1.6 * thud(random(), 420) * strike(t, 0.003, 32) + 0.35 * brush(random(), 2600 - 1500 * far, 0.9) * strike(t, 0.006, 45)),
        );
      }
      at += 0.27 - stride * 0.02;
    }
    for (let n = 0; n < 40; n += 1) {
      const when = between(random, 0.95, 1.3);
      const length = between(random, 0.012, 0.03);
      const centre = between(random, 1800, 4500);
      const leaf = svf("band");
      add(out, when, length, (t) => 0.35 * leaf(random(), centre, 1.5) * swell(t, length));
    }
    return edges(room(out, { size: 0.5, mix: 0.22, damp: 0.5 }), 0.005, 0.15);
  },
  gate() {
    const out = buffer(2.3);
    const random = rng(31);
    // The hinge: wood sticking and slipping, a stream of tiny catches (their rate is the creak's pitch)
    // that ring the boards of the gate.
    const creak = buffer(2.3);
    const [boards, rail, nails] = [svf("band"), svf("band"), svf("band")];
    const drift = lowNoise(random, 5);
    let phase = 0;
    add(creak, 0, 1.45, (t) => {
      const pitch = 70 + 80 * Math.sin(Math.PI * Math.min(1, t / 1.45)) ** 0.7 + 1500 * drift();
      phase += pitch / RATE;
      let slip = 0;
      if (phase >= 1) {
        phase -= 1;
        slip = 1 + 0.4 * random();
      }
      const ring = boards(slip, 380, 9) + 0.7 * rail(slip, 960, 11) + 0.4 * nails(slip, 1800, 14);
      return ring * swell(t, 1.45) * (0.65 + 0.35 * Math.abs(Math.sin(TAU * 1.6 * t)));
    });
    // It swings shut against the post.
    const shut = buffer(2.3);
    const post = modes([
      [140, 1, 9],
      [300, 0.6, 14],
      [610, 0.35, 22],
      [1150, 0.15, 35],
    ] as const, 0.002);
    const thud = svf("low");
    add(shut, 1.5, 0.7, (t) => post(t) + 1.5 * thud(random(), 400) * strike(t, 0.002, 25));
    blend(out, creak, 1);
    blend(out, shut, 0.8);
    return edges(room(out, { size: 0.55, mix: 0.2, damp: 0.5 }));
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
    // Soft steps through long grass: heel then toe, each a muffled pad into the earth with the grass
    // crunching softly under it. Every grain is rounded, so nothing clicks.
    const out = buffer(2.5);
    const random = rng(43);
    [0.08, 0.6, 1.08, 1.62].forEach((at, step) => {
      const level = step % 2 === 0 ? 1 : 0.85;
      for (const [offset, size] of [
        [0, 1],
        [0.08, 0.6],
      ] as const) {
        const pad = svf("low");
        add(out, at + offset, 0.35, (t) => level * size * 2.4 * pad(random(), 380) * strike(t, 0.025, 13));
      }
      for (let n = 0; n < 28; n += 1) {
        const when = at + 0.01 + Math.abs(random()) ** 1.6 * 0.24;
        const length = between(random, 0.012, 0.03);
        const centre = between(random, 800, 2200);
        const size = 0.55 * (1 - (when - at) / 0.3);
        const blade = svf("band");
        add(out, when, length, (t) => level * size * blade(random(), centre, 1.3) * swell(t, length));
      }
    });
    const rustle = svf("band");
    add(out, 0, 2.4, (t) => 0.03 * rustle(random(), 2500, 0.6) * swell(t, 2.4));
    return edges(room(filterAll(out, "low", 4500), { size: 0.35, mix: 0.1, damp: 0.6 }), 0.05, 0.3);
  },
  fanfare() {
    // Three quick brass notes, then the chord held over strings, a timpani and a cymbal swell.
    const out = buffer(2.6);
    const random = rng(47);
    ["C5", "E5", "G5"].forEach((name, index) =>
      add(out, index * 0.12, 0.3, brass(note(name), 0.12, { level: 0.55, bright: 5, seed: 10 + index })),
    );
    ["C4", "G4", "C5", "E5"].forEach((name, index) =>
      add(out, 0.4, 1.9, brass(note(name), 1.7, { level: 0.3, bright: 4, fall: 0.5, seed: 20 + index })),
    );
    ["C3", "G3", "E4"].forEach((name, index) =>
      add(out, 0.4, 2, strings(note(name), 1.8, { level: 0.25, attack: 0.15, seed: 30 + index })),
    );
    const drum = timpani(note("C3"), random);
    add(out, 0.38, 1.8, (t) => 0.9 * drum(t));
    const swish = cymbal(random, 0.3, 1.8);
    add(out, 0.3, 2, (t) => 0.12 * swish(t));
    ["G6", "C7"].forEach((name, index) => {
      const bar = glock(note(name));
      add(out, 0.42 + index * 0.1, 1.2, (t) => 0.1 * bar(t));
    });
    return edges(room(out, { size: 0.75, mix: 0.25, predelay: 0.015 }), 0.002, 0.3);
  },
  ending() {
    // A little celesta tune, then strings settling on the home chord.
    const out = buffer(3.1);
    ["G4", "E5", "D5", "C5"].forEach((name, index) => {
      const bar = celesta(note(name));
      const top = glock(note(name) * 2);
      add(out, index * 0.28, 1.8, (t) => 0.45 * bar(t) + 0.05 * top(t));
    });
    ["C3", "G3", "C4", "E4"].forEach((name, index) =>
      add(out, 1.0, 2.0, strings(note(name), 1.9, { level: 0.18, attack: 0.5, seed: 40 + index })),
    );
    return edges(room(out, { size: 0.85, mix: 0.3, predelay: 0.02 }), 0.002, 0.4);
  },
  golden() {
    // The big one: a brass run, a timpani roll into a crash, then brass, strings and a choir together,
    // with chimes glittering over the top.
    const out = buffer(4.1);
    const random = rng(53);
    ["C4", "E4", "G4", "C5", "E5", "G5"].forEach((name, index) =>
      add(out, index * 0.1, 0.35, brass(note(name), 0.16, { level: 0.45, bright: 5, seed: 60 + index })),
    );
    for (let hit = 0; hit < 8; hit += 1) {
      const drum = timpani(note("C3"), random);
      add(out, 0.3 + hit * 0.05, 0.5, (t) => (0.15 + 0.06 * hit) * drum(t));
    }
    const boom = timpani(note("C3"), random);
    add(out, 0.7, 2.5, (t) => boom(t));
    const crash = cymbal(random, 0.002, 1.3);
    add(out, 0.7, 3, (t) => 0.25 * crash(t));
    ["C4", "G4", "C5", "E5", "G5"].forEach((name, index) =>
      add(out, 0.7, 2.9, brass(note(name), 2.7, { level: 0.26, bright: 4, fall: 0.3, seed: 70 + index })),
    );
    ["C3", "G3", "E4", "C5"].forEach((name, index) =>
      add(out, 0.7, 3, strings(note(name), 2.9, { level: 0.2, attack: 0.3, seed: 80 + index })),
    );
    ["C4", "E4", "G4"].forEach((name, index) => add(out, 0.75, 3, choir(note(name), 2.8, { level: 0.35, seed: 90 + index })));
    const scale = ["C6", "D6", "E6", "G6", "A6", "C7"];
    for (let n = 0; n < 14; n += 1) {
      const bar = glock(note(scale[Math.floor(Math.abs(random()) * scale.length)] ?? "C6"));
      add(out, 0.8 + n * 0.15, 0.8, (t) => 0.07 * bar(t));
    }
    return edges(room(out, { size: 0.9, mix: 0.3, predelay: 0.02 }), 0.002, 0.5);
  },
  hit() {
    // A move that lands hard: a rush of air building into a deep thump, a crack, and bits settling after.
    const out = buffer(1.0);
    const random = rng(61);
    const rush = svf("band");
    add(out, 0, 0.24, (t) => 0.8 * rush(random(), 400 + 3600 * (t / 0.24) ** 2, 1.2) * (t / 0.24) ** 2 * Math.min(1, (0.24 - t) / 0.015));
    const impact = 0.22;
    add(out, impact, 0.6, (t) => 0.9 * Math.sin(TAU * (120 * t - 75 * t * t)) * strike(t, 0.002, 8));
    const body = svf("low");
    add(out, impact, 0.35, (t) => 1.4 * body(random(), 200 + 1400 * Math.exp(-t * 10)) * strike(t, 0.001, 20));
    const snap = svf("high");
    add(out, impact, 0.05, (t) => 0.5 * snap(random(), 3500) * strike(t, 0.0005, 110));
    for (let n = 0; n < 12; n += 1) {
      const when = impact + between(random, 0.05, 0.4);
      const length = between(random, 0.015, 0.04);
      const centre = between(random, 700, 2500);
      const size = 0.15 * (1 - (when - impact) / 0.5);
      const bit = svf("band");
      add(out, when, length, (t) => size * bit(random(), centre, 2) * swell(t, length));
    }
    return edges(room(out, { size: 0.45, mix: 0.15 }), 0.002, 0.15);
  },
  fizzle() {
    // "Oh well": two soft marimba notes going gently down, and a little springy boing. Friendly, not sad.
    const out = buffer(1.1);
    const marimba = (freq: number) =>
      modes([
        [freq, 1, 7],
        [freq * 3.99, 0.18, 22],
        [freq * 9.9, 0.05, 40],
      ] as const, 0.003);
    const high = marimba(note("E5"));
    const low = marimba(note("B4"));
    add(out, 0.02, 0.6, (t) => 0.5 * high(t));
    add(out, 0.2, 0.8, (t) => 0.5 * low(t));
    const spring = sine();
    add(out, 0.36, 0.45, (t) => 0.16 * spring(260 * (1 + 0.12 * Math.sin(TAU * 11 * t) * Math.exp(-t * 5))) * strike(t, 0.01, 7));
    return edges(room(out, { size: 0.4, mix: 0.18 }), 0.005, 0.15);
  },
  cheer() {
    // The crowd in the stands: children and grown-ups shouting "yay" and "woo", clapping, in a big hall.
    const out = buffer(2.9);
    crowd(out, 0, 2.5, rng(73), 36, 22);
    return edges(room(out, { size: 0.95, mix: 0.3, predelay: 0.025, damp: 0.45 }), 0.05, 0.4);
  },
  badge() {
    // A badge pinned on: a bright celesta chord with a glockenspiel twinkling up above it.
    const out = buffer(2.1);
    ["E5", "G5", "C6"].forEach((name, index) => {
      const bar = celesta(note(name));
      const top = glock(note(name) * 2);
      add(out, index * 0.08, 1.6, (t) => 0.35 * bar(t) + 0.08 * top(t));
    });
    ["C6", "D6", "E6", "G6", "A6", "C7", "D7", "E7"].forEach((name, index) => {
      const bar = glock(note(name));
      add(out, 0.3 + index * 0.05, 0.8, (t) => 0.04 * bar(t));
    });
    return edges(room(out, { size: 0.7, mix: 0.3, predelay: 0.01 }), 0.002, 0.3);
  },
};

// ---------------------------------------------------------------------------
// Ambience: 16 seconds each, made to loop

const BED_SECONDS = 17.5;
/** How long a bed is once its ends are crossfaded into a loop. */
const LOOP_SECONDS = BED_SECONDS - 1.5;

/**
 * Folds anything that runs past the loop back onto its start, so long events (a wave, a cheer) carry on
 * across the join instead of being cut off there.
 */
function circular(long: Float32Array): Float32Array {
  const loop = Math.round(LOOP_SECONDS * RATE);
  const out = buffer(BED_SECONDS);
  for (let index = 0; index < long.length; index += 1) {
    const at = index % loop;
    out[at] = (out[at] ?? 0) + (long[index] ?? 0);
  }
  for (let index = loop; index < out.length; index += 1) out[index] = out[index - loop] ?? 0;
  return out;
}

/** One bird note whose pitch follows `pitch(p)` as p goes from 0 to 1, with a touch of the overtones a real one has. */
function chirp(out: Float32Array, at: number, length: number, level: number, pitch: (p: number) => number) {
  let phase = 0;
  add(out, at, length, (t) => {
    phase += pitch(t / length) / RATE;
    return level * swell(t, length) * (Math.sin(TAU * phase) + 0.15 * Math.sin(2 * TAU * phase) + 0.05 * Math.sin(3 * TAU * phase));
  });
}

/** Birds singing, some near and some far: little falling tweets, quick trills and two-note whistles. */
function birds(out: Float32Array, random: () => number, count: number, level: number, low = 2600, high = 5000) {
  for (let n = 0; n < count; n += 1) {
    const at = Math.abs(random()) * (BED_SECONDS - 2);
    const base = between(random, low, high);
    const near = level * between(random, 0.35, 1);
    const kind = Math.floor(Math.abs(random()) * 3);
    if (kind === 0) {
      const notes = 2 + Math.floor(Math.abs(random()) * 3);
      for (let k = 0; k < notes; k += 1) {
        chirp(out, at + k * between(random, 0.1, 0.14), between(random, 0.05, 0.08), near, (p) => base * (1.3 - 0.45 * p));
      }
    } else if (kind === 1) {
      const notes = 6 + Math.floor(Math.abs(random()) * 5);
      for (let k = 0; k < notes; k += 1) {
        chirp(out, at + k * 0.055, 0.03, near * 0.8, (p) => base * (0.95 + 0.02 * k + 0.1 * p));
      }
    } else {
      chirp(out, at, 0.22, near * 0.8, (p) => base * 0.7 * (1 + 0.15 * p));
      chirp(out, at + 0.3, 0.3, near * 0.8, (p) => base * 0.8 * (1.15 - 0.3 * p));
    }
  }
}

/** A cricket: bursts of three or four quick pulses on one high note, over and over. */
function cricket(out: Float32Array, random: () => number, level: number, pitch = 4600) {
  const rate = between(random, 0.5, 0.75);
  const pulses = random() > 0 ? 4 : 3;
  for (let at = Math.abs(random()) * 0.5; at < BED_SECONDS - 0.2; at += rate * (1 + 0.04 * random())) {
    for (let k = 0; k < pulses; k += 1) {
      const freq = pitch * (1 + 0.004 * random());
      add(out, at + k * 0.032, 0.02, (t) => level * Math.sin(TAU * freq * t) * swell(t, 0.02));
    }
  }
}

function breeze(out: Float32Array, random: () => number, level: number, low = 200, high = 1600, speed = 0.15) {
  const air = bandNoise(random, low, high);
  const offset = Math.abs(random()) * 10;
  add(out, 0, BED_SECONDS, (t) => level * air() * (0.55 + 0.45 * Math.sin(TAU * speed * (t + offset)) ** 2));
}

/** An owl far off in the trees: "hoo, hoo-hoo", round and breathy. */
function owl(out: Float32Array, at: number, random: () => number) {
  for (const [offset, pitch, length] of [
    [0, 410, 0.4],
    [0.55, 360, 0.3],
    [0.9, 360, 0.6],
  ] as const) {
    const voice = sine();
    const breath = svf("band");
    add(out, at + offset, length, (t) => {
      const freq = pitch * (1 + 0.03 * Math.sin((Math.PI * t) / length) - 0.04 * (t / length));
      return (voice(freq) + 2.5 * breath(random(), freq, 8)) * held(t, length, 0.06, 0.15);
    });
  }
}

/** A gull wheeling overhead: three rising-and-falling cries, a little hoarse. */
function gull(out: Float32Array, at: number, random: () => number) {
  let when = at;
  for (let k = 0; k < 3; k += 1) {
    const length = between(random, 0.25, 0.4);
    const top = between(random, 1100, 1400);
    const wave = saw();
    const throat = svf("band");
    add(out, when, length, (t) => {
      const p = t / length;
      const freq = top * (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, p * 1.4))) - 200 * p;
      return Math.tanh(2 * throat(wave(freq), 2200, 1.5)) * swell(t, length);
    });
    when += between(random, 0.35, 0.5);
  }
}

/** A frog in the reeds: "rib-bit", a throaty buzz in quick pulses. */
function frog(out: Float32Array, at: number) {
  for (const [offset, length] of [
    [0, 0.11],
    [0.16, 0.14],
  ] as const) {
    const wave = saw();
    const throat = mouth();
    add(out, at + offset, length, (t) =>
      throat(wave(150 * (1 + (0.1 * t) / length)), [500, 1300, 2200]) * Math.sin(Math.PI * ((t * 28) % 1)) ** 2 * swell(t, length),
    );
  }
}

/** One person in the crowd chatting: syllables at their own pitch on passing vowels, never real words. */
function talker(out: Float32Array, random: () => number) {
  const wave = saw((random() + 1) / 2);
  const shape = mouth();
  const voice = brighter(0.6);
  const child = random() > 0.2;
  const pitch = child ? between(random, 230, 340) : between(random, 110, 220);
  const scale = child ? 1.15 : 1;
  const names = Object.keys(VOWELS) as Vowel[];
  const level = between(random, 0.3, 1);
  let at = Math.abs(random()) * 2;
  while (at < BED_SECONDS - 0.4) {
    const words = 3 + Math.floor(Math.abs(random()) * 6);
    for (let word = 0; word < words && at < BED_SECONDS - 0.4; word += 1) {
      const length = between(random, 0.12, 0.28);
      const name = names[Math.floor(Math.abs(random()) * names.length)] ?? "ah";
      const vowel = blendVowel(name, name, 0, scale);
      const lift = between(random, 0.9, 1.15);
      add(out, at, length, (t) => level * shape(voice(0.8 * wave(pitch * lift * (1 - (0.1 * t) / length)) + 0.2 * random()), vowel) * swell(t, length));
      at += length + between(random, 0.01, 0.06);
    }
    at += between(random, 0.3, 1.2);
  }
}

const AMBIENCE: Record<StoryAmbience, () => Float32Array> = {
  gate() {
    const out = buffer(BED_SECONDS);
    const random = rng(101);
    const air = buffer(BED_SECONDS);
    breeze(air, random, 1, 150, 900, 0.1);
    const life = buffer(BED_SECONDS);
    birds(life, random, 9, 1);
    blend(out, air, 1);
    blend(out, life, 0.3);
    return room(out, { size: 0.5, mix: 0.12 });
  },
  grass() {
    // Wind combing through long grass: a soft hiss that rises and falls with the gusts, the blades
    // brushing each other as it does, crickets, and birds now and then.
    const out = buffer(BED_SECONDS);
    const random = rng(103);
    const [g1, g2, g3] = [0, 1, 2].map(() => Math.abs(random()) * TAU) as [number, number, number];
    const gust = (t: number) => 0.55 + 0.25 * Math.sin(TAU * 0.07 * t + g1) + 0.15 * Math.sin(TAU * 0.13 * t + g2) + 0.1 * Math.sin(TAU * 0.23 * t + g3);
    const hiss = buffer(BED_SECONDS);
    const shh = svf("band");
    add(hiss, 0, BED_SECONDS, (t) => gust(t) ** 1.5 * shh(random(), 3200, 0.7));
    const wind = buffer(BED_SECONDS);
    const low = svf("band");
    add(wind, 0, BED_SECONDS, (t) => gust(t) * low(random(), 350, 0.6));
    const blades = buffer(BED_SECONDS);
    for (let at = 0; at < BED_SECONDS - 0.05; at += 0.004) {
      const strength = gust(at);
      if (Math.abs(random()) < 0.5 * strength * strength) {
        const length = between(random, 0.008, 0.025);
        const centre = between(random, 2000, 6000);
        const size = Math.abs(random());
        const leaf = svf("band");
        add(blades, at, length, (t) => size * leaf(random(), centre, 1.5) * swell(t, length));
      }
    }
    const life = buffer(BED_SECONDS);
    cricket(life, random, 0.5, 4700);
    cricket(life, random, 0.3, 4300);
    birds(life, random, 5, 0.6);
    blend(out, hiss, 1);
    blend(out, blades, 0.5);
    blend(out, wind, 0.5);
    blend(out, life, 0.18);
    return room(out, { size: 0.5, mix: 0.12, damp: 0.5 });
  },
  woods() {
    const out = buffer(BED_SECONDS);
    const random = rng(107);
    const air = buffer(BED_SECONDS);
    breeze(air, random, 1, 100, 600, 0.07);
    const night = buffer(BED_SECONDS);
    cricket(night, random, 1, 5200);
    cricket(night, random, 0.7, 3900);
    cricket(night, random, 0.4, 4500);
    const owls = buffer(BED_SECONDS);
    for (const at of [2.5, 10.5]) owl(owls, at, random);
    blend(out, air, 1);
    blend(out, night, 0.35);
    blend(out, owls, 0.3);
    return room(out, { size: 0.6, mix: 0.2, damp: 0.5 });
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
    breeze(out, random, 0.4, 300, 2200, 0.11);
    breeze(out, random, 0.2, 80, 400, 0.05);
    // A hawk, far away, crying twice and gliding on.
    for (const at of [3.2, 11.4]) {
      for (const [offset, length] of [[0, 0.7], [0.9, 0.9]] as const) {
        add(out, at + offset, length, (t) => {
          const pitch = 2300 - 900 * (t / length) + 60 * Math.sin(TAU * 7 * t);
          return 0.07 * Math.sin(TAU * pitch * t) * swell(t, length);
        });
      }
    }
    return reverb(out, 0.35);
  },
  sea() {
    // Waves on a beach: each one rolls in low, breaks in a broad crash, and runs back fizzing over the
    // sand. Under them, the deep sound of the open sea, and gulls overhead.
    const random = rng(137);
    const long = buffer(BED_SECONDS + 6);
    const surf = buffer(BED_SECONDS + 6);
    const foam = buffer(BED_SECONDS + 6);
    const fizz = buffer(BED_SECONDS + 6);
    for (let at = 0.1; at < LOOP_SECONDS; at += between(random, 4.6, 7)) {
      const size = between(random, 0.6, 1);
      const build = between(random, 1.3, 1.9);
      const roll = svf("low");
      add(surf, at, build + 0.3, (t) => {
        const p = Math.min(1, t / build);
        return size * p * p * roll(random(), 200 + 900 * p * p) * (t > build ? Math.max(0, 1 - (t - build) / 0.3) : 1);
      });
      const crash = svf("band");
      add(foam, at + build - 0.05, 2.5, (t) => size * crash(random(), 1600 - 400 * Math.min(1, t), 0.45) * strike(t, 0.12, 1.6));
      const wash = svf("high");
      add(foam, at + build + 0.25, 3.2, (t) => size * 0.5 * wash(random(), 3000) * Math.min(1, t / 0.4) * Math.exp(-t * 0.8));
      for (let n = 0; n < 160; n += 1) {
        const when = at + build + 0.2 + Math.abs(random()) ** 2 * 3;
        const length = between(random, 0.005, 0.012);
        const centre = between(random, 3000, 8000);
        const bubble = svf("band");
        const grain = size * Math.abs(random()) * Math.exp(-(when - at - build) * 0.9);
        add(fizz, when, length, (t) => grain * bubble(random(), centre, 2) * swell(t, length));
      }
    }
    const deep = buffer(BED_SECONDS + 6);
    const far = pinkNoise(random);
    const under = svf("low");
    add(deep, 0, deep.length / RATE, () => under(far(), 300));
    const calls = buffer(BED_SECONDS + 6);
    for (const at of [2.2, 7.9, 13.5]) gull(calls, at, random);
    filterAll(calls, "low", 3000);
    blend(long, surf, 0.6);
    blend(long, foam, 1);
    blend(long, fizz, 0.15);
    blend(long, deep, 0.35);
    blend(long, calls, 0.05);
    return room(circular(long), { size: 0.6, mix: 0.12, damp: 0.5 });
  },
  lake() {
    // Still water: small waves lapping at the shore, a drip or a bubble now and then, a frog, a bird.
    const out = buffer(BED_SECONDS);
    const random = rng(139);
    const laps = buffer(BED_SECONDS);
    for (let at = 0.2; at < BED_SECONDS - 1; at += between(random, 0.7, 1.9)) {
      const size = between(random, 0.4, 1);
      const pitch = between(random, 380, 650);
      const [lap, under] = [svf("band"), svf("low")];
      add(laps, at, 1.2, (t) => size * (lap(random(), pitch - 150 * t, 1.1) + 0.8 * under(random(), 250)) * strike(t, 0.09, 4));
    }
    const still = buffer(BED_SECONDS);
    const quiet = svf("low");
    add(still, 0, BED_SECONDS, () => quiet(random(), 400));
    const drops = buffer(BED_SECONDS);
    for (let n = 0; n < 9; n += 1) {
      const at = Math.abs(random()) * (BED_SECONDS - 1);
      const base = between(random, 700, 1500);
      const bubble = sine();
      // A bubble rises in pitch as it shrinks and pops: the sound of a drip landing in water.
      add(drops, at, 0.09, (t) => bubble(base * (1 + 14 * t)) * strike(t, 0.0015, 45));
    }
    const frogs = buffer(BED_SECONDS);
    for (const at of [3.1, 3.6, 11.2]) frog(frogs, at);
    const life = buffer(BED_SECONDS);
    birds(life, random, 3, 1);
    blend(out, laps, 1);
    blend(out, still, 0.4);
    blend(out, drops, 0.12);
    blend(out, frogs, 0.12);
    blend(out, life, 0.08);
    return room(out, { size: 0.55, mix: 0.15, damp: 0.5 });
  },
  house() {
    // A warm, quiet room with the window open: birds outside, and a wind chime now and then.
    const out = buffer(BED_SECONDS);
    const random = rng(149);
    const still = buffer(BED_SECONDS);
    const hum = lowNoise(random, 300);
    add(still, 0, BED_SECONDS, () => hum());
    const air = buffer(BED_SECONDS);
    breeze(air, random, 1, 300, 1500, 0.08);
    const life = buffer(BED_SECONDS);
    birds(life, random, 7, 1);
    const chimes = buffer(BED_SECONDS);
    for (const [at, name] of [[2.4, "E6"], [2.9, "B5"], [9.6, "G6"], [10.2, "D6"], [10.7, "B5"]] as const) {
      const tube = glock(note(name));
      add(chimes, at, 2.2, (t) => tube(t));
    }
    blend(out, still, 1);
    blend(out, air, 0.15);
    blend(out, life, 0.15);
    blend(out, chimes, 0.1);
    return room(out, { size: 0.4, mix: 0.2, damp: 0.6 });
  },
  stadium() {
    // A big crowd waiting: hundreds of people chatting at once, the hum of the hall, and twice a ripple of cheering.
    const out = buffer(BED_SECONDS);
    const random = rng(151);
    const babble = buffer(BED_SECONDS);
    for (let n = 0; n < 22; n += 1) talker(babble, random);
    const cheers = buffer(BED_SECONDS);
    for (const at of [3.5, 10.2]) crowd(cheers, at, 1.8, random, 12, 10);
    const hall = buffer(BED_SECONDS);
    const pink = pinkNoise(random);
    const band = svf("band");
    add(hall, 0, BED_SECONDS, (t) => band(pink(), 600, 0.7) * (0.8 + 0.2 * Math.sin(TAU * 0.11 * t)));
    blend(out, babble, 1);
    blend(out, hall, 0.6);
    blend(out, cheers, 0.5);
    return room(filterAll(filterAll(out, "low", 5000), "high", 180), { size: 0.95, mix: 0.35, predelay: 0.03, damp: 0.4 });
  },
};

// ---------------------------------------------------------------------------
// Music: gentle loops, one mood each. Every loop is a whole number of bars, sixteen seconds long. It is
// played on past its end and folded back onto its start, so the last bar flows into the first and the
// reverb tail carries over the join: there is no seam to hear.

const LOOP_LENGTH = 16;

/** Folds a rendering that runs past the loop back onto its start. */
function fold(long: Float32Array, seconds = LOOP_LENGTH): Float32Array {
  const size = Math.round(seconds * RATE);
  const out = new Float32Array(size);
  for (let index = 0; index < long.length; index += 1) out[index % size] = (out[index % size] ?? 0) + (long[index] ?? 0);
  return out;
}

/** A harp: a plucked string, bright for a moment, then round. */
function harp(freq: number) {
  return modes([
    [freq, 1, 3.2],
    [freq * 2, 0.35, 6],
    [freq * 3, 0.12, 10],
    [freq * 4, 0.05, 14],
  ] as const, 0.002);
}

/** A soft bass: a round low note with a little edge to it, so small speakers still hear it. */
function bass(freq: number, length: number) {
  const body = sine();
  const wave = saw(0.3);
  const tone = svf("low");
  return (t: number) => held(t, length, 0.02, Math.min(0.15, length / 3)) * (0.7 * body(freq) + 0.35 * tone(wave(freq), freq * 3, 0.7));
}

/** A shaker: a quick hiss of seeds. */
function shaker(random: () => number) {
  const hiss = svf("high");
  return (t: number) => 0.5 * hiss(random(), 6000) * strike(t, 0.004, 40);
}

/** A soft kick drum. */
const kick = (t: number) => Math.sin(TAU * (95 * t - 70 * t * t)) * strike(t, 0.002, 16);

/** A brushed snare. */
function snare(random: () => number) {
  const band = svf("band");
  return (t: number) => band(random(), 2500, 0.7) * strike(t, 0.002, 28);
}

/** Chords as [bass, pad notes, arpeggio notes]. */
const CHORDS: Record<string, { bass: string; pad: string[]; arp: string[] }> = {
  C: { bass: "C2", pad: ["C3", "G3", "E4"], arp: ["C4", "E4", "G4", "C5"] },
  Cmaj7: { bass: "C2", pad: ["C3", "G3", "B3", "E4"], arp: ["C4", "E4", "G4", "B4"] },
  F: { bass: "F2", pad: ["F2", "C3", "A3"], arp: ["F3", "A3", "C4", "F4"] },
  Fmaj7: { bass: "F2", pad: ["F2", "C3", "E3", "A3"], arp: ["F3", "A3", "C4", "E4"] },
  G: { bass: "G2", pad: ["G2", "D3", "B3"], arp: ["G3", "B3", "D4", "G4"] },
  G7: { bass: "G2", pad: ["G2", "B3", "F4"], arp: ["G3", "B3", "D4", "F4"] },
  Am: { bass: "A2", pad: ["A2", "E3", "C4"], arp: ["A3", "C4", "E4", "A4"] },
  Am7: { bass: "A2", pad: ["A2", "E3", "G3", "C4"], arp: ["A3", "C4", "E4", "G4"] },
  Dm: { bass: "D2", pad: ["D3", "A3", "F4"], arp: ["D4", "F4", "A4", "D5"] },
  Dm7: { bass: "D2", pad: ["D3", "A3", "C4", "F4"], arp: ["D4", "F4", "A4", "C5"] },
  Bb: { bass: "Bb1", pad: ["Bb2", "F3", "D4"], arp: ["Bb3", "D4", "F4", "Bb4"] },
  E: { bass: "E2", pad: ["E3", "B3", "G#4"], arp: ["E4", "G#4", "B4", "E5"] },
  Em: { bass: "E2", pad: ["E3", "B3", "G4"], arp: ["E4", "G4", "B4", "E5"] },
  B: { bass: "B1", pad: ["B2", "F#3", "D#4"], arp: ["B3", "D#4", "F#4", "B4"] },
  D: { bass: "D2", pad: ["D3", "A3", "F#4"], arp: ["D4", "F#4", "A4", "D5"] },
  A: { bass: "A1", pad: ["A2", "E3", "C#4"], arp: ["A3", "C#4", "E4", "A4"] },
  G6: { bass: "G2", pad: ["G2", "D3", "E3", "B3"], arp: ["G3", "B3", "D4", "E4"] },
};

const chordOf = (name: string) => CHORDS[name] ?? (CHORDS.C as (typeof CHORDS)[string]);

type Song = {
  /** Seconds in a beat; bars are four beats. */
  beat: number;
  chords: string[];
  render: (out: Float32Array, at: (bar: number, beat?: number) => number, bar: number) => void;
  /** Then each chord gets its pad, its bass and, if given, a harp pattern. */
  pad?: number;
  bassLevel?: number;
  /** Bass notes in a bar, by beat. */
  bassBeats?: number[];
  /** Harp notes in a bar: [beat, which arpeggio note]. */
  harpPattern?: Array<[number, number]>;
  harpLevel?: number;
  room?: { size: number; mix: number; damp?: number };
};

/** Plays a song's chords with its pad, bass and harp, then its own parts, folded into a seamless loop. */
function song(spec: Song): Float32Array {
  const out = buffer(LOOP_LENGTH + 5);
  const barLength = spec.beat * 4;
  const at = (bar: number, beat = 0) => bar * barLength + beat * spec.beat;
  spec.chords.forEach((name, bar) => {
    const chord = chordOf(name);
    if (spec.pad) {
      chord.pad.forEach((pitch, index) =>
        add(out, at(bar), barLength + 0.8, strings(note(pitch), barLength + 0.15, { level: spec.pad, attack: 0.35, seed: 300 + bar * 7 + index })),
      );
    }
    for (const beat of spec.bassBeats ?? []) {
      const length = spec.beat * 0.9;
      const low = bass(note(chord.bass), length);
      add(out, at(bar, beat), length + 0.2, (t) => (spec.bassLevel ?? 0.12) * low(t));
    }
    for (const [beat, which] of spec.harpPattern ?? []) {
      const pluck = harp(note(chord.arp[which] ?? chord.arp[0] ?? "C4"));
      add(out, at(bar, beat), 1.6, (t) => (spec.harpLevel ?? 0.1) * pluck(t));
    }
    spec.render(out, at, bar);
  });
  return fold(room(out, spec.room ?? { size: 0.6, mix: 0.22, damp: 0.5 }));
}

/** A melody of [bar, beat, note, beats] on a voice. */
function melody(out: Float32Array, at: (bar: number, beat?: number) => number, beat: number, notes: Array<[number, number, string, number]>, voice: (freq: number, length: number) => (t: number) => number) {
  for (const [bar, start, name, beats] of notes) add(out, at(bar, start), beats * beat + 1.5, voice(note(name), beats * beat));
}

const celestaVoice = (level: number) => (freq: number) => {
  const bar = celesta(freq);
  return (t: number) => level * bar(t);
};
const glockVoice = (level: number) => (freq: number) => {
  const bar = glock(freq);
  return (t: number) => level * bar(t);
};
const hornVoice = (level: number) => (freq: number, length: number) => brass(freq, length, { level, bright: 2.5, fall: 0.3, seed: Math.round(freq) });

const MUSIC: Record<StoryMusic, () => Float32Array> = {
  bright() {
    const random = rng(401);
    const shake = () => shaker(random);
    return song({
      beat: 0.5,
      chords: ["C", "F", "G", "C", "Am", "F", "G", "C"],
      pad: 0.07,
      bassBeats: [0, 2],
      harpPattern: [[0, 0], [0.5, 1], [1, 2], [1.5, 1], [2, 3], [2.5, 1], [3, 2], [3.5, 1]],
      harpLevel: 0.09,
      render(out, at, bar) {
        for (let beat = 0.5; beat < 4; beat += 1) {
          const hit = shake();
          add(out, at(bar, beat), 0.1, (t) => 0.06 * hit(t));
        }
        if (bar === 0) {
          melody(out, at, 0.5, [
            [0, 0, "E5", 1], [0, 2, "G5", 1], [1, 0, "A5", 1], [1, 2, "G5", 1], [2, 0, "F5", 1], [2, 2, "D5", 1], [3, 0, "E5", 2],
            [4, 0, "C5", 1], [4, 2, "E5", 1], [5, 0, "F5", 1], [5, 2, "A5", 1], [6, 0, "G5", 1], [6, 2, "B4", 1], [7, 0, "C5", 2],
          ], celestaVoice(0.13));
        }
      },
    });
  },
  calm() {
    return song({
      beat: 1,
      chords: ["Fmaj7", "Cmaj7", "Dm7", "Bb"],
      pad: 0.07,
      bassBeats: [0],
      harpPattern: [[0, 0], [1, 1], [2, 2], [3, 3]],
      harpLevel: 0.07,
      room: { size: 0.8, mix: 0.3 },
      render(out, at, bar) {
        if (bar === 0) {
          melody(out, at, 1, [[0, 1, "A5", 2], [1, 1, "G5", 2], [2, 1, "F5", 1], [2, 2, "E5", 1], [3, 1, "D5", 2.5]], celestaVoice(0.1));
        }
      },
    });
  },
  mysterious() {
    return song({
      beat: 0.6667,
      chords: ["Am", "F", "Am", "E", "Am", "F"],
      pad: 0.08,
      bassBeats: [0],
      room: { size: 0.85, mix: 0.35 },
      render(out, at, bar) {
        if (bar % 2 === 0) {
          melody(out, at, 0.6667, [[bar, 1, "E5", 0.5], [bar, 1.5, "F5", 0.5], [bar, 2, "E5", 1], [bar, 3, "B4", 1]], glockVoice(0.07));
        }
      },
    });
  },
  adventure() {
    const random = rng(403);
    return song({
      beat: 0.5,
      chords: ["Dm", "C", "Bb", "C", "Dm", "C", "Bb", "A"],
      pad: 0.06,
      bassBeats: [0, 1.5, 2, 3.5],
      harpPattern: [[0, 0], [0.5, 2], [1, 3], [1.5, 2], [2, 0], [2.5, 2], [3, 3], [3.5, 1]],
      harpLevel: 0.08,
      render(out, at, bar) {
        for (const beat of [0, 2]) add(out, at(bar, beat), 0.4, (t) => 0.22 * kick(t));
        for (let beat = 0.5; beat < 4; beat += 1) {
          const hit = shaker(random);
          add(out, at(bar, beat), 0.1, (t) => 0.05 * hit(t));
        }
        if (bar === 0) {
          melody(out, at, 0.5, [[0, 0, "F4", 3], [1, 0, "E4", 3], [2, 0, "D4", 2], [2, 2, "F4", 2], [3, 0, "G4", 4], [4, 0, "A4", 3], [5, 0, "G4", 3], [6, 0, "F4", 4], [7, 0, "E4", 4]], hornVoice(0.07));
        }
      },
    });
  },
  tense() {
    return song({
      beat: 0.5,
      chords: ["Em", "C", "Em", "B", "Em", "C", "Em", "B"],
      pad: 0.06,
      bassBeats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      room: { size: 0.5, mix: 0.2 },
      render(out, at, bar) {
        add(out, at(bar), 0.4, (t) => 0.2 * kick(t));
        if (bar % 2 === 1) melody(out, at, 0.5, [[bar, 2, "B5", 1]], glockVoice(0.06));
      },
    });
  },
  homely() {
    return song({
      beat: 0.6667,
      chords: ["C", "F", "G", "C", "F", "G7"],
      pad: 0.05,
      bassBeats: [0, 2],
      harpPattern: [[1, 1], [2, 2], [3, 1]],
      harpLevel: 0.06,
      render(out, at, bar) {
        if (bar === 0) {
          melody(out, at, 0.6667, [
            [0, 0, "C5", 1], [0, 1, "E5", 1], [0, 2, "G5", 2], [1, 0, "A5", 1], [1, 1, "G5", 1], [1, 2, "F5", 2], [2, 0, "D5", 1], [2, 1, "E5", 1], [2, 2, "F5", 2],
            [3, 0, "E5", 1], [3, 1, "D5", 1], [3, 2, "C5", 2], [4, 0, "A4", 1], [4, 1, "C5", 1], [4, 2, "F5", 2], [5, 0, "D5", 2], [5, 2, "B4", 2],
          ], celestaVoice(0.12));
        }
      },
    });
  },
  magical() {
    return song({
      beat: 1,
      chords: ["Cmaj7", "Am7", "Fmaj7", "G6"],
      pad: 0.06,
      bassBeats: [0],
      room: { size: 0.9, mix: 0.35 },
      render(out, at, bar) {
        const chord = chordOf(["Cmaj7", "Am7", "Fmaj7", "G6"][bar] ?? "Cmaj7");
        for (let step = 0; step < 16; step += 1) {
          const pitch = chord.arp[[0, 1, 2, 3, 2, 1][step % 6] ?? 0] ?? "C4";
          const sparkle = glock(note(pitch) * 2);
          add(out, at(bar, step * 0.25), 1, (t) => 0.035 * sparkle(t));
        }
        chord.pad.slice(1).forEach((pitch, index) => add(out, at(bar), 4.6, choir(note(pitch), 4.1, { level: 0.1, seed: 500 + bar * 5 + index })));
      },
    });
  },
  battle() {
    const random = rng(409);
    return song({
      beat: 0.4,
      chords: ["Am", "F", "G", "Em", "Am", "F", "G", "E", "Am", "F"],
      pad: 0.05,
      bassBeats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      room: { size: 0.45, mix: 0.18 },
      render(out, at, bar) {
        for (const beat of [0, 2]) add(out, at(bar, beat), 0.4, (t) => 0.3 * kick(t));
        for (const beat of [1, 3]) {
          const hit = snare(random);
          add(out, at(bar, beat), 0.2, (t) => 0.12 * hit(t));
        }
        const chord = chordOf(["Am", "F", "G", "Em", "Am", "F", "G", "E", "Am", "F"][bar] ?? "Am");
        chord.pad.forEach((pitch) => add(out, at(bar), 0.5, brass(note(pitch) * 2, 0.22, { level: 0.08, bright: 3, seed: 600 + bar })));
      },
    });
  },
  champion() {
    const random = rng(411);
    return song({
      beat: 0.5,
      chords: ["D", "Bb", "C", "D", "G", "A", "Bb", "A"],
      pad: 0.06,
      bassBeats: [0, 2],
      harpPattern: [[0, 0], [1, 1], [2, 2], [3, 3]],
      harpLevel: 0.06,
      render(out, at, bar) {
        const drum = timpani(note(chordOf(["D", "Bb", "C", "D", "G", "A", "Bb", "A"][bar] ?? "D").bass) * 2, random);
        add(out, at(bar), 1.5, (t) => 0.3 * drum(t));
        if (bar === 0 || bar === 4) {
          const swish = cymbal(random, 0.8, 1.6);
          add(out, at(bar), 2.5, (t) => 0.04 * swish(t));
        }
        if (bar === 0) {
          melody(out, at, 0.5, [[0, 0, "D4", 2], [0, 2, "A4", 2], [1, 0, "F4", 3], [2, 0, "G4", 2], [2, 2, "E4", 2], [3, 0, "D4", 4], [4, 0, "B4", 2], [4, 2, "D5", 2], [5, 0, "C#5", 3], [6, 0, "D5", 2], [6, 2, "F5", 2], [7, 0, "E5", 4]], hornVoice(0.08));
        }
      },
    });
  },
};

// ---------------------------------------------------------------------------

/** How loud each music loop is, in LUFS, before the mix turns it down under the voices. */
const MUSIC_LOUDNESS = -18;

/** MP3 encoding takes about 0.3 dB of loudness (mostly the very top), so each sound is mastered that much over. */
const ENCODER_LOSS = 0.3;

const wanted = new Set(process.argv.slice(2));
const pick = (name: string) => wanted.size === 0 || wanted.has(name);

/**
 * A Yoto Mini's little speaker plays almost nothing under about 100 Hz, and energy there still counts
 * towards a sound's loudness, so an effect heavy in it would come out thin and quiet just where it
 * matters. Everything under 90 Hz is taken out of the effects before they are levelled.
 */
const forSmallSpeakers = (out: Float32Array) => filterAll(filterAll(out, "high", 90), "high", 90);

for (const [name, make] of Object.entries(EFFECTS) as Array<[StorySound, () => Float32Array]>) {
  if (pick(name)) writeMp3(STORY_SOUNDS[name], master(forSmallSpeakers(make()), LOUDNESS[name] + ENCODER_LOSS), false);
}
for (const [name, make] of Object.entries(AMBIENCE) as Array<[StoryAmbience, () => Float32Array]>) {
  // Beds are dense noise, which the encoder lifts by a few dB at its peaks, so they are held lower.
  if (pick(name)) writeMp3(STORY_AMBIENCE[name], master(loopable(make()), LOUDNESS[`bed-${name}`] + ENCODER_LOSS, 0.5), true);
}
for (const [name, make] of Object.entries(MUSIC) as Array<[StoryMusic, () => Float32Array]>) {
  // Every mood at the same loudness, so a scene change never jumps in level.
  if (pick(name)) writeMp3(STORY_MUSIC[name], master(make(), MUSIC_LOUDNESS + ENCODER_LOSS, 0.7), true);
}
