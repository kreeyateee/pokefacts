/**
 * Draws the Poké Ball animations for the adventure player, and the 16×16 Poké Ball for the Yoto screen.
 * The ball is drawn here from circles and bands, frame by frame; nothing is traced or downloaded.
 *
 *   npx tsx scripts/make-pokeball-gifs.ts
 *   npx tsx scripts/make-pokeball-gifs.ts --sheets <folder>   also writes a contact sheet of each GIF
 *
 * The wobble follows the three thuds of the catch sound, and the caught GIF's click lands on its click.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { ffmpegCommand } from "../src/lib/ffmpeg-bin";
import { POKEBALL_GIFS, POKEBALL_STILLS, STORY_PIXELS, type StoryPixel } from "../src/lib/story/pokeball";
import { CATCH_CLICK, CATCH_WOBBLES } from "../src/lib/story/story-sound";

const SIZE = 220;
const FPS = 25;
const SUPER = 3;
/** The player panel's cream, so the edges blend without a halo. */
const BACKGROUND: RGB = [255, 253, 246];

type RGB = [number, number, number];
type Paint = { colour: RGB; alpha: number } | null;

const RED: RGB = [232, 56, 40];
const RED_DARK: RGB = [168, 28, 22];
const WHITE: RGB = [248, 248, 246];
const GREY: RGB = [196, 198, 204];
const INK: RGB = [28, 28, 34];
const GLOW: RGB = [255, 226, 96];
const STAR: RGB = [255, 206, 40];
const STAR_EDGE: RGB = [230, 140, 20];

const mixRGB = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));

const R = 62;
const GROUND = 186;
const CENTRE_X = SIZE / 2;

/** Where the ball is and how it is bent: rocking angle, squash, and an optional half that has flown off. */
type BallPose = {
  x: number;
  y: number;
  angle: number;
  squash: number;
  /** 0 to 1: the button lit up. */
  flash?: number;
  /** Only draw the top (-1) or bottom (1) half. */
  half?: -1 | 1;
};

/** The ball's colour at a point in its own frame, or null outside it. */
function ballPaint(u: number, v: number, pose: BallPose): Paint {
  const r = Math.hypot(u, v);
  if (r > R) return null;
  if (pose.half === -1 && v > 0) return null;
  if (pose.half === 1 && v < 0) return null;
  if (r > R - 4.5) return { colour: INK, alpha: 1 };
  const button = Math.hypot(u, v);
  if (button < 19) {
    if (button > 13.5) return { colour: INK, alpha: 1 };
    if (button > 11.5) return { colour: mixRGB(GREY, WHITE, 0.3), alpha: 1 };
    const glow = pose.flash ?? 0;
    return { colour: mixRGB(mixRGB(WHITE, GREY, clamp((u + v) / 30 + 0.3) * 0.5), GLOW, glow), alpha: 1 };
  }
  if (Math.abs(v) < 5.5) return { colour: INK, alpha: 1 };
  // Soft light from the top left, shade to the bottom right.
  const light = clamp(1 - Math.hypot(u + R * 0.35, v + R * 0.45) / (R * 0.55)) ** 2;
  const shade = clamp((u + v) / (2.2 * R) + 0.45);
  if (v < 0) return { colour: mixRGB(mixRGB(RED, RED_DARK, shade * 0.7), WHITE, light * 0.55), alpha: 1 };
  return { colour: mixRGB(mixRGB(WHITE, GREY, shade * 0.8), WHITE, light * 0.4), alpha: 1 };
}

/** Takes a canvas point into the ball's own frame: rotation about its centre, squash from the ground. */
function toBall(x: number, y: number, pose: BallPose): [number, number] {
  const dx = x - pose.x;
  const dy = y - pose.y;
  const cos = Math.cos(-pose.angle);
  const sin = Math.sin(-pose.angle);
  const u = dx * cos - dy * sin;
  const v = dx * sin + dy * cos;
  const sy = 1 - pose.squash;
  const sx = 1 + pose.squash * 0.8;
  // Squash is anchored at the bottom of the ball.
  return [u / sx, (v - R) / sy + R];
}

