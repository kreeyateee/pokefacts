import path from "node:path";

import { readJsonObject, updateJsonObject } from "@/lib/json-cache";

import {
  biologyBlocks,
  bulbapediaParse,
  findBiologySection,
  loadBiology,
  wikiFailureCode,
  wikiPageTitle,
  wikiSectionHtml,
  wikiSections,
  type WikiSection,
} from "@/lib/bulbapedia";
import { getCatalogueEntry } from "@/lib/catalogue-db";
import type { BiologyBlock, BiologyView, CatalogueFormRef } from "@/lib/catalogue-types";
import { formProse, spokenDexLine, spokenForm, spokenWiki, WIKI_DEX_NOTE } from "@/lib/spoken-wiki";

/**
 * Form descriptions, separate from species Biology.
 * Cache file data/bulbapedia/forms.json, keyed by PokéAPI form id.
 * A form page that only redirects is not its own article: the matching
 * section on the species page is used instead of the species Biology lead.
 */
const CACHE_FILE = path.join(process.cwd(), "data", "bulbapedia", "forms.json");
/**
 * Revision 2 refetches Mega and Gigantamax rows the old parser stored as missing.
 * A revision 1 row that already has prose is still used.
 */
const CACHE_REVISION = 2;

type CacheRow = {
  formId: number;
  formName: string;
  speciesName: string;
  page: string;
  url: string;
  status: "ready" | "missing";
  blocks: BiologyBlock[];
  fetchedAt: string;
  revision: number;
  /** True when a finished read had no form prose. A timeout must not set this. */
  settled?: boolean;
};

type LoadOptions = {
  fetchImpl?: typeof fetch;
  cacheFile?: string;
  biologyCacheFile?: string;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Catalogue Pokédex sentence. When omitted, the species row in the catalogue is used. */
  dexLine?: string;
};

function norm(value: string): string {
  return value
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function wordsOf(value: string): string[] {
  return norm(value).split(" ").filter((word) => word.length > 1 || word === "x" || word === "y");
}

/** Every important word of the shorter title appears in the longer one. */
function sameForm(formName: string, line: string): boolean {
  const formWords = wordsOf(formName);
  const lineWords = wordsOf(line);
  if (formWords.length === 0 || lineWords.length === 0) return false;
  const [shorter, longer] = formWords.length <= lineWords.length ? [formWords, lineWords] : [lineWords, formWords];
  return shorter.every((word) => longer.includes(word));
}

/** Bulbapedia title for a form, without the species _(Pokémon) suffix. */
export function formWikiTitle(name: string): string {
  return name
    .trim()
    .replace(/\s+\([^)]*\)$/, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, "_");
}

function asPageParam(title: string): string {
  return title.trim().replace(/\s+/g, "_");
}

function articleUrl(pageTitle: string, anchor?: string): string {
  const base = `https://bulbapedia.bulbagarden.net/wiki/${encodeURI(asPageParam(pageTitle))}`;
  return anchor ? `${base}#${anchor}` : base;
}

function sectionIndex(section: WikiSection | undefined): string {
  if (!section || section.index === undefined || section.index === null) return "";
  return String(section.index);
}

function gameDataCutoff(sections: WikiSection[]): number {
  const game = sections.find((section) => norm(section.line ?? "") === "game data");
  const index = Number(game?.index);
  return Number.isFinite(index) ? index : Number.POSITIVE_INFINITY;
}

function beforeGameData(section: WikiSection, cutoff: number): boolean {
  const index = Number(section.index);
  return Number.isFinite(index) && index < cutoff;
}

function exactForm(section: WikiSection, formName: string): boolean {
  const target = norm(formName);
  return norm(section.line ?? "") === target || norm(section.anchor ?? "") === target;
}

function partialForm(section: WikiSection, formName: string): boolean {
  const line = norm(section.line ?? "");
  if (!/mega|gigantamax/.test(line)) return false;
  if (line === "mega evolution" || line === "mega evolutions" || line === "gigantamax") return false;
  if (line === "biology" || line === "forms" || line === "form data") return false;
  return line.length > 8 && sameForm(formName, line);
}

