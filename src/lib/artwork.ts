import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ARTWORK_CACHE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "artwork");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const inflight = new Map<string, Promise<Buffer>>();

export function isPng(bytes: Buffer): boolean {
  return bytes.length >= PNG_MAGIC.length && bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

function artworkUrls(id: number): string[] {
  return [
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`,
  ];
}

/** Official artwork, saved after the first download. Home art is the fallback. */
export async function ensureArtwork(
  id: number,
  fetchImpl: typeof fetch = fetch,
  cacheDir: string = ARTWORK_CACHE,
): Promise<Buffer> {
  if (!Number.isInteger(id) || id < 1 || id > 20_000) {
    throw new Error(`That picture is not a Pokédex or form image (${id}).`);
  }
  const memoryKey = `${cacheDir}\n${id}`;
  const pending = inflight.get(memoryKey);
  if (pending) return pending;
  const job = loadArtwork(id, fetchImpl, cacheDir);
  inflight.set(memoryKey, job);
  try {
    return await job;
  } finally {
    inflight.delete(memoryKey);
  }
}

async function loadArtwork(id: number, fetchImpl: typeof fetch, cacheDir: string): Promise<Buffer> {
  await mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `${id}.png`);
  try {
    const cached = await readFile(file);
    if (isPng(cached)) return cached;
  } catch {
    // Missing cache is downloaded below.
  }
  let lastStatus = 0;
  for (const url of artworkUrls(id)) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    lastStatus = response.status;
    if (!response.ok) continue;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isPng(bytes)) continue;
    await writeFile(file, bytes);
    return bytes;
  }
  throw new Error(`The picture for number ${id} could not be downloaded (HTTP ${lastStatus}).`);
}

export { artworkSrc } from "./page-artwork";
