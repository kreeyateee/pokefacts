import path from "node:path";

import type { BiologyBlock, BiologyView } from "@/lib/catalogue-types";
import { readJsonObject, updateJsonObject } from "@/lib/json-cache";
import { spokenDexLine, spokenFact, WIKI_DEX_NOTE } from "@/lib/spoken-wiki";

export type { BiologyBlock, BiologyView };

/**
 * Biology text from Bulbapedia, cached in data/bulbapedia/biology.json.
 * The catalogue shows every block. Spoken facts use spokenWiki on these blocks,
 * which keeps the name and the first two lead paragraphs.
 */
export const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

export const BULBAPEDIA_USER_AGENT = "Pokefacts/0.1 (+https://pokefacts.online)";

const CACHE_FILE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "bulbapedia", "biology.json");

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
  /**
   * True only after a finished read found no Biology prose.
   * An aborted body used to be stored as missing without this flag. Those rows are fetched again.
   */
  settled?: boolean;
};

/** One Bulbapedia read. A hung socket is aborted here so the request cannot wait forever. */
const WIKI_TIMEOUT_MS = 20_000;

/** Timed-out reads are tried again this many times, including the first attempt. */
export const WIKI_TIMEOUT_TRIES = 3;

/**
 * Random gap before each Bulbapedia read.
 * A burst of species waits out the previous request, then sleeps in this range.
 * Tune these two numbers. Cache hits do not sleep.
 */
export const BULBAPEDIA_DELAY_MIN_MS = 250;
export const BULBAPEDIA_DELAY_MAX_MS = 1200;

/** One pause in BULBAPEDIA_DELAY_MIN_MS…BULBAPEDIA_DELAY_MAX_MS. `random` returns 0…1. */
export function bulbapediaDelayMs(random: () => number = Math.random): number {
  const roll = random();
  const unit = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0;
  return BULBAPEDIA_DELAY_MIN_MS + Math.round(unit * (BULBAPEDIA_DELAY_MAX_MS - BULBAPEDIA_DELAY_MIN_MS));
}

let bulbapediaTail: Promise<void> = Promise.resolve();

/**
 * One Bulbapedia read at a time, with a random gap after the previous read finishes.
 * Call this only on the network path. A no-op `sleep` skips the wait in tests.
 */
async function paceBulbapedia<T>(sleep: (ms: number) => Promise<void>, task: () => Promise<T>): Promise<T> {
  const previous = bulbapediaTail;
  let release: () => void = () => undefined;
  bulbapediaTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    await sleep(bulbapediaDelayMs());
    return await task();
  } finally {
    release();
  }
}

export type WikiSection = {
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
  return (await readJsonObject(file)) as Record<string, CacheRow>;
}

function blockText(block: BiologyBlock): string {
  if (block.kind === "list") return block.items.join(" ");
  return block.text;
}

function usableRow(row: unknown, name: string): CacheRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as CacheRow;
  if (candidate.revision !== CACHE_REVISION) return null;
  if (candidate.name !== name) return null;
  if (candidate.status !== "ready" && candidate.status !== "missing") return null;
  if (!Array.isArray(candidate.blocks)) return null;
  // A timeout used to be saved as missing. Only a finished empty read may stay cached.
  if (candidate.status === "missing" && candidate.settled !== true) return null;
  return candidate;
}

/** Prose already on disk, including an older revision, for when the live read fails. */
function proseRow(row: unknown, name: string): CacheRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as CacheRow;
  if (candidate.name !== name) return null;
  if (candidate.status !== "ready") return null;
  if (!Array.isArray(candidate.blocks)) return null;
  if (!candidate.blocks.some((block) => blockText(block).trim())) return null;
  return candidate;
}

async function storeRow(file: string, id: number, row: CacheRow): Promise<void> {
  await updateJsonObject(file, String(id), row);
}