function folderSection(section: WikiSection, formName: string): boolean {
  const line = norm(section.line ?? "");
  if (/^gigantamax\b/i.test(formName)) return line === "gigantamax";
  if (/^mega\b/i.test(formName)) return line === "mega evolution" || line === "mega evolutions";
  return false;
}

/**
 * Where a form's prose can live, best first.
 * A Biology "Forms" section comes before a later stats heading with the same name.
 * Mega Pidgeot's description is under Forms. The Base stats "Mega Pidgeot" heading is not.
 */
function formSectionCandidates(sections: WikiSection[], formName: string): WikiSection[] {
  const cutoff = gameDataCutoff(sections);
  const before = (section: WikiSection) => beforeGameData(section, cutoff);
  const ordered = [
    ...sections.filter((section) => before(section) && exactForm(section, formName)),
    ...sections.filter((section) => before(section) && partialForm(section, formName) && !exactForm(section, formName)),
    ...sections.filter((section) => before(section) && norm(section.line ?? "") === "forms"),
    ...sections.filter((section) => before(section) && folderSection(section, formName)),
    ...sections.filter((section) => !before(section) && (exactForm(section, formName) || partialForm(section, formName))),
  ];
  const seen = new Set<string>();
  const unique: WikiSection[] = [];
  for (const section of ordered) {
    const index = sectionIndex(section);
    if (!index || seen.has(index)) continue;
    seen.add(index);
    unique.push(section);
  }
  return unique;
}

/** The form's own heading when it sits in Biology. Stats repeats come later. */
export function pickFormSection(sections: WikiSection[], formName: string): WikiSection | undefined {
  return formSectionCandidates(sections, formName)[0];
}

/**
 * Candidates, then the Biology section so a paragraph that names the form
 * can still be read when Bulbapedia gave it no heading of its own.
 */
function sectionsToRead(sections: WikiSection[], formName: string): WikiSection[] {
  const candidates = formSectionCandidates(sections, formName);
  const cutoff = gameDataCutoff(sections);
  const biology = sections.find(
    (section) => norm(section.line ?? "") === "biology" && beforeGameData(section, cutoff),
  );
  if (!biology) return candidates;
  const index = sectionIndex(biology);
  if (!index || candidates.some((section) => sectionIndex(section) === index)) return candidates;
  return [...candidates, biology];
}

function mentionsForm(text: string, formName: string): boolean {
  const hay = norm(text);
  const needle = norm(formName);
  if (needle && hay.includes(needle)) return true;
  if (sameForm(formName, text)) return true;
  const other = text.match(/\b(?:Mega|Gigantamax)\s+[A-Z][\w'’.+-]+(?:\s+[A-Z][\w'’.+-]+)?/g) ?? [];
  const different = other.some((found) => norm(found) !== needle && !sameForm(formName, found));
  if (different) return false;
  if (/^mega\b/i.test(formName) && /mega evol/i.test(text)) return true;
  if (/^gigantamax\b/i.test(formName) && /gigantamax/i.test(text)) return true;
  return false;
}

function paragraphKept(text: string): boolean {
  return formProse([{ kind: "paragraph", text }]).length > 0;
}

/**
 * Paragraphs about this form. A "can Mega Evolve" stub is dropped.
 * A Forms section keeps only paragraphs that name the form.
 * A heading that is the form keeps the paragraphs under it.
 */
function formSpecificBlocks(blocks: BiologyBlock[], formName: string, sectionLine = ""): BiologyBlock[] {
  const headingAt = blocks.findIndex(
    (block) =>
      block.kind === "heading" &&
      (norm(block.text) === norm(formName) ||
        (sameForm(formName, block.text) && /mega|gigantamax/i.test(block.text))),
  );
  const dedicated =
    headingAt >= 0 ||
    norm(sectionLine) === norm(formName) ||
    (sameForm(formName, sectionLine) && /mega|gigantamax/i.test(sectionLine));
  const source = headingAt >= 0 ? blocks.slice(headingAt + 1) : blocks;
  const paragraphs: BiologyBlock[] = [];
  for (const block of source) {
    if (block.kind === "heading") {
      if (paragraphs.length > 0) break;
      continue;
    }
    if (block.kind !== "paragraph") continue;
    if (!paragraphKept(block.text)) continue;
    if (!dedicated && !mentionsForm(block.text, formName)) continue;
    paragraphs.push(block);
    if (paragraphs.length === 2) break;
  }
  return paragraphs;
}

