import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  biologyBlocks,
  bulbapediaParse,
  findBiologySection,
  wikiFailureCode,
  wikiPageTitle,
  wikiSectionHtml,
  wikiSections,
  type WikiSection,
} from "@/lib/bulbapedia";
import type { BiologyBlock, BiologyView, CatalogueFormRef } from "@/lib/catalogue-types";

/**
 * Form descriptions, separate from species Biology.
 * Cache file data/bulbapedia/forms.json, keyed by PokéAPI form id.
 * A form page that only redirects is not its own article: the matching
 * section on the species page is used instead of the species Biology lead.
 */
const CACHE_FILE = path.join(process.cwd(), "data", "bulbapedia", "forms.json");
const CACHE_REVISION = 1;

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
};

type LoadOptions = {
  fetchImpl?: typeof fetch;
  cacheFile?: string;
  sleep?: (ms: number) => Promise<void>;
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

/**
 * The form's own heading, earliest on the page.
 * Later repeats are stats and type charts. Biology itself is never a form section.
 */
export function pickFormSection(sections: WikiSection[], formName: string): WikiSection | undefined {
  const target = norm(formName);
  const exact = sections.filter((section) => {
    const line = norm(section.line ?? "");
    const anchor = norm(section.anchor ?? "");
    return line === target || anchor === target;
  });
  if (exact.length > 0) {
    return [...exact].sort((a, b) => Number(a.index) - Number(b.index))[0];
  }

  const partial = sections.filter((section) => {
    const line = norm(section.line ?? "");
    if (!/mega|gigantamax/.test(line)) return false;
    if (line === "mega evolution" || line === "mega evolutions" || line === "gigantamax") return false;
    if (line === "biology" || line === "forms" || line === "form data") return false;
    return line.length > 8 && sameForm(formName, line);
  });
  if (partial.length > 0) {
    return [...partial].sort((a, b) => {
      const length = norm(b.line ?? "").length - norm(a.line ?? "").length;
      return length || Number(a.index) - Number(b.index);
    })[0];
  }

  return sections.find((section) => {
    const line = norm(section.line ?? "");
    if (/^gigantamax\b/i.test(formName)) return line === "gigantamax";
    if (/^mega\b/i.test(formName)) return line === "mega evolution" || line === "mega evolutions";
    return false;
  });
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
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, CacheRow>;
  } catch {
    return {};
  }
}

function usableRow(row: unknown, form: CatalogueFormRef): CacheRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as CacheRow;
  if (candidate.revision !== CACHE_REVISION) return null;
  if (candidate.formName !== form.formName) return null;
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

async function storeRow(file: string, formId: number, row: CacheRow): Promise<void> {
  await enqueueWrite(async () => {
    const all = await readCache(file);
    all[String(formId)] = row;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(all, null, 2)}\n`);
  });
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
  let section: WikiSection | undefined;
  let ownPage = false;

  if (listed) {
    const redirects = redirectsOf(listed);
    const resolved = titleOf(listed);
    if (redirects.length === 0 && norm(resolved) === norm(form.formName)) {
      ownPage = true;
      pageTitle = resolved || form.formName;
      section = findBiologySection(wikiSections(listed));
    } else {
      pageTitle = redirects[0]?.to || resolved || form.speciesName;
      section = pickFormSection(wikiSections(listed), form.formName);
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
    section = pickFormSection(wikiSections(speciesListed), form.formName);
  }

  const index = sectionIndex(section);
  if (!index && ownPage) {
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

  if (!index) {
    const row = await remember(cacheFile, form, pageTitle, articleUrl(pageTitle), "missing", []);
    return viewFromRow(row);
  }

  const parsed = await parse({
    page: asPageParam(pageTitle),
    prop: "text",
    section: index,
    redirects: "1",
  });
  const blocks = biologyBlocks(wikiSectionHtml(parsed));
  const row = await remember(
    cacheFile,
    form,
    pageTitle,
    articleUrl(pageTitle, section?.anchor),
    blocks.length > 0 ? "ready" : "missing",
    blocks,
  );
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
  };
  await storeRow(file, form.formId, row).catch(() => undefined);
  return row;
}
