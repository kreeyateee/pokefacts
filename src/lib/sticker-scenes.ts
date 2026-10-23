/**
 * Backgrounds for the group photo and the pile: the kinds of place Pokémon live in the games (grassland,
 * forest, water's edge, sea, cave, mountain, rough terrain, city, and the rare ones that live in the
 * sky), plus plain white and the original blue sky. Drawn in code at any size, in soft colours so the
 * Pokémon stand out in front.
 */
export const SCENES = [
  "plain",
  "sky",
  "grassland",
  "forest",
  "lake",
  "sea",
  "cave",
  "mountain",
  "desert",
  "city",
  "stars",
] as const;

export type Scene = (typeof SCENES)[number];

export const SCENE_LABELS: Record<Scene, string> = {
  plain: "Plain",
  sky: "Blue sky",
  grassland: "Grassland",
  forest: "Forest",
  lake: "Water's edge",
  sea: "Sea",
  cave: "Cave",
  mountain: "Mountain",
  desert: "Rough terrain",
  city: "City",
  stars: "Starry sky",
};

export function isScene(value: unknown): value is Scene {
  return typeof value === "string" && (SCENES as readonly string[]).includes(value);
}

/** Small and repeatable, so the same scene always has its trees and stars in the same places. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Paint = { ctx: CanvasRenderingContext2D; w: number; h: number; u: number };

function gradient(p: Paint, stops: ReadonlyArray<[number, string]>, from = 0, to = 1) {
  const fill = p.ctx.createLinearGradient(0, from * p.h, 0, to * p.h);
  for (const [at, colour] of stops) fill.addColorStop(at, colour);
  p.ctx.fillStyle = fill;
  p.ctx.fillRect(0, from * p.h, p.w, (to - from) * p.h);
}

/** A band of rolling hills whose top wanders around `top` (a fraction of the height). */
function hills(p: Paint, top: number, swing: number, bumps: number, colour: string, phase: number) {
  const { ctx, w, h } = p;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, h);
  const steps = 48;
  for (let index = 0; index <= steps; index += 1) {
    const x = index / steps;
    const y = top + swing * Math.sin(x * Math.PI * bumps + phase) + swing * 0.4 * Math.sin(x * Math.PI * bumps * 2.3 + phase * 1.7);
    ctx.lineTo(x * w, y * h);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function sun(p: Paint, x: number, y: number, radius: number, colour: string, glow: string) {
  const { ctx, w, h, u } = p;
  const halo = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, radius * u * 2.4);
  halo.addColorStop(0, glow);
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x * w - radius * u * 2.4, y * h - radius * u * 2.4, radius * u * 4.8, radius * u * 4.8);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x * w, y * h, radius * u, 0, Math.PI * 2);
  ctx.fill();
}

