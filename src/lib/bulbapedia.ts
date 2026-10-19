import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BiologyBlock, BiologyView } from "@/lib/catalogue-types";

export type { BiologyBlock, BiologyView };

/**
 * On-screen Biology text from Bulbapedia. Spoken Yoto scripts do not use this.
 *
 * Cache file data/bulbapedia/biology.json, keyed by national dex id:
 * { name, page, url, status: "ready" | "missing", blocks, fetchedAt }
 */
export const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

export const BULBAPEDIA_USER_AGENT = "Champdex/0.1 (private household; mjlane90@gmail.com)";

const CACHE_FILE = path.join(process.cwd(), "data", "bulbapedia", "biology.json");

/** Bump when the HTML reader changes, so an older empty result is fetched again. */
const CACHE_REVISION = 2;

type CacheRow = {
  name: string;
  page: string;
  url: string;
  status: "ready" | "missing";
  blocks: BiologyBlock[];
  fetchedAt: string;
  revision: number;
};

type WikiSection = {
  toclevel?: number;
  line?: string;
  anchor?: string;
  index?: string | number;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  times: "\u00d7",
  eacute: "\u00e9",
  Eacute: "\u00c9",
  egrave: "\u00e8",
  aacute: "\u00e1",
  uacute: "\u00fa",
  ntilde: "\u00f1",
  copy: "\u00a9",
  bull: "\u2022",
  middot: "\u00b7",
};

/** Bulbapedia page title, with spaces as underscores. */
export function wikiPageTitle(name: string): string {
  const page = name
    .trim()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, "_");
  return `${page}_(Pok\u00e9mon)`;
}

export function bulbapediaArticleUrl(name: string): string {
  return `https://bulbapedia.bulbagarden.net/wiki/${encodeURI(wikiPageTitle(name))}`;
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function decodeEntities(text: string): string {
  let value = text;
  for (let pass = 0; pass < 2; pass += 1) {
    value = value
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, num: string) => safeChar(Number(num)))
      .replace(/&([a-z]+);/gi, (all, name: string) => NAMED_ENTITIES[name] ?? all);
  }
  return value;
}

function plain(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\[(?:\d+|note \d+|citation needed)\]/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function classNames(openTag: string): string[] {
  const match = openTag.match(/\bclass\s*=\s*["']([^"']*)["']/i);
  return match?.[1]?.split(/\s+/).filter(Boolean) ?? [];
}

function shouldSkip(openTag: string, name: string): boolean {
  const classes = classNames(openTag);
  if (name === "table" || name === "script" || name === "style" || name === "figure") return true;
  if (name === "sup" && (classes.includes("reference") || classes.includes("noexcerpt"))) return true;
  if (name === "span" && classes.includes("mw-editsection")) return true;
  if (name === "ol" && classes.includes("references")) return true;
  if ((name === "div" || name === "nav") && (classes.includes("toc") || /\bid\s*=\s*["']toc["']/i.test(openTag))) {
    return true;
  }
  if (
    name === "div" &&
    (classes.includes("mw-references-wrap") ||
      classes.includes("navbox") ||
      classes.includes("noprint"))
  ) {
    return true;
  }
  return classes.includes("mw-empty-elt");
}

const VOID_TAGS = new Set(["br", "img", "hr", "wbr", "source", "track", "meta", "link"]);

/** Drop wiki chrome. Nested tables and edit links go with their wrappers. */
function removeRegions(html: string): string {
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b[^>]*\/?>/g;
  let out = "";
  let last = 0;
  let skipDepth = 0;
  let skipTag = "";
  for (const match of html.matchAll(re)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (skipDepth === 0) out += html.slice(last, index);
    last = index + token.length;
    if (token.startsWith("<!--")) continue;
    const name = (match[1] ?? "").toLowerCase();
    const closing = token.startsWith("</");
    const selfClosing = /\/>$/.test(token) || VOID_TAGS.has(name);
    if (skipDepth === 0) {
      if (!closing && !selfClosing && shouldSkip(token, name)) {
        skipDepth = 1;
        skipTag = name;
      } else {
        out += token;
      }
      continue;
    }
    if (selfClosing) continue;
    if (!closing && name === skipTag) skipDepth += 1;
    else if (closing && name === skipTag) {
      skipDepth -= 1;
      if (skipDepth === 0) skipTag = "";
    }
  }
  if (skipDepth === 0) out += html.slice(last);
  return out;
}

function isBiologyHeading(text: string): boolean {
  return /^biology$/i.test(text);
}

/** Lead HTML from the Biology section, including its subsections, as readable blocks. */
export function biologyBlocks(html: string): BiologyBlock[] {
  const cleaned = removeRegions(html);
  const blocks: BiologyBlock[] = [];
  const re = /<(h[2-4]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let list: string[] | null = null;
  const flushList = () => {
    if (!list || list.length === 0) {
      list = null;
      return;
    }
    blocks.push({ kind: "list", items: list });
    list = null;
  };

  for (const match of cleaned.matchAll(re)) {
    const tag = match[1]?.toLowerCase() ?? "";
    const text = plain(match[2] ?? "");
    if (!text) continue;
    if (tag === "h2") {
      flushList();
      // A contents box uses its own h2 before Biology. That is not the next article section.
      if (isBiologyHeading(text) || /^contents$/i.test(text)) continue;
      break;
    }
    if (tag === "li") {
      list ??= [];
      list.push(text);
      continue;
    }
    flushList();
    if (tag === "h3" || tag === "h4") {
      if (isBiologyHeading(text) || /^references$/i.test(text)) continue;
      blocks.push({ kind: "heading", level: tag === "h3" ? 3 : 4, text });
      continue;
    }
    if (/refer to game data/i.test(text)) continue;
    blocks.push({ kind: "paragraph", text });
  }
  flushList();

  const kept: BiologyBlock[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block?.kind === "heading" && (!blocks[index + 1] || blocks[index + 1]?.kind === "heading")) {
      continue;
    }
    if (block) kept.push(block);
  }
  return kept;
}

function plainLine(line: string): string {
  return plain(line);
}

function biologySection(sections: WikiSection[]): WikiSection | undefined {
  const matches = sections.filter((section) => {
    const anchor = (section.anchor ?? "").replace(/_/g, " ").trim();
    const line = plainLine(section.line ?? "");
    return isBiologyHeading(anchor) || isBiologyHeading(line);
  });
  matches.sort((a, b) => (a.toclevel ?? 9) - (b.toclevel ?? 9));
  return matches[0];
}

type WikiError = Error & { code?: string };

function wikiError(code: string, message: string): WikiError {
  const error = new Error(message) as WikiError;
  error.code = code;
  return error;
}

async function readCache(file: string): Promise<Record<string, CacheRow>> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, CacheRow>;
  } catch {
    return {};
  }
}

function usableRow(row: unknown, name: string): CacheRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as CacheRow;
  if (candidate.revision !== CACHE_REVISION) return null;
  if (candidate.name !== name) return null;
  if (candidate.status !== "ready" && candidate.status !== "missing") return null;
  if (!Array.isArray(candidate.blocks)) return null;
  return candidate;
}

