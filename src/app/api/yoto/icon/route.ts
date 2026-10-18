import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { bearerToken, jsonError } from "@/lib/yoto-proxy";

function scalePixel(sprite: string, pixel: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
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

function pixelFile(id: string): string | null {
  if (!/^[1-9]\d{0,3}$/.test(id)) return null;
  const number = Number(id);
  if (!Number.isInteger(number) || number < 1 || number > 1025) return null;
  return path.join(process.cwd(), "public", "pixels", `${number}.png`);
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before uploading a picture.", 401);

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const file = pixelFile(id);
  if (!file) return jsonError("That picture is not a national Pokédex icon.");

  let bytes: Buffer;
  try {
    await ensurePixel(file, id);
    bytes = await readFile(file);
  } catch {
    return jsonError("That picture is not a national Pokédex icon.");
  }

  const url = new URL("https://api.yotoplay.com/media/displayIcons/user/me/upload");
  url.searchParams.set("autoConvert", "false");
  url.searchParams.set("filename", `champdex-${id}`);

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
  const payload = (await response.json().catch(() => null)) as {
    displayIcon?: { mediaId?: string };
    error?: string;
    message?: string;
  } | null;
  const mediaId = payload?.displayIcon?.mediaId;
  if (!response.ok || !mediaId) {
    return jsonError(payload?.message || payload?.error || "Yoto did not take that 16×16 picture.", response.status || 502);
  }
  return Response.json({ mediaId });
}
