import { getAlternateForm } from "@/lib/catalogue-db";
import { ensureArtwork, isPng } from "@/lib/artwork";
import { safeHttpStatus, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { yotoCoverImageL } from "@/lib/yoto-playlist";

function coverId(raw: string): number | null {
  if (!/^[1-9]\d{0,4}$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 20_000) return null;
  return id;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before uploading cover art.", 401);

  const raw = new URL(request.url).searchParams.get("id") ?? "";
  const id = coverId(raw);
  const form = id && id > 1025 ? getAlternateForm(id) : null;
  if (!id) return jsonError("That picture is not cover art.");
  const artworkId = form?.formId ?? id;

  let bytes: Buffer;
  try {
    bytes = await ensureArtwork(artworkId);
    if (!isPng(bytes)) throw new Error("not png");
  } catch {
    return jsonError("That cover picture could not be loaded.");
  }

  const url = new URL("https://api.yotoplay.com/media/coverImage/user/me/upload");
  url.searchParams.set("autoconvert", "true");
  url.searchParams.set("coverType", "default");
  url.searchParams.set("filename", `pokefacts-cover-${artworkId}`);

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
  let payload: unknown = null;
  try {
    payload = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    payload = null;
  }
  const imageL = yotoCoverImageL(payload);
  if (!response.ok || !imageL) {
    return jsonError(yotoUpstreamFailure(text).message, safeHttpStatus(response.status));
  }
  return Response.json({ imageL });
}