type Star = { x: number; y: number; size: number; spin: number; alpha: number };

function starPaint(x: number, y: number, star: Star): Paint {
  const dx = x - star.x;
  const dy = y - star.y;
  const r = Math.hypot(dx, dy);
  if (r > star.size) return null;
  const angle = Math.atan2(dy, dx) + star.spin;
  const edge = star.size * (0.45 + 0.55 * (0.5 + 0.5 * Math.cos(5 * angle)) ** 2.2);
  if (r > edge) return null;
  return { colour: r > edge - 2.2 ? STAR_EDGE : STAR, alpha: star.alpha };
}

type Scene = {
  balls: BallPose[];
  stars?: Star[];
  /** A white burst at a point: 0 to 1. */
  flash?: { x: number; y: number; radius: number; alpha: number };
  /** Width of the shadow under the ball, 0 for none. */
  shadow: number;
};

function render(scene: Scene): Buffer {
  const out = Buffer.alloc(SIZE * SIZE * 3);
  for (let py = 0; py < SIZE; py += 1) {
    for (let px = 0; px < SIZE; px += 1) {
      let sum: RGB = [0, 0, 0];
      for (let sy = 0; sy < SUPER; sy += 1) {
        for (let sx = 0; sx < SUPER; sx += 1) {
          const x = px + (sx + 0.5) / SUPER;
          const y = py + (sy + 0.5) / SUPER;
          let colour: RGB = BACKGROUND;
          if (scene.shadow > 0) {
            const e = ((x - CENTRE_X) / scene.shadow) ** 2 + ((y - GROUND - 2) / 7) ** 2;
            if (e < 1) colour = mixRGB(colour, [120, 110, 90], 0.28 * (1 - e));
          }
          if (scene.flash) {
            const d = Math.hypot(x - scene.flash.x, y - scene.flash.y) / scene.flash.radius;
            if (d < 1) colour = mixRGB(colour, [255, 222, 110], scene.flash.alpha * (1 - d) ** 0.6);
          }
          for (const pose of scene.balls) {
            const [u, v] = toBall(x, y, pose);
            const paint = ballPaint(u, v, pose);
            if (paint) colour = mixRGB(colour, paint.colour, paint.alpha);
          }
          for (const star of scene.stars ?? []) {
            const paint = starPaint(x, y, star);
            if (paint) colour = mixRGB(colour, paint.colour, paint.alpha);
          }
          sum = [sum[0] + colour[0], sum[1] + colour[1], sum[2] + colour[2]];
        }
      }
      const at = (py * SIZE + px) * 3;
      const n = SUPER * SUPER;
      out[at] = Math.round(sum[0] / n);
      out[at + 1] = Math.round(sum[1] / n);
      out[at + 2] = Math.round(sum[2] / n);
    }
  }
  return out;
}

const RESTING_Y = GROUND - R;

/** A ball resting on the ground, rolled by `angle` (it rolls, so it moves sideways as it tips). */
function resting(angle: number, squash = 0, flash = 0): BallPose {
  return { x: CENTRE_X + angle * R, y: RESTING_Y, angle, squash, flash };
}

/** The rocking angle `t` seconds after a wobble starts: a tip one way, back the other, then still. */
function rock(t: number, size: number): number {
  if (t < 0 || t > 0.5) return 0;
  return size * Math.sin((Math.PI * 2 * t) / 0.42) * Math.exp(-t * 4.5);
}

function squashAt(t: number): number {
  return t >= 0 && t < 0.14 ? 0.09 * Math.sin((Math.PI * t) / 0.14) : 0;
}

/** Three wobbles, timed to the catch sound's three thuds. It ends just before the click. */
function wobbleFrames(): Scene[] {
  const frames: Scene[] = [];
  const length = CATCH_CLICK - 0.05;
  const sizes = [0.3, 0.26, 0.22];
  for (let frame = 0; frame < Math.round(length * FPS); frame += 1) {
    const t = frame / FPS;
    let angle = 0;
    let squash = 0;
    CATCH_WOBBLES.forEach((at, index) => {
      angle += rock(t - at, sizes[index] ?? 0.2) * (index % 2 === 0 ? 1 : -1);
      squash += squashAt(t - at);
    });
    frames.push({ balls: [resting(angle, squash)], shadow: R * (0.85 + squash) });
  }
  return frames;
}