function viewFromRow(row: CacheRow): BiologyView {
  return { status: row.status, url: row.url, blocks: row.blocks };
}

type LoadOptions = {
  fetchImpl?: typeof fetch;
  cacheFile?: string;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

type WikiPayload = { error?: { code?: string; info?: string; lag?: number } } | null;

function isTimedOut(error: unknown): boolean {
  if (!error || (typeof error !== "object" && typeof error !== "string")) return false;
  if (typeof error === "string") return /abort|timeout/i.test(error);
  const named = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof named.name === "string" ? named.name : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const code = named.code;
  if (code === "timeout" || code === "ABORT_ERR" || code === "ETIMEDOUT" || code === 20) return true;
  const message = typeof named.message === "string" ? named.message : "";
  return /abort|timeout/i.test(message);
}

function timedOutError(): WikiError {
  return wikiError("timeout", "Bulbapedia timed out.");
}

/**
 * Read one API response. A hang is raced against the timeout, including a fetch
 * that ignores the abort signal. An aborted body is a timeout, not an empty page.
 */
async function readWiki(
  url: URL,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  let settled = false;
  let rejectTimeout: ((error: Error) => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    if (settled) return;
    controller.abort();
    rejectTimeout?.(timedOutError());
  }, timeoutMs);
  const request = fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": BULBAPEDIA_USER_AGENT,
    },
    cache: "no-store",
    signal: controller.signal,
  }).then(
    async (response) => {
      try {
        const payload = await response.json();
        return { response, payload };
      } catch (error) {
        if (isTimedOut(error) || controller.signal.aborted) throw timedOutError();
        return { response, payload: null };
      }
    },
    (error: unknown) => {
      if (isTimedOut(error) || controller.signal.aborted) throw timedOutError();
      throw error;
    },
  );
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (isTimedOut(error) || controller.signal.aborted) throw timedOutError();
    throw error;
  } finally {
    settled = true;
    clearTimeout(timer);
    void request.catch(() => undefined);
  }
}

