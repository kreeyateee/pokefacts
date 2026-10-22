/**
 * Writes the Poké Ball catch sound the adventure cards play: three wobbling "dun"s, then a click and a little chime.
 * It is synthesised here from plain waves, not copied from the games, so it can be tuned freely.
 *
 *   npx tsx scripts/make-catch-sound.ts
 *
 * To use your own recording instead, replace the file at CATCH_SOUND_PATH with any short MP3.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { YOTO_MP3_ARGS } from "../src/lib/cry-audio";
import { ffmpegCommand } from "../src/lib/ffmpeg-bin";
import { CATCH_SOUND_PATH } from "../src/lib/story/story-sound";

/** When each wobble lands, in seconds. The games leave about half a second between them. */
const WOBBLES = [0.05, 0.6, 1.15];
const CLICK_AT = 1.8;
const CHIME_AT = 1.86;
const LENGTH = 2.6;

/** Seconds as ffmpeg should read them, without floating-point tails. */
const sec = (value: number) => value.toFixed(3);

/** One wobble: a short low "dun" that drops in pitch, a second voice an octave up for small speakers, and a rattle. */
function wobble(at: number): string {
  const t = `(t-${sec(at)})`;
  const gate = `between(t,${sec(at)},${sec(at + 0.5)})`;
  const sweep = `(330*${t}-170*${t}*${t})`;
  const body = `0.55*sin(2*PI*${sweep})+0.3*sin(4*PI*${sweep})`;
  const rattle = `0.18*sin(2*PI*1150*${t})*exp(-${t}*90)`;
  return `${gate}*(exp(-${t}*11)*(${body})+${rattle})`;
}

/** The click: a bright square burst that dies in a few hundredths of a second. */
function click(at: number): string {
  const t = `(t-${sec(at)})`;
  return `between(t,${sec(at)},${sec(at + 0.05)})*0.6*sgn(sin(2*PI*2600*${t}))*exp(-${t}*140)`;
}

/** A small rising two-note sparkle after the click. */
function chime(at: number): string {
  const note = (start: number, hz: number) =>
    `between(t,${sec(start)},${sec(LENGTH)})*0.22*sin(2*PI*${hz}*(t-${sec(start)}))*exp(-(t-${sec(start)})*7)`;
  return `${note(at, 1568)}+${note(at + 0.11, 2093)}`;
}

const expression = [...WOBBLES.map(wobble), click(CLICK_AT), chime(CHIME_AT)].join("+");
const output = path.join(process.cwd(), "public", CATCH_SOUND_PATH);
mkdirSync(path.dirname(output), { recursive: true });

execFileSync(
  ffmpegCommand(),
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    // Quoted, because the expression's commas would otherwise split the filter.
    `aevalsrc=exprs='${expression}':s=44100:d=${LENGTH}`,
    "-af",
    "afade=t=out:st=2.35:d=0.25,alimiter=limit=0.9",
    ...YOTO_MP3_ARGS,
    output,
  ],
  { stdio: "inherit" },
);
console.log(`Wrote ${output}`);
