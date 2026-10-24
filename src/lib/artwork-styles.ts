import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Other artwork for each Pokémon, from the same PokéAPI sprite collection as the official art, saved
 * on the server after the first download:
 * - shiny: the official artwork in its shiny colours
 * - dream: Dream World vector art, clean outlines that make the best colouring sheets (up to No. 649)
 * - battle: the animated Showdown battle sprite, for battles on the page
 */
export const ARTWORK_STYLES = ["shiny", "dream", "battle"] as const;
export type ArtworkStyle = (typeof ARTWORK_STYLES)[number];

export function isArtworkStyle(value: string): value is ArtworkStyle {
  return (ARTWORK_STYLES as readonly string[]).includes(value);
}

const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

type Format = "png" | "svg" | "gif";

const SOURCES: Record<ArtworkStyle, { format: Format; urls: (id: number) => string[] }> = {
  shiny: {
    format: "png",
    urls: (id) => [`${BASE}/other/official-artwork/shiny/${id}.png`, `${BASE}/other/home/shiny/${id}.png`],
  },
  dream: { format: "svg", urls: (id) => [`${BASE}/other/dream-world/${id}.svg`] },
  battle: {
    format: "gif",
    urls: (id) => [`${BASE}/other/showdown/${id}.gif`, `${BASE}/versions/generation-v/black-white/animated/${id}.gif`],
  },
};

export const CONTENT_TYPES: Record<Format, string> = { png: "image/png", svg: "image/svg+xml", gif: "image/gif" };

/** Dream World art only goes up to the end of the fifth generation. */
export const LAST_DREAM_WORLD = 649;

/** True when the bytes are the picture they claim to be. */
export function looksLike(format: Format, bytes: Buffer): boolean {
  if (format === "png") return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (format === "gif") return bytes.subarray(0, 4).toString("ascii") === "GIF8";
  const head = bytes.subarray(0, 512).toString("utf8").trimStart();
  return (head.startsWith("<?xml") || head.startsWith("<svg")) && head.includes("<svg") && bytes.length < 3_000_000;
}

const STYLE_CACHE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "artwork");
const inflight = new Map<string, Promise<{ bytes: Buffer; type: string }>>();

/** One Pokémon's picture in a style, downloaded once and kept. Throws when that style has none. */
export function ensureStyleArtwork(
  style: ArtworkStyle,
  id: number,
  fetchImpl: typeof fetch = fetch,
  cacheRoot: string = STYLE_CACHE,
): Promise<{ bytes: Buffer; type: string }> {
  if (!Number.isInteger(id) || id < 1 || id > 1025) return Promise.reject(new Error("That is not a national Pokédex number."));
  if (style === "dream" && id > LAST_DREAM_WORLD) return Promise.reject(new Error("Dream World art stops at number 649."));
  const key = `${cacheRoot}\n${style}\n${id}`;
  let job = inflight.get(key);
  if (!job) {
    job = load(style, id, fetchImpl, cacheRoot).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

async function load(style: ArtworkStyle, id: number, fetchImpl: typeof fetch, cacheRoot: string) {
  const { format, urls } = SOURCES[style];
  const type = CONTENT_TYPES[format];
  const dir = path.join(/* turbopackIgnore: true */ cacheRoot, style);
  const file = path.join(/* turbopackIgnore: true */ dir, `${id}.${format}`);
  try {
    const cached = await readFile(file);
    if (looksLike(format, cached)) return { bytes: cached, type };
  } catch {
    // Not saved yet: download it below.
  }
  let status = 0;
  for (const url of urls(id)) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    status = response.status;
    if (!response.ok) continue;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!looksLike(format, bytes)) continue;
    await mkdir(dir, { recursive: true });
    await writeFile(file, bytes);
    return { bytes, type };
  }
  throw new Error(`No ${style} picture for number ${id} (HTTP ${status}).`);
}
