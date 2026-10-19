import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { ffmpegCommand } from "@/lib/ffmpeg-bin";
import { safeHttpStatus, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";

function scalePixel(sprite: string, pixel: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      ["-y", "-loglevel", "error", "-i", sprite, "-vf", "scale=16:16:flags=neighbor,format=rgba", pixel],
      { timeout: 20_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

async function ensurePixel(file: string, id: string): Promise<void> {
  try {
    await access(file);
  } catch {
    const sprite = path.join(process.cwd(), "public", "sprites", `${id}.png`);
    await scalePixel(sprite, file);
  }
}

function paintShadow(pixel: string, shadow: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegCommand(),
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        pixel,
        "-vf",
        "format=rgba,geq=r='if(gt(alpha(X,Y),0),28,0)':g='if(gt(alpha(X,Y),0),28,0)':b='if(gt(alpha(X,Y),0),32,0)':a='alpha(X,Y)',format=rgba",
        shadow,
      ],
      { timeout: 20_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

async function ensureShadow(file: string, id: string): Promise<void> {
  try {
    await access(file);
  } catch {
    const pixel = path.join(process.cwd(), "public", "pixels", `${id}.png`);
    await ensurePixel(pixel, id);
    await paintShadow(pixel, file);
  }
}

function pixelFile(id: string, shadow: boolean): string | null {
  if (!/^[1-9]\d{0,3}$/.test(id)) return null;
  const number = Number(id);
  if (!Number.isInteger(number) || number < 1 || number > 1025) return null;
  return path.join(process.cwd(), "public", "pixels", shadow ? `${number}-shadow.png` : `${number}.png`);
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before uploading a picture.", 401);

  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  const shadow = params.get("shadow") === "1";
  const file = pixelFile(id, shadow);
  if (!file) return jsonError("That picture is not a national Pokédex icon.");

  let bytes: Buffer;
  try {
    if (shadow) await ensureShadow(file, id);
    else await ensurePixel(file, id);
    bytes = await readFile(file);
  } catch {
    return jsonError("That picture is not a national Pokédex icon.");
  }

  const url = new URL("https://api.yotoplay.com/media/displayIcons/user/me/upload");
  url.searchParams.set("autoConvert", "false");
  url.searchParams.set("filename", shadow ? `champdex-${id}-shadow` : `champdex-${id}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "image/png",
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload: { displayIcon?: { mediaId?: string } } | null = null;
  try {
    payload = text ? (JSON.parse(text) as { displayIcon?: { mediaId?: string } }) : null;
  } catch {
    payload = null;
  }
  const hash = payload?.displayIcon?.mediaId?.replace(/^yoto:#/, "") ?? "";
  const mediaId = /^[A-Za-z0-9_-]{43}$/.test(hash) ? hash : undefined;
  if (!response.ok || !mediaId) {
    return jsonError(yotoUpstreamFailure(text).message, safeHttpStatus(response.status));
  }
  return Response.json({ mediaId });
}
