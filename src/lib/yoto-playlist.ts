import { validYotoCardId } from "@/lib/yoto-error";

/** Opens this Make Your Own playlist in the Yoto app or on my.yotoplay.com. */
export function yotoPlaylistUrl(cardId: string | undefined): string | undefined {
  const id = validYotoCardId(cardId);
  return id ? `https://my.yotoplay.com/card/${id}` : undefined;
}

export function isYotoCoverUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/\S{8,1800}$/.test(value);
}

/** Yoto's cover upload may nest the CDN URL under coverImage or imageL. */
export function yotoCoverImageL(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const row = payload as {
    coverImage?: { mediaUrl?: unknown; imageL?: unknown; url?: unknown };
    imageL?: unknown;
    cover?: { imageL?: unknown };
  };
  const candidates = [
    row.coverImage?.mediaUrl,
    row.coverImage?.imageL,
    row.coverImage?.url,
    row.imageL,
    row.cover?.imageL,
  ];
  return candidates.find((value) => isYotoCoverUrl(value));
}