async function wikiRequest(
  params: Record<string, string>,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  timeoutMs: number,
  attempt = 0,
  timeouts = 0,
): Promise<unknown> {
  const url = new URL(BULBAPEDIA_API);
  url.searchParams.set("action", "parse");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("maxlag", "5");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  let payload: WikiPayload;
  try {
    const read = await paceBulbapedia(sleep, () => readWiki(url, fetchImpl, timeoutMs));
    response = read.response;
    payload = (read.payload ?? null) as WikiPayload;
  } catch (error) {
    if (wikiFailureCode(error) === "timeout" && timeouts + 1 < WIKI_TIMEOUT_TRIES) {
      await sleep(200);
      return wikiRequest(params, fetchImpl, sleep, timeoutMs, attempt, timeouts + 1);
    }
    throw error;
  }
  const code = payload?.error?.code;
  if (code === "maxlag" && attempt < 1) {
    const lag = Math.min(10, Math.max(1, Number(payload?.error?.lag) || 5));
    await sleep(lag * 1000);
    return wikiRequest(params, fetchImpl, sleep, timeoutMs, attempt + 1, timeouts);
  }
  // A challenge page is HTML with a normal status. That is a failed read, not an empty article.
  if (!response.ok || !payload || payload.error) {
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

export async function bulbapediaParse(
  params: Record<string, string>,
  options: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number } = {},
): Promise<unknown> {
  return wikiRequest(
    params,
    options.fetchImpl ?? fetch,
    options.sleep ?? defaultSleep,
    options.timeoutMs ?? WIKI_TIMEOUT_MS,
  );
}

export function wikiSections(payload: unknown): WikiSection[] {
  return sectionsOf(payload);
}

export function wikiSectionHtml(payload: unknown): string {
  return sectionText(payload);
}

export function findBiologySection(sections: WikiSection[]): WikiSection | undefined {
  return biologySection(sections);
}

export function wikiFailureCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function missingRow(name: string, page: string, url: string): CacheRow {
  return {
    name,
    page,
    url,
    status: "missing",
    blocks: [],
    fetchedAt: new Date().toISOString(),
    revision: CACHE_REVISION,
    settled: true,
  };
}

/**
 * Biology for one species. A finished cache hit does not call Bulbapedia.
 * A missing page or a page with no Biology heading is cached as missing.
 * A network, maxlag, or timeout failure is not cached, so the next view can try again.
 * A timed-out read is tried a few times. If it still fails, prose already on disk is used.
 */
export async function loadBiology(name: string, id: number, options: LoadOptions = {}): Promise<BiologyView> {
  const cacheFile = options.cacheFile ?? CACHE_FILE;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? WIKI_TIMEOUT_MS;
  const raw = (await readCache(cacheFile))[String(id)];
  const cached = usableRow(raw, name);
  if (cached) return viewFromRow(cached);

  const page = wikiPageTitle(name);
  const url = bulbapediaArticleUrl(name);
  const ask = (params: Record<string, string>) => wikiRequest(params, fetchImpl, sleep, timeoutMs);
  const recover = async (error: unknown): Promise<BiologyView> => {
    const disk = proseRow(raw, name) ?? proseRow((await readCache(cacheFile))[String(id)], name);
    if (!disk) throw error;
    // The page is showing this prose. Keep it as the current row so the next open does not call Bulbapedia.
    const kept: CacheRow = {
      ...disk,
      status: "ready",
      revision: CACHE_REVISION,
      settled: true,
    };
    await storeRow(cacheFile, id, kept).catch(() => undefined);
    return viewFromRow(kept);
  };

  let listed: unknown;
  try {
    listed = await ask({ page, prop: "sections" });
  } catch (error) {
    const code = wikiFailureCode(error);
    if (code === "missingtitle") {
      const row = missingRow(name, page, url);
      await storeRow(cacheFile, id, row).catch(() => undefined);
      return viewFromRow(row);
    }
    return recover(error);
  }

  const section = biologySection(sectionsOf(listed));
  if (!section || section.index === undefined || section.index === null || String(section.index) === "") {
    const row = missingRow(name, page, url);
    await storeRow(cacheFile, id, row).catch(() => undefined);
    return viewFromRow(row);
  }

  let parsed: unknown;
  try {
    parsed = await ask({ page, prop: "text", section: String(section.index) });
  } catch (error) {
    return recover(error);
  }
  const blocks = biologyBlocks(sectionText(parsed));
  const row: CacheRow = {
    name,
    page,
    url,
    status: blocks.length > 0 ? "ready" : "missing",
    blocks,
    fetchedAt: new Date().toISOString(),
    revision: CACHE_REVISION,
    settled: blocks.length === 0,
  };
  await storeRow(cacheFile, id, row).catch(() => undefined);
  return viewFromRow(row);
}

type FactSpeech = {
  biology: BiologyView;
  speech: string;
  /** Set when the live wiki read failed and the catalogue Pokédex line was spoken. */
  notice: string;
};

/**
 * Spoken fact for one species.
 * A wiki lead wins. A failed read uses cached wiki prose, then the catalogue Pokédex sentence.
 */
export async function loadFactSpeech(
  name: string,
  id: number,
  dexLine: string,
  options: LoadOptions = {},
): Promise<FactSpeech> {
  const dex = dexLine.replace(/\s+/g, " ").trim();
  try {
    const biology = await loadBiology(name, id, options);
    return {
      biology,
      speech: spokenFact(name, biology.blocks, dex),
      notice: "",
    };
  } catch {
    return {
      biology: {
        status: "unavailable",
        url: bulbapediaArticleUrl(name),
        blocks: [],
      },
      speech: spokenDexLine(name, dex),
      notice: dex ? WIKI_DEX_NOTE : "",
    };
  }
}