function redirectsOf(payload: unknown): Array<{ to?: string }> {
  if (!payload || typeof payload !== "object") return [];
  const redirects = (payload as { parse?: { redirects?: unknown } }).parse?.redirects;
  return Array.isArray(redirects) ? (redirects as Array<{ to?: string }>) : [];
}

function titleOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const title = (payload as { parse?: { title?: unknown } }).parse?.title;
  return typeof title === "string" ? title : "";
}

async function readCache(file: string): Promise<Record<string, CacheRow>> {
  return (await readJsonObject(file)) as Record<string, CacheRow>;
}

function usableRow(row: unknown, form: CatalogueFormRef): CacheRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as CacheRow;
  const mega = /^(mega|gigantamax)\b/i.test(candidate.formName ?? "");
  // The old parser cached Mega Pidgeot and other forms as missing after reading a stats heading.
  if (candidate.revision === 1 && candidate.status === "missing" && mega) return null;
  const current = candidate.revision === CACHE_REVISION;
  const olderProse = candidate.revision === 1 && candidate.status === "ready";
  if (!current && !olderProse) return null;
  if (candidate.formName !== form.formName) return null;
  if (candidate.status !== "ready" && candidate.status !== "missing") return null;
  if (!Array.isArray(candidate.blocks)) return null;
  if (candidate.status === "missing" && candidate.settled !== true) return null;
  return candidate;
}

/** Saved form prose from any revision, used when the live read fails. */
function proseFormRow(row: unknown, form: CatalogueFormRef): CacheRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as CacheRow;
  if (candidate.formName !== form.formName) return null;
  if (candidate.status !== "ready") return null;
  if (!Array.isArray(candidate.blocks) || !formProse(candidate.blocks)) return null;
  return candidate;
}

async function storeRow(file: string, formId: number, row: CacheRow): Promise<void> {
  await updateJsonObject(file, String(formId), row);
}

function viewFromRow(row: CacheRow): BiologyView {
  return { status: row.status, url: row.url, blocks: row.blocks };
}

/**
 * The form's own article when Bulbapedia has one.
 * A redirect to the species page uses the form's section, not species Biology.
 */
export async function loadFormProse(form: CatalogueFormRef, options: LoadOptions = {}): Promise<BiologyView> {
  const cacheFile = options.cacheFile ?? CACHE_FILE;
  const cached = usableRow((await readCache(cacheFile))[String(form.formId)], form);
  if (cached) return viewFromRow(cached);

  const parse = (params: Record<string, string>) => bulbapediaParse(params, options);
  const ownTitle = formWikiTitle(form.formName);
  let listed: unknown = null;
  try {
    listed = await parse({ page: ownTitle, prop: "sections", redirects: "1" });
  } catch (error) {
    if (wikiFailureCode(error) !== "missingtitle") throw error;
  }

  let pageTitle = form.speciesName;
  let ownPage = false;
  let ownSection: WikiSection | undefined;
  let candidates: WikiSection[] = [];

  if (listed) {
    const redirects = redirectsOf(listed);
    const resolved = titleOf(listed);
    if (redirects.length === 0 && norm(resolved) === norm(form.formName)) {
      ownPage = true;
      pageTitle = resolved || form.formName;
      ownSection = findBiologySection(wikiSections(listed));
    } else {
      pageTitle = redirects[0]?.to || resolved || form.speciesName;
      candidates = sectionsToRead(wikiSections(listed), form.formName);
    }
  } else {
    let speciesListed: unknown;
    try {
      speciesListed = await parse({ page: wikiPageTitle(form.speciesName), prop: "sections", redirects: "1" });
    } catch (error) {
      if (wikiFailureCode(error) !== "missingtitle") throw error;
      const row = await remember(cacheFile, form, form.speciesName, "", "missing", []);
      return viewFromRow(row);
    }
    pageTitle = titleOf(speciesListed) || form.speciesName;
    candidates = sectionsToRead(wikiSections(speciesListed), form.formName);
  }

  if (ownPage) {
    const index = sectionIndex(ownSection);
    if (!index) {
      const lead = await parse({ page: asPageParam(pageTitle), prop: "text", section: "0", redirects: "1" });
      const blocks = biologyBlocks(wikiSectionHtml(lead));
      const row = await remember(
        cacheFile,
        form,
        pageTitle,
        articleUrl(pageTitle),
        blocks.length > 0 ? "ready" : "missing",
        blocks,
      );
      return viewFromRow(row);
    }
    candidates = [ownSection as WikiSection];
  }

  for (const candidate of candidates) {
    const index = sectionIndex(candidate);
    if (!index) continue;
    const parsed = await parse({
      page: asPageParam(pageTitle),
      prop: "text",
      section: index,
      redirects: "1",
    });
    const blocks = ownPage
      ? biologyBlocks(wikiSectionHtml(parsed))
      : formSpecificBlocks(biologyBlocks(wikiSectionHtml(parsed)), form.formName, candidate.line ?? "");
    if (!formProse(blocks) && !ownPage) continue;
    if (blocks.length === 0) continue;
    const row = await remember(
      cacheFile,
      form,
      pageTitle,
      articleUrl(pageTitle, candidate.anchor),
      "ready",
      blocks,
    );
    return viewFromRow(row);
  }

  const row = await remember(cacheFile, form, pageTitle, articleUrl(pageTitle), "missing", []);
  return viewFromRow(row);
}

