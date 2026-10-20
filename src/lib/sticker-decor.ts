import { DECORATION_KEYS } from "@/lib/sticker-layout";

export type DecorationArt = {
  key: (typeof DECORATION_KEYS)[number];
  name: string;
  canvas: HTMLCanvasElement;
};

const SIZE = 192;

type Ball = { top: string; bottom: string; band: string; name: string };
type Berry = { body: string; name: string };

const BALLS: Record<string, Ball> = {
  "deco:poke": { top: "#e10600", bottom: "#fffdf6", band: "#16324f", name: "Poké Ball" },
  "deco:great": { top: "#e10600", bottom: "#fffdf6", band: "#2a75bb", name: "Great Ball" },
  "deco:ultra": { top: "#16324f", bottom: "#ffcb05", band: "#16324f", name: "Ultra Ball" },
};

const BERRIES: Record<string, Berry> = {
  "deco:cheri": { body: "#e10600", name: "Red berry" },
  "deco:pecha": { body: "#f95587", name: "Pink berry" },
  "deco:oran": { body: "#2a75bb", name: "Blue berry" },
  "deco:sitrus": { body: "#ffcb05", name: "Yellow berry" },
  "deco:rawst": { body: "#3e9b4a", name: "Green berry" },
  "deco:pamtre": { body: "#7b3ff0", name: "Purple berry" },
};

function canvas(): HTMLCanvasElement {
  const surface = document.createElement("canvas");
  surface.width = SIZE;
  surface.height = SIZE;
  return surface;
}

function drawBall(ball: Ball): HTMLCanvasElement {
  const surface = canvas();
  const ctx = surface.getContext("2d");
  if (!ctx) return surface;
  const c = SIZE / 2;
  const r = SIZE * 0.42;
  ctx.beginPath();
  ctx.arc(c, c, r, Math.PI, 0);
  ctx.fillStyle = ball.top;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI);
  ctx.fillStyle = ball.bottom;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.lineWidth = SIZE * 0.045;
  ctx.strokeStyle = "#16324f";
  ctx.stroke();
  ctx.fillStyle = ball.band;
  ctx.fillRect(c - r, c - SIZE * 0.045, r * 2, SIZE * 0.09);
  ctx.beginPath();
  ctx.arc(c, c, SIZE * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf6";
  ctx.fill();
  ctx.lineWidth = SIZE * 0.035;
  ctx.strokeStyle = "#16324f";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, SIZE * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf6";
  ctx.fill();
  ctx.stroke();
  return surface;
}

function drawBerry(berry: Berry): HTMLCanvasElement {
  const surface = canvas();
  const ctx = surface.getContext("2d");
  if (!ctx) return surface;
  const c = SIZE / 2;
  ctx.beginPath();
  ctx.ellipse(c, SIZE * 0.58, SIZE * 0.3, SIZE * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = berry.body;
  ctx.fill();
  ctx.lineWidth = SIZE * 0.04;
  ctx.strokeStyle = "#16324f";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(c - SIZE * 0.08, SIZE * 0.48, SIZE * 0.08, SIZE * 0.05, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c + SIZE * 0.02, SIZE * 0.28, SIZE * 0.16, SIZE * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#3e9b4a";
  ctx.fill();
  ctx.strokeStyle = "#16324f";
  ctx.lineWidth = SIZE * 0.03;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c, SIZE * 0.34);
  ctx.lineTo(c, SIZE * 0.18);
  ctx.stroke();
  return surface;
}

export function decorationArt(): DecorationArt[] {
  return DECORATION_KEYS.map((key) => {
    const ball = BALLS[key];
    if (ball) return { key, name: ball.name, canvas: drawBall(ball) };
    const berry = BERRIES[key];
    return { key, name: berry?.name ?? "Berry", canvas: drawBerry(berry ?? { body: "#e10600", name: "Berry" }) };
  });
}