/** Starts at the click: the button lights up, stars burst out, and it settles. Holds the last frame. */
function caughtFrames(): Scene[] {
  const frames: Scene[] = [];
  const total = 1.4;
  const click = 0.05;
  for (let frame = 0; frame <= Math.round(total * FPS); frame += 1) {
    const t = frame / FPS;
    const since = t - click;
    const flash = since < 0 ? 0 : since < 0.08 ? 1 : clamp(1 - (since - 0.08) / 0.5) * 0.85 + 0.15;
    const stars: Star[] = [];
    if (since > 0) {
      const spread = 1 - Math.exp(-since * 5);
      for (let n = 0; n < 6; n += 1) {
        const direction = -Math.PI / 2 + (n - 2.5) * 0.62;
        const reach = 98 + (n % 2) * 12;
        stars.push({
          x: CENTRE_X + Math.cos(direction) * reach * spread,
          y: RESTING_Y + Math.sin(direction) * reach * spread,
          size: (n % 2 ? 12 : 16) * (since < 0.1 ? since / 0.1 : 1),
          spin: since * 3 * (n % 2 ? 1 : -1),
          alpha: clamp(1.25 - since * 1.1),
        });
      }
    }
    const burst = since > 0 && since < 0.25 ? { x: CENTRE_X, y: RESTING_Y, radius: 30 + since * 240, alpha: 0.6 * (1 - since / 0.25) } : undefined;
    frames.push({ balls: [resting(0, squashAt(since) * 0.5, flash)], stars, flash: burst, shadow: R * 0.85 });
  }
  return frames;
}

/** A hard shake, a flash, and the two halves spring apart and land open. Holds the last frame. */
function brokeFreeFrames(): Scene[] {
  const frames: Scene[] = [];
  const pop = 0.15;
  const total = 1.2;
  for (let frame = 0; frame <= Math.round(total * FPS); frame += 1) {
    const t = frame / FPS;
    if (t < pop) {
      const shake = 0.16 * Math.sin(t * 2 * Math.PI * 14) * (t / pop);
      frames.push({ balls: [resting(shake, 0.04 * Math.abs(Math.sin(t * 60)))], shadow: R * 0.85 });
      continue;
    }
    const since = t - pop;
    const fly = clamp(since / 0.55);
    const ease = 1 - (1 - fly) ** 3;
    // The top half arcs up and to the left, spins, and lands upside down; the bottom half rolls right.
    const topX = CENTRE_X - 44 * ease;
    const arc = Math.sin(Math.PI * fly) * 70;
    const topY = RESTING_Y + 18 * ease - arc;
    const top: BallPose = { x: topX, y: topY, angle: -Math.PI * 0.9 * ease, squash: 0, half: -1 };
    const bottom: BallPose = { x: CENTRE_X + 28 * ease, y: RESTING_Y, angle: 0.35 * ease, squash: 0, half: 1 };
    const stars: Star[] = [];
    for (let n = 0; n < 5; n += 1) {
      const direction = -Math.PI / 2 + (n - 2) * 0.7;
      const spread = 1 - Math.exp(-since * 6);
      stars.push({
        x: CENTRE_X + Math.cos(direction) * 80 * spread,
        y: RESTING_Y + Math.sin(direction) * 80 * spread,
        size: 9,
        spin: since * 4,
        alpha: clamp(1 - since * 1.6),
      });
    }
    const flash = since < 0.35 ? { x: CENTRE_X, y: RESTING_Y, radius: 70 + since * 260, alpha: 1 - since / 0.35 } : undefined;
    frames.push({ balls: [bottom, top], stars, flash, shadow: R * 0.85 * (1 - 0.3 * ease) });
  }
  return frames;
}

