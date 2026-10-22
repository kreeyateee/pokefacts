import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { getAlternateForm } from "@/lib/catalogue-db";
import { ensureFormPixel } from "@/lib/form-pixel";
import { paintColourPixel, paintShadowPixel } from "@/lib/pixel-scale";
import { safeHttpStatus, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";

async function ensurePixel(file: string, id: string): Promise<void> {
  try {
    await access(file);
  } catch {
    const sprite = path.join(process.cwd(), "public", "sprites", `${id}.png`);
    await paintColourPixel(sprite, file);
  }
}

async function ensureShadow(file: string, id: string): Promise<void> {
  try {
    await access(file);
  } catch {
    const sprite = path.join(process.cwd(), "public", "sprites", `${id}.png`);
    await paintShadowPixel(sprite, file);
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
  const form = file ? null : getAlternateForm(Number(id));
  if (!file && !form) return jsonError("That picture is not a national Pokédex icon.");
  if (form && shadow) return jsonError("That picture is not a national Pokédex icon.");

  let bytes: Buffer;
  try {
    if (form) bytes = await ensureFormPixel(form.formId);
    else if (file && shadow) {
      await ensureShadow(file, id);
      bytes = await readFile(file);
    } else if (file) {
      await ensurePixel(file, id);
      bytes = await readFile(file);
    } else {
      return jsonError("That picture is not a national Pokédex icon.");
    }
  } catch {
    return jsonError("That picture is not a national Pokédex icon.");
  }

  const url = new URL("https://api.yotoplay.com/media/displayIcons/user/me/upload");
  url.searchParams.set("autoConvert", "false");
  const filename = form
    ? `pokefacts-form-${form.formId}`
    : shadow
      ? `pokefacts-${id}-shadow`
      : `pokefacts-${id}`;
  url.searchParams.set("filename", filename);

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