function cloud(p: Paint, x: number, y: number, size: number) {
  const { ctx, w, h, u } = p;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (const [dx, dy, r] of [
    [0, 0, 1],
    [0.9, 0.15, 0.8],
    [-0.9, 0.2, 0.75],
    [0.35, -0.45, 0.8],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x * w + dx * size * u, y * h + dy * size * u, r * size * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

function pine(p: Paint, x: number, base: number, height: number, colour: string) {
  const { ctx, w, h, u } = p;
  const width = height * 0.42;
  ctx.fillStyle = colour;
  for (let tier = 0; tier < 3; tier += 1) {
    const top = base * h - height * u * (0.38 + tier * 0.3);
    const bottom = base * h - height * u * (tier * 0.27);
    const half = width * u * (1 - tier * 0.22);
    ctx.beginPath();
    ctx.moveTo(x * w, top);
    ctx.lineTo(x * w + half, bottom);
    ctx.lineTo(x * w - half, bottom);
    ctx.closePath();
    ctx.fill();
  }
}

function roundTree(p: Paint, x: number, base: number, size: number, crown: string, trunk: string) {
  const { ctx, w, h, u } = p;
  ctx.fillStyle = trunk;
  ctx.fillRect(x * w - size * u * 0.12, base * h - size * u * 1.1, size * u * 0.24, size * u * 1.1);
  ctx.fillStyle = crown;
  for (const [dx, dy, r] of [
    [0, -1.55, 0.8],
    [-0.5, -1.2, 0.6],
    [0.5, -1.2, 0.6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x * w + dx * size * u, base * h + dy * size * u, r * size * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

function waves(p: Paint, from: number, to: number, rows: number, colour: string) {
  const { ctx, w, h, u } = p;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, u * 0.004);
  ctx.lineCap = "round";
  for (let row = 0; row < rows; row += 1) {
    const y = (from + ((to - from) * (row + 0.5)) / rows) * h;
    const length = w / (6 + row);
    for (let x = ((row * 37) % 50) / 100 * length; x < w; x += length * 1.6) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + length * 0.25, y - u * 0.012, x + length * 0.5, y);
      ctx.stroke();
    }
  }
}

function paintGrassland(p: Paint) {
  gradient(p, [
    [0, "#a8dcff"],
    [0.6, "#e4f5ff"],
    [1, "#fdf6d8"],
  ]);
  sun(p, 0.82, 0.12, 0.07, "#fff6b0", "rgba(255,246,176,0.7)");
  cloud(p, 0.22, 0.12, 0.05);
  cloud(p, 0.6, 0.2, 0.035);
  hills(p, 0.56, 0.03, 2.2, "#cfeaa8", 0.4);
  hills(p, 0.66, 0.035, 1.6, "#b5df8c", 2.1);
  hills(p, 0.78, 0.03, 2.8, "#9ed276", 4.2);
  const random = seeded(7);
  const { ctx, w, h, u } = p;
  for (let index = 0; index < 70; index += 1) {
    const x = random() * w;
    const y = (0.8 + random() * 0.2) * h;
    ctx.fillStyle = ["#ffffff", "#ffd84a", "#ff9fb8", "#c9a7ff"][index % 4]!;
    ctx.beginPath();
    ctx.arc(x, y, u * (0.005 + random() * 0.004), 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintForest(p: Paint) {
  gradient(p, [
    [0, "#d8f1df"],
    [0.6, "#eef8e6"],
    [1, "#dcefc6"],
  ]);
  const { ctx, w, h } = p;
  // Sunbeams through the canopy.
  ctx.fillStyle = "rgba(255,255,230,0.35)";
  for (const start of [0.1, 0.38, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(start * w, 0);
    ctx.lineTo((start + 0.1) * w, 0);
    ctx.lineTo((start + 0.32) * w, h);
    ctx.lineTo((start + 0.18) * w, h);
    ctx.closePath();
    ctx.fill();
  }
  const random = seeded(11);
  for (let index = 0; index < 9; index += 1) pine(p, index / 8 + (random() - 0.5) * 0.06, 0.62, 0.34 + random() * 0.1, "#b9dcae");
  for (let index = 0; index < 7; index += 1) roundTree(p, index / 6 + (random() - 0.5) * 0.08, 0.76, 0.1 + random() * 0.03, "#9ccd8a", "#b49a78");
  hills(p, 0.84, 0.015, 3, "#a9d68f", 1.3);
  for (let index = 0; index < 6; index += 1) pine(p, index / 5 + (random() - 0.5) * 0.05, 1.02, 0.3 + random() * 0.08, "#8cc47c");
}

function paintLake(p: Paint) {
  gradient(p, [
    [0, "#b2e0ff"],
    [1, "#eaf7ff"],
  ], 0, 0.5);
  cloud(p, 0.3, 0.14, 0.045);
  cloud(p, 0.78, 0.09, 0.03);
  hills(p, 0.44, 0.03, 1.8, "#c6e7c0", 0.8);
  gradient(p, [
    [0, "#bfe6f6"],
    [1, "#8fd0ee"],
  ], 0.5, 0.82);
  waves(p, 0.53, 0.8, 6, "rgba(255,255,255,0.75)");
  hills(p, 0.82, 0.012, 2.4, "#efe1b6", 0.2);
  hills(p, 0.9, 0.015, 2, "#b8de96", 1.4);
  const { ctx, w, h, u } = p;
  ctx.strokeStyle = "#7fb36a";
  ctx.lineWidth = Math.max(1, u * 0.006);
  ctx.lineCap = "round";
  for (const [x, side] of [
    [0.04, 1],
    [0.07, -1],
    [0.1, 1],
    [0.9, -1],
    [0.93, 1],
    [0.96, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x * w, 0.88 * h);
    ctx.quadraticCurveTo((x + 0.01 * side) * w, 0.78 * h, (x + 0.02 * side) * w, 0.72 * h);
    ctx.stroke();
  }
}

function paintSea(p: Paint) {
  gradient(p, [
    [0, "#9fd8ff"],
    [1, "#e8f7ff"],
  ], 0, 0.38);
  sun(p, 0.2, 0.12, 0.06, "#fff3a6", "rgba(255,243,166,0.65)");
  cloud(p, 0.7, 0.12, 0.045);
  gradient(p, [
    [0, "#8fd3f0"],
    [0.6, "#6fc0e6"],
    [1, "#a8e2f2"],
  ], 0.38, 0.88);
  waves(p, 0.4, 0.86, 9, "rgba(255,255,255,0.7)");
  gradient(p, [
    [0, "#f6e7bd"],
    [1, "#fbf2d6"],
  ], 0.88, 1);
  hills(p, 0.87, 0.01, 3.5, "#f3e2b2", 0.6);
}

function paintCave(p: Paint) {
  gradient(p, [
    [0, "#b6a9c7"],
    [0.55, "#cfc4da"],
    [1, "#bcae9e"],
  ]);
  const { ctx, w, h, u } = p;
  const random = seeded(23);
  ctx.fillStyle = "#9d8fb1";
  for (let index = 0; index < 14; index += 1) {
    const x = (index + random() * 0.6) / 14;
    const reach = 0.06 + random() * 0.12;
    ctx.beginPath();
    ctx.moveTo((x - 0.035) * w, 0);
    ctx.lineTo((x + 0.035) * w, 0);
    ctx.lineTo(x * w, reach * h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#a59484";
  for (let index = 0; index < 10; index += 1) {
    const x = (index + random() * 0.6) / 10;
    const reach = 0.05 + random() * 0.09;
    ctx.beginPath();
    ctx.moveTo((x - 0.04) * w, h);
    ctx.lineTo((x + 0.04) * w, h);
    ctx.lineTo(x * w, (1 - reach) * h);
    ctx.closePath();
    ctx.fill();
  }
  // Glowing crystals.
  for (let index = 0; index < 12; index += 1) {
    const x = random() * w;
    const y = (0.2 + random() * 0.7) * h;
    const size = u * (0.012 + random() * 0.012);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
    glow.addColorStop(0, "rgba(190,240,255,0.7)");
    glow.addColorStop(1, "rgba(190,240,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
    ctx.fillStyle = "#e3f8ff";
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.5, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.5, y);
    ctx.closePath();
    ctx.fill();
  }
}

function peak(p: Paint, x: number, top: number, half: number, rock: string, snow: string) {
  const { ctx, w, h } = p;
  ctx.fillStyle = rock;
  ctx.beginPath();
  ctx.moveTo((x - half) * w, h);
  ctx.lineTo(x * w, top * h);
  ctx.lineTo((x + half) * w, h);
  ctx.closePath();
  ctx.fill();
  const cap = 0.22;
  ctx.fillStyle = snow;
  ctx.beginPath();
  ctx.moveTo(x * w, top * h);
  ctx.lineTo((x + half * cap) * w, (top + (1 - top) * cap) * h);
  ctx.lineTo((x + half * cap * 0.3) * w, (top + (1 - top) * cap * 0.8) * h);
  ctx.lineTo(x * w, (top + (1 - top) * cap) * h);
  ctx.lineTo((x - half * cap * 0.4) * w, (top + (1 - top) * cap * 0.85) * h);
  ctx.lineTo((x - half * cap) * w, (top + (1 - top) * cap) * h);
  ctx.closePath();
  ctx.fill();
}

function paintMountain(p: Paint) {
  gradient(p, [
    [0, "#a9d6ff"],
    [1, "#eef7ff"],
  ]);
  cloud(p, 0.15, 0.1, 0.04);
  peak(p, 0.3, 0.16, 0.42, "#c3cbe0", "#ffffff");
  peak(p, 0.75, 0.24, 0.38, "#b4bfd8", "#ffffff");
  peak(p, 0.52, 0.34, 0.3, "#a9b6d0", "#f4f7ff");
  hills(p, 0.74, 0.02, 1.4, "#c4e2b0", 1);
  const random = seeded(31);
  for (let index = 0; index < 12; index += 1) pine(p, index / 11 + (random() - 0.5) * 0.04, 0.84, 0.12 + random() * 0.05, "#9bc98c");
  hills(p, 0.86, 0.015, 2, "#b3d99c", 2.2);
}

function paintDesert(p: Paint) {
  gradient(p, [
    [0, "#ffd9a0"],
    [0.55, "#fff0cf"],
    [1, "#fbe3b4"],
  ]);
  sun(p, 0.76, 0.14, 0.08, "#fff1b8", "rgba(255,225,150,0.75)");
  hills(p, 0.58, 0.025, 1.4, "#f4d39a", 0.9);
  hills(p, 0.7, 0.03, 1.8, "#efc685", 2.6);
  hills(p, 0.82, 0.025, 2.4, "#f3d29c", 4.1);
  const { ctx, w, h, u } = p;
  ctx.fillStyle = "#cdb08e";
  for (const [x, y, size] of [
    [0.12, 0.88, 0.05],
    [0.86, 0.92, 0.04],
    [0.5, 0.95, 0.03],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x * w, y * h, size * u * 1.4, size * u * 0.8, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillStyle = "#a9cf8e";
  for (const x of [0.28, 0.7]) {
    const base = 0.76 * h;
    const size = u * 0.06;
    ctx.fillRect(x * w - size * 0.18, base - size * 1.6, size * 0.36, size * 1.6);
    ctx.fillRect(x * w - size * 0.62, base - size * 1.1, size * 0.26, size * 0.6);
    ctx.fillRect(x * w - size * 0.62, base - size * 0.6, size * 0.6, size * 0.22);
    ctx.fillRect(x * w + size * 0.36, base - size * 1.3, size * 0.26, size * 0.6);
    ctx.fillRect(x * w + size * 0.02, base - size * 0.8, size * 0.6, size * 0.22);
  }
}

function paintCity(p: Paint) {
  gradient(p, [
    [0, "#ffd6c2"],
    [0.5, "#ffeedd"],
    [1, "#e9ecf5"],
  ]);
  const { ctx, w, h, u } = p;
  const random = seeded(41);
  for (const [layer, colour, window] of [
    [0, "#d9d3e6", "#f4effa"],
    [1, "#c4c9de", "#fff6c8"],
  ] as const) {
    let x = -0.02;
    while (x < 1) {
      const width = 0.07 + random() * 0.08;
      const top = (layer === 0 ? 0.32 : 0.46) + random() * 0.16;
      const bottom = layer === 0 ? 0.8 : 0.86;
      ctx.fillStyle = colour;
      ctx.fillRect(x * w, top * h, width * w, (bottom - top) * h);
      ctx.fillStyle = window;
      const size = u * 0.012;
      for (let wy = top * h + size * 1.5; wy < bottom * h - size * 2; wy += size * 2.4) {
        for (let wx = x * w + size; wx < (x + width) * w - size * 1.5; wx += size * 2) {
          if (random() < 0.7) ctx.fillRect(wx, wy, size, size * 1.2);
        }
      }
      x += width + 0.01;
    }
  }
  gradient(p, [
    [0, "#cfd3dd"],
    [1, "#dfe2ea"],
  ], 0.86, 1);
  ctx.fillStyle = "#ffffff";
  for (let x = 0.02; x < 1; x += 0.12) ctx.fillRect(x * w, 0.925 * h, 0.06 * w, u * 0.006);
}

function paintStars(p: Paint) {
  gradient(p, [
    [0, "#3b4a8c"],
    [0.6, "#6b78b8"],
    [1, "#b9a8d8"],
  ]);
  const { ctx, w, h, u } = p;
  const random = seeded(53);
  for (let index = 0; index < 140; index += 1) {
    const x = random() * w;
    const y = random() * h * 0.85;
    const r = u * (0.0025 + random() * 0.004);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  sun(p, 0.8, 0.12, 0.05, "#fff8dc", "rgba(255,248,220,0.45)");
  ctx.fillStyle = "#6b78b8";
  ctx.beginPath();
  ctx.arc(0.8 * w + u * 0.02, 0.12 * h - u * 0.012, u * 0.045, 0, Math.PI * 2);
  ctx.fill();
  hills(p, 0.86, 0.02, 1.6, "#8a87c4", 0.7);
}

/** The original background of the group photo. */
function paintSky(p: Paint) {
  gradient(p, [
    [0, "#9fd3ff"],
    [0.55, "#e6f4ff"],
    [1, "#fff1c9"],
  ]);
}

const PAINTERS: Record<Scene, (p: Paint) => void> = {
  plain: (p) => {
    p.ctx.fillStyle = "#ffffff";
    p.ctx.fillRect(0, 0, p.w, p.h);
  },
  sky: paintSky,
  grassland: paintGrassland,
  forest: paintForest,
  lake: paintLake,
  sea: paintSea,
  cave: paintCave,
  mountain: paintMountain,
  desert: paintDesert,
  city: paintCity,
  stars: paintStars,
};

/** Fills the whole canvas with the scene. */
export function paintScene(ctx: CanvasRenderingContext2D, scene: Scene, width: number, height: number) {
  ctx.save();
  PAINTERS[scene]({ ctx, w: width, h: height, u: Math.min(width, height) });
  ctx.restore();
}