function writeGif(file: string, frames: Scene[]) {
  const output = path.join(process.cwd(), "public", file);
  mkdirSync(path.dirname(output), { recursive: true });
  const raw = Buffer.concat(frames.map(render));
  execFileSync(
    ffmpegCommand(),
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${SIZE}x${SIZE}`,
      "-r",
      String(FPS),
      "-i",
      "pipe:0",
      "-vf",
      "split[a][b];[a]palettegen=max_colors=32:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
      // Play once and stop on the last frame.
      "-loop",
      "-1",
      output,
    ],
    { input: raw, maxBuffer: 1 << 26 },
  );
  console.log(`Wrote ${file} (${frames.length} frames, ${(frames.length / FPS).toFixed(2)}s)`);
  return raw;
}

function writeSheet(folder: string, name: string, raw: Buffer, frames: number) {
  const columns = 8;
  const rows = Math.ceil(frames / columns);
  execFileSync(
    ffmpegCommand(),
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${SIZE}x${SIZE}`,
      "-r",
      String(FPS),
      "-i",
      "pipe:0",
      "-vf",
      `scale=110:110,tile=${columns}x${rows}:padding=2:color=white`,
      "-frames:v",
      "1",
      path.join(folder, `${name}-frames.png`),
    ],
    { input: raw, maxBuffer: 1 << 26 },
  );
}

