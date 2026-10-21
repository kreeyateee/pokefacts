import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { bulbapediaParse, wikiSectionHtml, wikiSections, type WikiSection } from "@/lib/bulbapedia";
import { decodeHtml } from "@/lib/music";

const LYRICS_CACHE = path.join(process.cwd(), "data", "music-lyrics");

/** The Bulbapedia heading that holds the song words. */
export function lyricsSection(sections: readonly WikiSection[]): WikiSection | undefined {
  return sections.find((section) => (section.line ?? "").replace(/\s+/g, " ").trim().toLowerCase() === "lyrics");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Plain lyrics, including every verse and language heading under that section. */
export function lyricsFromHtml(html: string): string {
  let value = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, "")
    .replace(/<span class="mw-editsection"[\s\S]*?<\/span>/gi, "");
  value = value.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, inner: string) => `\n${stripTags(inner)}\n`);
  value = value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|blockquote)>/gi, "\n");
  value = decodeHtml(stripTags(value));
  const lines = value.split(/\n/).map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim());
  const kept: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (kept.length === 0 || kept[kept.length - 1] === "") continue;
    }
    kept.push(line);
  }
  while (kept[kept.length - 1] === "") kept.pop();
  return kept.join("\n");
}

function cacheFile(cacheDir: string, page: string): string {
  return path.join(cacheDir, `${encodeURIComponent(page)}.json`);
}

/** Lyrics for one song page. A saved copy is reused. A network failure is not saved. */
export async function loadSongLyrics(
  page: string,
  options: { fetchImpl?: typeof fetch; cacheDir?: string; sleep?: (ms: number) => Promise<void> } = {},
): Promise<string> {
  const cacheDir = options.cacheDir ?? LYRICS_CACHE;
  const file = cacheFile(cacheDir, page);
  try {
    const cached = JSON.parse(await readFile(file, "utf8")) as { lyrics?: unknown };
    if (typeof cached.lyrics === "string") return cached.lyrics;
  } catch {
    // A missing cache is fetched below.
  }
  const ask = {
    fetchImpl: options.fetchImpl,
    sleep: options.sleep ?? (async () => {}),
  };
  const listed = await bulbapediaParse({ page, prop: "sections" }, ask);
  const section = lyricsSection(wikiSections(listed));
  const index = section?.index;
  if (index == null || String(index).trim() === "") {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify({ lyrics: "" }));
    return "";
  }
  const parsed = await bulbapediaParse({ page, prop: "text", section: String(index) }, ask);
  const lyrics = lyricsFromHtml(wikiSectionHtml(parsed));
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, JSON.stringify({ lyrics }));
  return lyrics;
}
