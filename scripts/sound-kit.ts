/**
 * The building blocks for the adventure sounds: noise, filters, envelopes, instrument voices, a room,
 * a limiter and a loudness meter. Everything is plain arithmetic on samples, so every sound made with
 * it is original and comes out the same each time.
 */

export const RATE = 44100;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Buffers and noise

/** Repeatable noise, so the files only change when the script does. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (((value ^ (value >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** A number from `low` to `high`, from repeatable noise. */
export const between = (random: () => number, low: number, high: number) => low + ((random() + 1) / 2) * (high - low);

export function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE));
}

/** Adds `fn(t)` from `start` for `length` seconds, where t counts from the start of the note. */
export function add(out: Float32Array, start: number, length: number, fn: (t: number) => number) {
  const first = Math.max(0, Math.round(start * RATE));
  const last = Math.min(out.length, Math.round((start + length) * RATE));
  for (let index = first; index < last; index += 1) out[index] = (out[index] ?? 0) + fn((index - first) / RATE);
}

/** Noise through a one-pole low-pass. `cut` is roughly the cutoff in Hz. */
export function lowNoise(random: () => number, cut: number): () => number {
  const k = 1 - Math.exp((-TAU * cut) / RATE);
  let low = 0;
  return () => {
    low += k * (random() - low);
    return low;
  };
}

/** Noise in a band: high-passed then low-passed. */
export function bandNoise(random: () => number, low: number, high: number): () => number {
  const lp = lowNoise(random, high);
  const k = 1 - Math.exp((-TAU * low) / RATE);
  let floor = 0;
  return () => {
    const value = lp();
    floor += k * (value - floor);
    return value - floor;
  };
}

/** Pink noise (Paul Kellet's filter): equal energy per octave, softer than white, like real wind and surf. */
export function pinkNoise(random: () => number): () => number {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return () => {
    const white = random();
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    return (b0 + b1 + b2 + white * 0.1848) * 0.2;
  };
}

// ---------------------------------------------------------------------------
// Filters

/** A two-pole resonant band-pass whose centre can move every sample. */
export function resonator(q = 6) {
  let a = 0;
  let b = 0;
  return (input: number, freq: number) => {
    const f = 2 * Math.sin((Math.PI * Math.min(freq, RATE / 6)) / RATE);
    a += f * b;
    b += f * (input - a - b / q);
    return b;
  };
}

/**
 * A state-variable filter (the trapezoidal form), stable however fast its cutoff moves. The band-pass
 * has a gain of one at its centre, so changing `q` changes the width and not the level.
 */
export function svf(mode: "low" | "band" | "high" = "band") {
  let ic1 = 0;
  let ic2 = 0;
  return (input: number, freq: number, q = 0.707) => {
    const g = Math.tan((Math.PI * Math.min(Math.max(freq, 10), RATE * 0.45)) / RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = input - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    if (mode === "low") return v2;
    if (mode === "high") return input - k * v1 - v2;
    return k * v1;
  };
}

/** Runs the whole buffer through a filter in place, for a final tone shaping. */
export function filterAll(out: Float32Array, mode: "low" | "high", freq: number, q = 0.707): Float32Array {
  const filter = svf(mode);
  for (let index = 0; index < out.length; index += 1) out[index] = filter(out[index] ?? 0, freq, q);
  return out;
}

/** Vowel formants in Hz (an adult's; a child's are about 15% higher). */
export const VOWELS = {
  ah: [730, 1090, 2440],
  eh: [530, 1840, 2480],
  ee: [300, 2250, 3000],
  oh: [570, 840, 2410],
  oo: [320, 870, 2240],
} as const satisfies Record<string, readonly [number, number, number]>;

export type Vowel = keyof typeof VOWELS;

/**
 * A voice's mouth: three resonances that turn a buzz into a vowel. `gains` sets how strong the upper two
 * are; a shout carries them much more than a murmur does, which is what makes it carry.
 */
export function mouth(gains: readonly number[] = [1, 0.55, 0.25]) {
  const bands = [svf("band"), svf("band"), svf("band")];
  const widths = [90, 110, 160];
  return (input: number, formants: readonly number[]) =>
    bands.reduce((sum, band, n) => {
      const centre = formants[n] ?? 1000;
      return sum + (gains[n] ?? 0) * band(input, centre, centre / (widths[n] ?? 100));
    }, 0);
}

/** Blends two vowels; `mix` 0 is the first, 1 the second. */
export function blendVowel(from: Vowel, to: Vowel, mix: number, scale = 1): number[] {
  return VOWELS[from].map((value, n) => scale * (value + ((VOWELS[to][n] ?? value) - value) * mix));
}

// ---------------------------------------------------------------------------
// Envelopes

/** Quick attack, exponential fall. */
export const decay = (t: number, rate: number, attack = 0.004) => (t < attack ? t / attack : Math.exp(-(t - attack) * rate));

/** A soft swell in and out over `length`. */
export const swell = (t: number, length: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, t / length))) ** 2;