/** One frame as a PNG, for when motion is turned down. */
function writeStill(file: string, frame: Scene) {
  execFileSync(
    ffmpegCommand(),
    ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${SIZE}x${SIZE}`, "-i", "pipe:0", "-frames:v", "1", path.join(process.cwd(), "public", file)],
    { input: render(frame) },
  );
  console.log(`Wrote ${file}`);
}

/** The 16×16 pictures for the Yoto screen, drawn pixel by pixel. */
const PIXEL_ART: Record<"pokeball" | "pokeball-caught" | "pokeball-broken", string[]> = {
  pokeball: [
    "................",
    ".....KKKKKK.....",
    "...KKRRRRRRKK...",
    "..KRRWRRRRRRRK..",
    "..KRWRRRRRRRRK..",
    ".KRRRRRRRRRRRRK.",
    ".KRRRRRKKRRRRRK.",
    ".KKKKKKWWKKKKKK.",
    ".KKKKKKWWKKKKKK.",
    ".KWWWWWKKWWWWWK.",
    ".KWWWWWWWWWWWGK.",
    "..KWWWWWWWWWGK..",
    "..KWWWWWWWWGGK..",
    "...KKWWWWWGKK...",
    ".....KKKKKK.....",
    "................",
  ],
  // Caught: the button lit up and little sparkles round it.
  "pokeball-caught": [
    "Y..............Y",
    ".Y...KKKKKK...Y.",
    "....KRRRRRRK....",
    "...KRWRRRRRRK...",
    "..KRRRRRRRRRRK..",
    "..KRRRRKKRRRRK..",
    "..KKKKKYYKKKKK..",
    "..KKKKKYYKKKKK..",
    "..KWWWWKKWWWWK..",
    "..KWWWWWWWWWGK..",
    "...KWWWWWWWGK...",
    "....KWWWWWGK....",
    ".....KKKKKK.....",
    "................",
    ".Y............Y.",
    "Y..............Y",
  ],
  // Broke free: the two halves sprung apart, with a little burst between them.
  "pokeball-broken": [
    "................",
    "...KKKKK........",
    "..KRRRRRK....Y..",
    ".KRWRRRRRK..Y.Y.",
    ".KRRRRRRRK...Y..",
    ".KRRRRRRRK......",
    ".KKKKKKKKK......",
    "................",
    ".Y..............",
    "Y.Y...KKKKKKKKK.",
    ".Y....KWWWWWWWK.",
    "......KWWWWWWWK.",
    "......KWWWWWWGK.",
    ".......KWWWWGK..",
    "........KKKKK...",
    "................",
  ],
};
/** A gym badge: an eight-sided gem with a sparkle, in each gym's colours (C main, L light, D dark). */
const BADGE_ART = [
  "................",
  ".....KKKKKK.....",
  "....KLLCCCCK....",
  "...KLLCCCCCDK...",
  "..KLLCCCCCCCDK..",
  "..KLCCCCCCCCDK..",
  "..KCCCCWCCCCDK..",
  "..KCCCWWWCCCDK..",
  "..KCCCCWCCCCDK..",
  "..KCCCCCCCCDDK..",
  "..KDCCCCCCCDDK..",
  "...KDDCCCCDDK...",
  "....KDDDDDDK....",
  ".....KKKKKK.....",
  "................",
  "................",
];

type RGBA = [number, number, number, number];
const hex = (value: string): RGBA => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
  255,
];

const BADGE_COLOURS: Record<string, [string, string, string]> = {
  "badge-rock": ["#b8a038", "#e0d080", "#7a6a20"],
  "badge-water": ["#3890f0", "#9fd0ff", "#1f5fb0"],
  "badge-grass": ["#48b848", "#a8e8a0", "#2a7a2a"],
  "badge-electric": ["#f8d030", "#fff4a0", "#b89010"],
  "badge-flying": ["#a890f0", "#d8ccff", "#6a58b0"],
  "badge-fire": ["#f08030", "#ffc090", "#b04a10"],
  "badge-ground": ["#d8a050", "#f0d0a0", "#8a6020"],
  "badge-dragon": ["#7038f8", "#b8a0ff", "#4010a8"],
};

const TROPHY_ART = [
  "................",
  "..KKKKKKKKKKKK..",
  ".KYLLYYYYYYYDYK.",
  "KYKYLYYYYYYYDKYK",
  "KYKYYYYYYYYYDKYK",
  ".KKYYYYYYYYYDKK.",
  "...KYYYYYYYDK...",
  "....KYYYYYDK....",
  ".....KYYYDK.....",
  "......KYDK......",
  "......KYDK......",
  ".....KYYYDK.....",
  "....KKKKKKKK....",
  "....KDDDDDDK....",
  "....KKKKKKKK....",
  "................",
];

function artFor(name: StoryPixel): { art: string[]; colours: Record<string, RGBA> } {
  const badge = BADGE_COLOURS[name];
  if (badge) {
    const [main, light, dark] = badge;
    return { art: BADGE_ART, colours: { ...PIXEL_COLOURS, C: hex(main), L: hex(light), D: hex(dark) } };
  }
  if (name === "trophy") {
    return { art: TROPHY_ART, colours: { ...PIXEL_COLOURS, Y: hex("#f8c838"), L: hex("#fff0a0"), D: hex("#b08010") } };
  }
  return { art: PIXEL_ART[name as keyof typeof PIXEL_ART], colours: PIXEL_COLOURS };
}

const PIXEL_COLOURS: Record<string, [number, number, number, number]> = {
  ".": [0, 0, 0, 0],
  K: [24, 24, 30, 255],
  R: [232, 56, 40, 255],
  W: [250, 250, 250, 255],
  G: [180, 182, 190, 255],
  Y: [255, 206, 40, 255],
};

/** The ball rocking: its top half moved a pixel left or right, so it tilts on the spot. */
function tilted(art: string[], dx: -1 | 1): string[] {
  return art.map((row, y) => (y > 8 ? row : dx > 0 ? `.${row.slice(0, -1)}` : `${row.slice(1)}.`));
}

/** The caught ball with its sparkles off, so they twinkle. Only sparkles are yellow outside the ball. */
function unsparkled(art: string[]): string[] {
  return art.map((row) => [...row].map((cell, x) => (cell === "Y" && (x < 4 || x > 11) ? "." : cell)).join(""));
}

const hold = (art: string[], frames: number): string[][] => Array.from({ length: frames }, () => art);

/** One wobble at 10 frames a second: still, tip left, back, tip right, back. */
const wobbleArt = (art: string[]): string[][] => [
  ...hold(art, 2),
  ...hold(tilted(art, -1), 2),
  art,
  ...hold(tilted(art, 1), 2),
  art,
];

/**
 * The animated 16×16 Poké Balls for the Yoto screen. They loop for as long as the track plays: the
 * ball rocking now and then while you choose a throw; three wobbles, then the click and twinkling
 * sparkles, for a catch; two wobbles and a burst for one that broke free.
 */
const PIXEL_ANIMATIONS: Partial<Record<StoryPixel, () => string[][]>> = {
  pokeball: () => [...hold(PIXEL_ART.pokeball, 8), ...wobbleArt(PIXEL_ART.pokeball)],
  "pokeball-caught": () => {
    const caught = PIXEL_ART["pokeball-caught"];
    const twinkle = [...hold(caught, 4), ...hold(unsparkled(caught), 2)];
    const wobbles = [...wobbleArt(PIXEL_ART.pokeball), ...wobbleArt(PIXEL_ART.pokeball), ...wobbleArt(PIXEL_ART.pokeball)];
    return [...wobbles, ...twinkle, ...twinkle, ...twinkle];
  },
  "pokeball-broken": () => [
    ...wobbleArt(PIXEL_ART.pokeball),
    ...wobbleArt(PIXEL_ART.pokeball),
    ...hold(PIXEL_ART["pokeball-broken"], 16),
  ],
};

function pixelRaw(art: string[], colours: Record<string, RGBA>): Buffer {
  if (art.length !== 16 || art.some((row) => row.length !== 16)) throw new Error("A picture is not 16 by 16.");
  const raw = Buffer.alloc(16 * 16 * 4);
  art.forEach((row, y) => [...row].forEach((cell, x) => raw.set(colours[cell] ?? [0, 0, 0, 0], (y * 16 + x) * 4)));
  return raw;
}

/** An animated 16×16 GIF with a clear background, looping forever at 10 frames a second. */
function writeAnimatedPixel(name: StoryPixel, frames: string[][], colours: Record<string, RGBA>) {
  const output = path.join(process.cwd(), "public", STORY_PIXELS[name]);
  mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(
    ffmpegCommand(),
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      "16x16",
      "-r",
      "10",
      "-i",
      "pipe:0",
      "-vf",
      "split[a][b];[a]palettegen=max_colors=16:reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=none:alpha_threshold=128",
      "-loop",
      "0",
      output,
    ],
    { input: Buffer.concat(frames.map((frame) => pixelRaw(frame, colours))) },
  );
  console.log(`Wrote ${STORY_PIXELS[name]} (${frames.length} frames, looping)`);
}

function writePixel(name: StoryPixel) {
  const { art, colours } = artFor(name);
  const animate = PIXEL_ANIMATIONS[name];
  if (animate) {
    writeAnimatedPixel(name, animate(), colours);
    return;
  }
  if (art.length !== 16 || art.some((row) => row.length !== 16)) throw new Error(`${name} is not 16 by 16.`);
  const output = path.join(process.cwd(), "public", STORY_PIXELS[name]);
  mkdirSync(path.dirname(output), { recursive: true });
  const raw = Buffer.alloc(16 * 16 * 4);
  art.forEach((row, y) => [...row].forEach((cell, x) => raw.set(colours[cell] ?? [0, 0, 0, 0], (y * 16 + x) * 4)));
  execFileSync(
    ffmpegCommand(),
    ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", "16x16", "-i", "pipe:0", "-frames:v", "1", output],
    { input: raw },
  );
  console.log(`Wrote ${STORY_PIXELS[name]}`);
}

const sheetFlag = process.argv.indexOf("--sheets");
const sheets = sheetFlag >= 0 ? process.argv[sheetFlag + 1] : undefined;
if (sheets) mkdirSync(sheets, { recursive: true });

for (const [name, make] of [
  ["wobble", wobbleFrames],
  ["caught", caughtFrames],
  ["broke-free", brokeFreeFrames],
] as const) {
  const frames = make();
  const file = name === "wobble" ? POKEBALL_GIFS.wobble : name === "caught" ? POKEBALL_GIFS.caught : POKEBALL_GIFS.brokeFree;
  const raw = writeGif(file, frames);
  if (sheets) writeSheet(sheets, name, raw, frames.length);
  const still = name === "caught" ? POKEBALL_STILLS.caught : name === "broke-free" ? POKEBALL_STILLS.brokeFree : undefined;
  if (still) writeStill(still, frames.at(-1) as Scene);
}
for (const name of Object.keys(STORY_PIXELS) as StoryPixel[]) writePixel(name);