async function remember(
  file: string,
  form: CatalogueFormRef,
  pageTitle: string,
  url: string,
  status: "ready" | "missing",
  blocks: BiologyBlock[],
): Promise<CacheRow> {
  const row: CacheRow = {
    formId: form.formId,
    formName: form.formName,
    speciesName: form.speciesName,
    page: asPageParam(pageTitle),
    url,
    status,
    blocks,
    fetchedAt: new Date().toISOString(),
    revision: CACHE_REVISION,
    settled: status === "missing",
  };
  await storeRow(file, form.formId, row).catch(() => undefined);
  return row;
}

function catalogueDex(speciesId: number, override?: string): string {
  const given = override?.replace(/\s+/g, " ").trim() ?? "";
  if (given) return given;
  try {
    return getCatalogueEntry(speciesId)?.info?.replace(/\s+/g, " ").trim() ?? "";
  } catch {
    return "";
  }
}

async function savedFormProse(form: CatalogueFormRef, options: LoadOptions): Promise<BiologyView | null> {
  const file = options.cacheFile ?? CACHE_FILE;
  const row = proseFormRow((await readCache(file))[String(form.formId)], form);
  if (!row) return null;
  if (!usableRow(row, form)) {
    await storeRow(file, form.formId, {
      ...row,
      status: "ready",
      revision: CACHE_REVISION,
      settled: true,
    }).catch(() => undefined);
  }
  return viewFromRow(row);
}

/**
 * What Lily says for a Mega Evolution or Gigantamax form.
 * Form prose wins. A missing page uses the species Biology.
 * A failed wiki read uses cached prose, then the catalogue Pokédex sentence.
 */
export async function loadFormSpeech(
  form: CatalogueFormRef,
  options: LoadOptions = {},
): Promise<{ speech: string; article: BiologyView; notice: string }> {
  let article: BiologyView;
  let failed = false;
  try {
    article = await loadFormProse(form, options);
  } catch {
    failed = true;
    article = (await savedFormProse(form, options)) ?? { status: "unavailable", url: "", blocks: [] };
  }
  if (formProse(article.blocks)) {
    return { speech: spokenWiki(form.formName, article.blocks), article, notice: "" };
  }
  try {
    const biology = await loadBiology(form.speciesName, form.speciesId, {
      fetchImpl: options.fetchImpl,
      cacheFile: options.biologyCacheFile,
      sleep: options.sleep,
      timeoutMs: options.timeoutMs,
    });
    const speech = spokenForm(form.formName, article.blocks, form.speciesName, biology.blocks);
    if (speech !== spokenWiki(form.formName, [])) {
      return {
        speech,
        article: {
          ...article,
          url: biology.status === "ready" && biology.url ? biology.url : article.url,
        },
        notice: "",
      };
    }
  } catch {
    failed = true;
  }
  const dex = catalogueDex(form.speciesId, options.dexLine);
  return {
    speech: spokenDexLine(form.formName, dex),
    article,
    notice: failed && dex ? WIKI_DEX_NOTE : "",
  };
}