/** Something struck: a rounded rise over `attack` (never a click), then an exponential fall at `rate`. */
export const strike = (t: number, attack: number, rate: number) =>
  t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2 : Math.exp(-(t - attack) * rate);

/** A held note: a rounded rise, a gentle fall at `fall` per second, and a rounded release at the end. */
export function held(t: number, length: number, attack: number, release: number, fall = 0): number {
  if (t >= length) return 0;
  const rise = t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2 : 1;
  const end = t > length - release ? Math.sin((Math.PI / 2) * ((length - t) / release)) ** 2 : 1;
  return rise * end * Math.exp(-fall * t);
}

// ---------------------------------------------------------------------------
// Tones

export const note = (name: string): number => {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!match) throw new Error(`Not a note: ${name}`);
  const steps: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const semis = (steps[match[1] as string] ?? 0) + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + (Number(match[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
};

/** A soft triangle-ish tone: sine with a little second and third harmonic. */
export const warm = (freq: number, t: number) =>
  Math.sin(TAU * freq * t) + 0.25 * Math.sin(TAU * 2 * freq * t) + 0.08 * Math.sin(TAU * 3 * freq * t);

/** A bell: inharmonic partials that die at different speeds. */
export const bell = (freq: number, t: number) =>
  Math.sin(TAU * freq * t) * Math.exp(-t * 3) +
  0.4 * Math.sin(TAU * freq * 2.76 * t) * Math.exp(-t * 6) +
  0.2 * Math.sin(TAU * freq * 5.4 * t) * Math.exp(-t * 10);

/**
 * A sawtooth without the aliasing whistle of a plain one (PolyBLEP). Call it once per sample with the
 * pitch, which may change as it goes.
 */
export function saw(startPhase = 0) {
  let phase = startPhase - Math.floor(startPhase);
  return (freq: number) => {
    const dt = Math.min(0.5, freq / RATE);
    phase += dt;
    if (phase >= 1) phase -= 1;
    let value = 2 * phase - 1;
    if (phase < dt) {
      const x = phase / dt;
      value -= x + x - x * x - 1;
    } else if (phase > 1 - dt) {
      const x = (phase - 1) / dt;
      value -= x * x + x + x + 1;
    }
    return value;
  };
}

/** A sine whose pitch may change every sample without jumping. */
export function sine(startPhase = 0) {
  let phase = startPhase;
  return (freq: number) => {
    phase += freq / RATE;
    if (phase >= 1) phase -= Math.floor(phase);
    return Math.sin(TAU * phase);
  };
}

/** Something struck that rings: modes of [frequency, level, decay per second], with a rounded start. */
export function modes(list: ReadonlyArray<readonly [number, number, number]>, attack = 0.0008) {
  return (t: number) => {
    const rise = t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2 : 1;
    let sum = 0;
    for (const [freq, level, rate] of list) sum += level * Math.sin(TAU * freq * t) * Math.exp(-rate * t);
    return rise * sum;
  };
}

/** A celesta: a soft hammer on a tuned bar over a wooden box, warm and round, with a slow shimmer. */
export function celesta(freq: number) {
  return modes([
    [freq, 1, 2.4],
    [freq * 1.0012, 0.5, 2.6],
    [freq * 2, 0.32, 5],
    [freq * 3, 0.1, 9],
    [freq * 4.02, 0.08, 14],
  ], 0.0025);
}

/** A glockenspiel: a bright metal bar, its overtones out of tune with each other as real bars are. */
export function glock(freq: number) {
  return modes([
    [freq, 1, 1.8],
    [freq * 2.76, 0.22, 6],
    [freq * 5.4, 0.1, 13],
    [freq * 8.93, 0.04, 22],
  ], 0.001);
}

/**
 * A brass section on one note: three slightly detuned players, a filter that opens as they blow (the
 * "blat" of a trumpet), a little scoop up to the note, and a vibrato that comes in once the note is held.
 */
export function brass(
  freq: number,
  length: number,
  options: { level?: number; bright?: number; fall?: number; seed?: number } = {},
) {
  const { level = 1, bright = 5, fall = 0, seed = 1 } = options;
  const random = rng(seed);
  const players = [-0.005, 0, 0.0045].map((detune) => ({ detune, wave: saw((random() + 1) / 2) }));
  const filter = svf("low");
  return (t: number) => {
    const amp = held(t, length, 0.035, Math.min(0.15, length / 3), fall);
    if (amp === 0) return 0;
    const scoop = 1 - 0.025 * Math.exp(-t * 28);
    const vibrato = 1 + 0.0045 * Math.min(1, Math.max(0, (t - 0.3) / 0.3)) * Math.sin(TAU * 5.4 * t);
    let sum = 0;
    for (const player of players) sum += player.wave(freq * scoop * vibrato * (1 + player.detune));
    const blow = Math.min(1, t / 0.06) * (0.65 + 0.35 * Math.exp(-t * 5));
    const cutoff = freq * (1.3 + bright * amp * blow);
    return level * amp * Math.tanh(1.4 * filter(sum / players.length, cutoff, 0.9));
  };
}

/** A string section: five detuned bows, softly filtered, swelling in and fading out. */
export function strings(freq: number, length: number, options: { level?: number; attack?: number; seed?: number } = {}) {
  const { level = 1, attack = 0.25, seed = 2 } = options;
  const random = rng(seed);
  const bows = [-0.008, -0.003, 0, 0.004, 0.009].map((detune) => ({ detune, wave: saw((random() + 1) / 2) }));
  const filter = svf("low");
  return (t: number) => {
    const amp = held(t, length, attack, Math.min(0.5, length / 2));
    if (amp === 0) return 0;
    const vibrato = 1 + 0.003 * Math.sin(TAU * 5 * t);
    let sum = 0;
    for (const bow of bows) sum += bow.wave(freq * vibrato * (1 + bow.detune));
    return level * amp * filter(sum / bows.length, Math.min(4000, freq * 4), 0.6);
  };
}

/** A choir singing "ah": a few voices on one note through the shape of the vowel. */
export function choir(freq: number, length: number, options: { level?: number; seed?: number } = {}) {
  const { level = 1, seed = 3 } = options;
  const random = rng(seed);
  const voices = [-0.006, 0, 0.007].map((detune) => ({ detune, wave: saw((random() + 1) / 2), shape: mouth() }));
  const breath = rng(seed + 100);
  return (t: number) => {
    const amp = held(t, length, 0.35, Math.min(0.6, length / 2));
    if (amp === 0) return 0;
    let sum = 0;
    for (const voice of voices) {
      const vibrato = 1 + 0.005 * Math.sin(TAU * (5 + voice.detune * 100) * t);
      const buzz = 0.85 * voice.wave(freq * vibrato * (1 + voice.detune)) + 0.15 * breath();
      sum += voice.shape(buzz, blendVowel("ah", "oh", 0.2, 1.1));
    }
    return (level * amp * sum) / voices.length;
  };
}

/** A timpani: a soft mallet on a big drum, its pitch settling as the skin rings. */
export function timpani(freq: number, random: () => number) {
  const ring = [
    [1, 1, 2.6],
    [1.5, 0.55, 3.6],
    [1.98, 0.35, 4.6],
    [2.44, 0.2, 6],
    [2.94, 0.12, 7.5],
  ] as const;
  const felt = svf("low");
  return (t: number) => {
    const settle = 1 + 0.04 * Math.exp(-t * 9);
    let sum = 0;
    for (const [ratio, level, rate] of ring) sum += level * Math.sin(TAU * freq * ratio * settle * t) * Math.exp(-rate * t);
    const rise = Math.min(1, t / 0.003);
    return rise * (0.8 * sum + 0.6 * felt(random(), 900) * strike(t, 0.002, 40));
  };
}

/** A cymbal: a wash of bright metal noise that rings away. `attack` makes it a swell instead of a crash. */
export function cymbal(random: () => number, attack = 0.002, rate = 1.6) {
  const air = svf("high");
  const shimmer = svf("band");
  return (t: number) => {
    const value = random();
    return strike(t, attack, rate) * (0.7 * air(value, 5500) + 0.4 * shimmer(value, 8200, 3));
  };
}

/** One hand clap: a short slap of noise in the clapper's own band, with the tiny echo of the hands. */
export function clap(random: () => number, centre: number) {
  const band = svf("band");
  return (t: number) => {
    const slap = strike(t, 0.0008, 150) + 0.4 * (t > 0.006 ? strike(t - 0.006, 0.0008, 220) : 0);
    return band(random(), centre, 1.4) * slap;
  };
}

/**
 * One person shouting: a buzz at their pitch through the shape of their mouth, rising with excitement and
 * moving from one vowel to the next ("yay" is eh to ee, "woo" stays on oo).
 */
export function shout(
  freq: number,
  length: number,
  vowels: readonly [Vowel, Vowel],
  random: () => number,
  options: { rise?: number; child?: boolean } = {},
) {
  const { rise = 0.3, child = false } = options;
  const wave = saw((random() + 1) / 2);
  const shape = mouth([1, 0.9, 0.55]);
  const scale = child ? 1.15 : 1;
  const wobble = between(random, 5, 7);
  const strain = brighter();
  return (t: number) => {
    const p = Math.min(1, t / length);
    const contour = 1 + rise * Math.sin(Math.PI * Math.min(1, p * 1.5)) - 0.12 * p;
    const pitch = freq * contour * (1 + 0.012 * Math.sin(TAU * wobble * t));
    const buzz = strain(0.8 * wave(pitch) + 0.2 * random());
    return shape(buzz, blendVowel(vowels[0], vowels[1], Math.min(1, p * 2), scale)) * held(t, length, 0.05, length * 0.45);
  };
}

/**
 * Tilts a voice's buzz towards its overtones, as a raised voice does: a calm voice is mostly its low
 * hum, and a shouting one is strong all the way up, which is why it carries across a stadium.
 */
export function brighter(amount = 0.85) {
  let last = 0;
  return (input: number) => {
    const out = input - amount * last;
    last = input;
    return out;
  };
}

// ---------------------------------------------------------------------------
// Rooms

/** A short room so dry tones sit together. Kept for the music loops, which were tuned with it. */
export function reverb(out: Float32Array, mix = 0.25): Float32Array {
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

/**
 * A real-sounding space: a few early reflections off nearby walls, then a dense, soft tail (eight damped
 * combs and four all-passes, after Freeverb). `size` 0 is a small room and 1 a stadium; `damp` takes the
 * shine off the tail as soft surfaces would.
 */
export function room(
  input: Float32Array,
  options: { size?: number; damp?: number; mix?: number; predelay?: number } = {},
): Float32Array {
  const { size = 0.6, damp = 0.4, mix = 0.2, predelay = 0.01 } = options;
  const feedback = 0.7 + 0.27 * Math.min(1, Math.max(0, size));
  const spread = 0.6 + 0.6 * size;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({
    line: new Float32Array(Math.round(d * spread)),
    mark: 0,
    store: 0,
  }));
  const passes = [556, 441, 341, 225].map((d) => ({ line: new Float32Array(d), mark: 0 }));
  const early = [
    [0.007, 0.5],
    [0.013, 0.38],
    [0.019, 0.3],
    [0.029, 0.22],
  ].map(([delay, gain]) => [Math.round((delay as number) * RATE * (0.5 + size)), gain as number] as const);
  const lead = Math.round(predelay * RATE);
  const out = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const dry = input[index] ?? 0;
    const feed = (input[index - lead] ?? 0) * 0.015;
    let wet = 0;
    for (const comb of combs) {
      const echo = comb.line[comb.mark] ?? 0;
      comb.store = echo * (1 - damp) + comb.store * damp;
      comb.line[comb.mark] = feed + comb.store * feedback;
      comb.mark = (comb.mark + 1) % comb.line.length;
      wet += echo;
    }
    for (const pass of passes) {
      const kept = pass.line[pass.mark] ?? 0;
      const output = kept - wet;
      pass.line[pass.mark] = wet + kept * 0.5;
      pass.mark = (pass.mark + 1) % pass.line.length;
      wet = output;
    }
    let reflections = 0;
    for (const [delay, gain] of early) reflections += gain * (input[index - lead - delay] ?? 0);
    out[index] = dry * (1 - mix) + (wet * 3 + reflections * 0.5) * mix;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Finishing

/** Scales to a peak, so every file sits at a known level. */
export function normalise(out: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const value of out) max = Math.max(max, Math.abs(value));
  if (max === 0) return out;
  return out.map((value) => (value / max) * peak);
}

/** Fades the start and the end so a one-shot never clicks. */
export function edges(out: Float32Array, fadeIn = 0.005, fadeOut = 0.05): Float32Array {
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
export function loopable(out: Float32Array, overlap = 1.5): Float32Array {
  const n = Math.round(overlap * RATE);
  const body = out.slice(0, out.length - n);
  for (let index = 0; index < n; index += 1) {
    const mix = index / n;
    body[index] = (body[index] ?? 0) * mix + (out[out.length - n + index] ?? 0) * (1 - mix);
  }
  return body;
}

/** One biquad section, run over a whole buffer. */
function biquad(input: Float32Array, b: readonly number[], a: readonly number[]): Float32Array {
  const [b0 = 0, b1 = 0, b2 = 0] = b.map((value) => value / (a[0] ?? 1));
  const [, a1 = 0, a2 = 0] = a.map((value) => value / (a[0] ?? 1));
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < input.length; index += 1) {
    const x = input[index] ?? 0;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[index] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/**
 * Integrated loudness in LUFS (ITU-R BS.1770 with its gating), as ffmpeg's ebur128 filter measures it.
 * Used to give each new sound the same loudness as the one it replaced, so the mix with the voices holds.
 */
export function loudness(samples: Float32Array): number {
  // The K-weighting: a high shelf for the head, then a high-pass for the low rumble ears ignore.
  const shelf = { gain: 3.999843853973347, q: 0.7071752369554196, freq: 1681.974450955533 };
  const big = 10 ** (shelf.gain / 40);
  const w0 = (TAU * shelf.freq) / RATE;
  const alpha = Math.sin(w0) / (2 * shelf.q);
  const cos = Math.cos(w0);
  const root = 2 * Math.sqrt(big) * alpha;
  const shelved = biquad(
    samples,
    [big * (big + 1 + (big - 1) * cos + root), -2 * big * (big - 1 + (big + 1) * cos), big * (big + 1 + (big - 1) * cos - root)],
    [big + 1 - (big - 1) * cos + root, 2 * (big - 1 - (big + 1) * cos), big + 1 - (big - 1) * cos - root],
  );
  const pass = { q: 0.5003270373238773, freq: 38.13547087602444 };
  const w1 = (TAU * pass.freq) / RATE;
  const alpha1 = Math.sin(w1) / (2 * pass.q);
  const cos1 = Math.cos(w1);
  const weighted = biquad(shelved, [(1 + cos1) / 2, -(1 + cos1), (1 + cos1) / 2], [1 + alpha1, -2 * cos1, 1 - alpha1]);

  const block = Math.round(0.4 * RATE);
  const hop = Math.round(0.1 * RATE);
  const powers: number[] = [];
  for (let start = 0; start + block <= weighted.length; start += hop) {
    let sum = 0;
    for (let index = start; index < start + block; index += 1) sum += (weighted[index] ?? 0) ** 2;
    powers.push(sum / block);
  }
  const lufs = (power: number) => -0.691 + 10 * Math.log10(power);
  const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
  const loud = powers.filter((power) => lufs(power) > -70);
  const gate = lufs(mean(loud)) - 10;
  return lufs(mean(loud.filter((power) => lufs(power) > gate)));
}

/**
 * A look-ahead peak limiter: turns the loudest moments down just before they arrive and lets go
 * slowly, so a sound can be brought up to its loudness without its peaks clipping or clicking.
 */
export function limit(samples: Float32Array, ceiling: number, lookahead = 0.003, release = 0.06): Float32Array {
  const ahead = Math.max(1, Math.round(lookahead * RATE));
  const want = samples.map((value) => Math.min(1, ceiling / Math.max(1e-9, Math.abs(value))));
  const floor = new Float32Array(want.length);
  for (let index = 0; index < want.length; index += 1) {
    let least = 1;
    for (let k = index; k < Math.min(want.length, index + ahead + 1); k += 1) least = Math.min(least, want[k] ?? 1);
    floor[index] = least;
  }
  // Averaging the next few milliseconds of `floor` makes the gain glide down instead of stepping, and
  // still lands at or under what each peak needs, since every value averaged already allows for it.
  const out = new Float32Array(samples.length);
  const recover = 1 - Math.exp(-1 / (release * RATE));
  // Before the first sample the window is filled with the first value, which already allows for every
  // peak in the opening milliseconds, so a loop that starts loud is held down from its first sample.
  const first = floor[0] ?? 1;
  let running = (ahead + 1) * first;
  let gain = first;
  for (let index = 0; index < samples.length; index += 1) {
    running += (floor[index] ?? 1) - (index - ahead - 1 >= 0 ? (floor[index - ahead - 1] ?? 1) : first);
    gain = Math.min(running / (ahead + 1), gain + (1 - gain) * recover);
    out[index] = (samples[index] ?? 0) * gain;
  }
  return out;
}

/**
 * Brings a sound to a loudness in LUFS with its peaks held under `ceiling`. The ceiling leaves room for
 * the MP3 encoder, whose peaks land a little above the samples it was given.
 */
export function master(samples: Float32Array, lufs: number, ceiling = 0.8): Float32Array {
  let out = samples;
  for (let pass = 0; pass < 8; pass += 1) {
    const miss = lufs - loudness(out);
    if (pass > 0 && Math.abs(miss) < 0.05) break;
    out = limit(out.map((value) => value * 10 ** (miss / 20)), ceiling);
  }
  return out;
}
