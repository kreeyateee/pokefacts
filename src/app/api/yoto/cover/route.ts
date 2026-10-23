import { getAlternateForm } from "@/lib/catalogue-db";
import { ensureArtwork, isPng } from "@/lib/artwork";
import { MAX_COVER_BYTES } from "@/lib/playlist-cover";
import { safeHttpStatus, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";
import { yotoCoverImageL } from "@/lib/yoto-playlist";

function coverId(raw: string): number | null {
  if (!/^[1-9]\d{0,4}$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 20_000) return null;
  return id;
}

/** A cover drawn in the page (the card's sticker front) is a card-sized PNG, well under this. */
const MAX_DRAWN_COVER_BYTES = MAX_COVER_BYTES;

/** A cover the page drew, sent as the request body, or null when the request is not one. */
async function drawnCover(request: Request): Promise<Buffer | null | "bad"> {
  if (!(request.headers.get("content-type") ?? "").startsWith("image/png")) return null;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_DRAWN_COVER_BYTES) return "bad";
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_DRAWN_COVER_BYTES || !isPng(bytes)) return "bad";
  return bytes;
}

/**
 * POST with a PNG body uploads the cover the page drew. POST ?id=<number> uploads that Pokémon's
 * artwork as it is, for pages from before covers carried the playlist's name.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before uploading cover art.", 401);

  const drawn = await drawnCover(request);
  if (drawn === "bad") return jsonError("That cover picture is not a PNG Pokefacts drew.");
  let bytes: Buffer;
  let filename: string;
  if (drawn) {
    bytes = drawn;
    filename = "pokefacts-cover";
  } else {
    const raw = new URL(request.url).searchParams.get("id") ?? "";
    const id = coverId(raw);
    const form = id && id > 1025 ? getAlternateForm(id) : null;
    if (!id) return jsonError("That picture is not cover art.");
    const artworkId = form?.formId ?? id;
    try {
      bytes = await ensureArtwork(artworkId);
      if (!isPng(bytes)) throw new Error("not png");
    } catch {
      return jsonError("That cover picture could not be loaded.");
    }
    filename = `pokefacts-cover-${artworkId}`;
  }

  const url = new URL("https://api.yotoplay.com/media/coverImage/user/me/upload");
  url.searchParams.set("autoconvert", "true");
  url.searchParams.set("coverType", "default");
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