let cacheWrites = Promise.resolve();

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const run = cacheWrites.then(task, task);
  cacheWrites = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function storeRow(file: string, id: number, row: CacheRow): Promise<void> {
  await enqueueWrite(async () => {
    const all = await readCache(file);
    all[String(id)] = row;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(all, null, 2)}\n`);
  });
}

function viewFromRow(row: CacheRow): BiologyView {
  return { status: row.status, url: row.url, blocks: row.blocks };
}

type LoadOptions = {
  fetchImpl?: typeof fetch;
  cacheFile?: string;
  sleep?: (ms: number) => Promise<void>;
};

async function wikiRequest(
  params: Record<string, string>,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  attempt = 0,
): Promise<unknown> {
  const url = new URL(BULBAPEDIA_API);
  url.searchParams.set("action", "parse");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("maxlag", "5");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": BULBAPEDIA_USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; info?: string; lag?: number };
  } | null;
  const code = payload?.error?.code;
  if (code === "maxlag" && attempt < 1) {
    const lag = Math.min(10, Math.max(1, Number(payload?.error?.lag) || 5));
    await sleep(lag * 1000);
    return wikiRequest(params, fetchImpl, sleep, attempt + 1);
  }
  if (!response.ok || payload?.error) {
    throw wikiError(code ?? `http-${response.status}`, payload?.error?.info || "Bulbapedia did not answer.");
  }
  return payload;
}

function sectionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const text = (payload as { parse?: { text?: unknown } }).parse?.text;
  if (typeof text === "string") return text;
  if (text && typeof text === "object" && typeof (text as { "*"?: unknown })["*"] === "string") {
    return (text as { "*": string })["*"];
  }
  return "";
}

function sectionsOf(payload: unknown): WikiSection[] {
  if (!payload || typeof payload !== "object") return [];
  const sections = (payload as { parse?: { sections?: unknown } }).parse?.sections;
  return Array.isArray(sections) ? (sections as WikiSection[]) : [];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Biology for one species. A cache hit does not call Bulbapedia.
 * A missing page or a page with no Biology heading is cached as missing.
 * A network or maxlag failure is not cached, so the next view can try again.
 */
export async function loadBiology(name: string, id: number, options: LoadOptions = {}): Promise<BiologyView> {
  const cacheFile = options.cacheFile ?? CACHE_FILE;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const cached = usableRow((await readCache(cacheFile))[String(id)], name);
  if (cached) return viewFromRow(cached);

  const page = wikiPageTitle(name);
  const url = bulbapediaArticleUrl(name);
  let listed: unknown;
  try {
    listed = await wikiRequest({ page, prop: "sections" }, fetchImpl, sleep);
  } catch (error) {
    const code = error instanceof Error ? (error as WikiError).code : "";
    if (code === "missingtitle") {
      const row: CacheRow = {
        name,
        page,
        url,
        status: "missing",
        blocks: [],
        fetchedAt: new Date().toISOString(),
        revision: CACHE_REVISION,
      };
      await storeRow(cacheFile, id, row).catch(() => undefined);
      return viewFromRow(row);
    }
    throw error;
  }

  const section = biologySection(sectionsOf(listed));
  if (!section || section.index === undefined || section.index === null || String(section.index) === "") {
    const row: CacheRow = {
      name,
      page,
      url,
      status: "missing",
      blocks: [],
      fetchedAt: new Date().toISOString(),
      revision: CACHE_REVISION,
    };
    await storeRow(cacheFile, id, row).catch(() => undefined);
    return viewFromRow(row);
  }

  const parsed = await wikiRequest(
    { page, prop: "text", section: String(section.index) },
    fetchImpl,
    sleep,
  );
  const blocks = biologyBlocks(sectionText(parsed));
  const row: CacheRow = {
    name,
    page,
    url,
    status: blocks.length > 0 ? "ready" : "missing",
    blocks,
    fetchedAt: new Date().toISOString(),
    revision: CACHE_REVISION,
  };
  await storeRow(cacheFile, id, row).catch(() => undefined);
  return viewFromRow(row);
}
