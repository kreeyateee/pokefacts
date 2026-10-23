/**
 * A livelier Piper read. Piper takes its settings once per run, so a line with "!" in it is read
 * sentence by sentence: the plain sentences in one run, the excited ones in another, then joined
 * back in order. Questions are read as plain sentences and keep their "?", which is what espeak
 * shapes question intonation from. No "!" is ever added.
 *
 * Measured on Cori with a pitch tracker (scratch script, five takes each): noise_scale and noise_w
 * barely move the pitch range, but they loosen the rhythm. Pace comes from length_scale. So an
 * excited sentence is read quicker and then lifted a semitone, which is what makes it sound brighter.
 */

/** Plain sentences: Piper's own defaults, a little quicker than the old 1.12 Pokédex read, and shorter pauses. */
export const PIPER_POKEDEX_ARGS = [
  "--length_scale",
  "1.0",
  "--noise_scale",
  "0.667",
  "--noise_w",
  "0.8",
  "--sentence_silence",
  "0.3",
] as const;

/** An excited sentence ends up this much higher: one semitone. */
export const EXCITED_LIFT = 2 ** (1 / 12);

/** How fast an excited sentence ends up. The lift speeds it up too, so Piper reads it slower by the same amount. */
const EXCITED_LENGTH = 0.9;

/** "!" sentences: quicker, a little more varied, then lifted. */
export const PIPER_EXCITED_ARGS = [
  "--length_scale",
  (EXCITED_LENGTH * EXCITED_LIFT).toFixed(3),
  "--noise_scale",
  "0.8",
  "--noise_w",
  "0.9",
  "--sentence_silence",
  "0.3",
] as const;

export type PiperSentence = { text: string; excited: boolean };

const CLOSE = `['"’”)]*`;

/**
 * Sentences, in order. A sentence ends at . ! or ? and any closing quote, before a space and a word
 * that does not start in lower case. So "'Look out!' says Mabel." stays one sentence.
 */
export function piperSentences(text: string): PiperSentence[] {
  return text
    .split(new RegExp(`(?<=[.!?]+${CLOSE})\\s+(?!\\p{Ll})`, "u"))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ text: part, excited: new RegExp(`!${CLOSE}$`).test(part) }));
}

type Wav = { format: Buffer; data: Buffer };

function chunks(wav: Buffer): Wav {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Piper did not write a recording.");
  }
  let format: Buffer | null = null;
  let data: Buffer | null = null;
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    const body = wav.subarray(at + 8, Math.min(wav.length, at + 8 + size));
    if (id === "fmt ") format = body;
    if (id === "data") data = body;
    at += 8 + size + (size % 2);
  }
  if (!format || !data || format.readUInt16LE(0) !== 1 || format.readUInt16LE(14) !== 16) {
    throw new Error("Piper did not write a recording.");
  }
  return { format, data };
}

function wavFile(format: Buffer, data: Buffer): Buffer {
  const head = Buffer.alloc(20);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(4 + 8 + format.length + 8 + data.length, 4);
  head.write("WAVE", 8, "ascii");
  head.write("fmt ", 12, "ascii");
  head.writeUInt32LE(format.length, 16);
  const dataHead = Buffer.alloc(8);
  dataHead.write("data", 0, "ascii");
  dataHead.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, format, dataHead, data]);
}

/** Piper's sentence takes, one after another. They must share a sample rate. */
export function joinWavs(takes: readonly Buffer[]): Buffer {
  const parts = takes.map(chunks);
  const first = parts[0];
  if (!first) throw new Error("Piper did not write a recording.");
  for (const part of parts) {
    if (!part.format.subarray(0, 16).equals(first.format.subarray(0, 16))) throw new Error("Piper takes did not match.");
  }
  return wavFile(first.format, Buffer.concat(parts.map((part) => part.data)));
}

/**
 * Raise the pitch by `factor` by playing the samples faster. The take gets shorter by the same
 * factor, which PIPER_EXCITED_ARGS has already allowed for.
 */
export function liftPitch(wav: Buffer, factor: number = EXCITED_LIFT): Buffer {
  const { format, data } = chunks(wav);
  const channels = format.readUInt16LE(2);
  const frames = Math.floor(data.length / (2 * channels));
  const out = Math.max(1, Math.floor(frames / factor));
  const lifted = Buffer.alloc(out * 2 * channels);
  for (let i = 0; i < out; i += 1) {
    const at = i * factor;
    const left = Math.min(frames - 1, Math.floor(at));
    const right = Math.min(frames - 1, left + 1);
    const mix = at - left;
    for (let c = 0; c < channels; c += 1) {
      const a = data.readInt16LE((left * channels + c) * 2);
      const b = data.readInt16LE((right * channels + c) * 2);
      lifted.writeInt16LE(Math.round(a + (b - a) * mix), (i * channels + c) * 2);
    }
  }
  return wavFile(format, lifted);
}
