import { readFile } from "node:fs/promises";
import path from "node:path";

import { bearerToken, jsonError } from "@/lib/yoto-proxy";

const PIXEL_IDS = new Set(["1", "4", "7", "25", "39", "94", "133", "143", "321"]);

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before uploading a picture.", 401);

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!PIXEL_IDS.has(id)) return jsonError("That picture is not one of the Champdex pixels.");

  const file = path.join(process.cwd(), "public", "pixels", `${id}.png`);
  const bytes = await readFile(file);
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
    body: bytes,
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
