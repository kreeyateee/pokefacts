import { wikiSectionHtml } from "./bulbapedia";
import { isYoutubeVideoId } from "./youtube-link";

export type { MusicAlbum, MusicGap, MusicIndex, MusicSong } from "./music-index";
export { emptyMusicIndex, readMusicIndex } from "./music-index";

/** Bulbapedia navigation templates that list Pokémon albums and songs. */
export const MUSIC_SOURCES = [
  { page: "Template:Themes", group: "Themes", role: "hub" },
  { page: "Template:English CDs", group: "English CDs", role: "albums" },
  { page: "Template:Japanese CDs", group: "Japanese CDs", role: "albums" },
  { page: "Template:English opening themes", group: "English opening themes", role: "songs" },
  { page: "Template:Jukebox", group: "Jukebox", role: "songs" },
  { page: "Template:Karaokémon", group: "Karaokémon", role: "songs" },
  { page: "Template:Japanese opening themes", group: "Japanese opening themes", role: "songs" },
  { page: "Template:Japanese ending themes", group: "Japanese ending themes", role: "songs" },
  { page: "Template:Pokérap", group: "Pokérap", role: "songs" },
] as const;

export type MusicRole = (typeof MUSIC_SOURCES)[number]["role"];

export type WikiLink = {
  title: string;
  page: string;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  rsquo: "\u2019",
  lsquo: "\u2018",
  hellip: "\u2026",
};

const NAMESPACES = new Set([
  "template",
  "category",
  "file",
  "special",
  "help",
  "bulbapedia",
  "user",
  "talk",
  "wikipedia",
  "wp",
  "mediawiki",
  "module",
  "project",
  "image",
]);

const VOID_TAGS = new Set([
  "area",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const TRACK_IDS = new Set(["Tracklist", "Track_listing", "Track_list", "Tracks", "Songs"]);

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

export function decodeHtml(text: string): string {
  let value = text;
  for (let pass = 0; pass < 2; pass += 1) {
    value = value
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, num: string) => safeChar(Number(num)))
      .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name] ?? all);
  }
  return value;
}

function plain(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  const raw = match?.[2] ?? match?.[3] ?? match?.[4];
  return raw == null ? null : decodeHtml(raw);
}

export function bulbapediaWikiUrl(page: string): string {
  return `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(page)}`;
}

export function musicHtml(payload: unknown): string {
  return wikiSectionHtml(payload);
}

/** Song articles from {{So}}, album articles from {{CD}} and {{Single}}. */
export function musicLinkKind(title: string): "song" | "album" | "other" {
  const trimmed = title.trim();
  if (/\(song\)$/i.test(trimmed)) return "song";
  if (/\((?:cd|single)\)$/i.test(trimmed)) return "album";
  return "other";
}

function isReleaseTitle(title: string): boolean {
  return /\((?:cd|single|soundtrack|score|album|ep)\)$/i.test(title.trim());
}

function isSongCandidate(link: WikiLink): boolean {
  if (isReleaseTitle(link.title)) return false;
  if (/\((?:Pokémon|pokemon|anime|character|trainer|episode|movie|game)\)$/i.test(link.title)) return false;
  return true;
}

export function wikiLinkFromHref(href: string, titleAttr: string | null, text: string): WikiLink | null {
  if (!href || href.startsWith("#")) return null;
  let pathname = href;
  try {
    const url = new URL(href, "https://bulbapedia.bulbagarden.net");
    if (url.hostname && !url.hostname.endsWith("bulbagarden.net")) return null;
    pathname = url.pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith("/wiki/")) return null;
  let slug = pathname.slice("/wiki/".length);
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  if (!slug || slug.startsWith("index.php")) return null;
  const colon = slug.indexOf(":");
  if (colon > 0 && NAMESPACES.has(slug.slice(0, colon).toLowerCase())) return null;
  const page = slug.replace(/ /g, "_");
  const title = (titleAttr || text || page).replace(/_/g, " ").trim();
  if (!title || /^edit section:/i.test(title) || /^edit$/i.test(title)) return null;
  return { title, page };
}

function anchors(fragment: string): WikiLink[] {
  return linkedAnchors(fragment).map(({ title, page }) => ({ title, page }));
}

function linkedAnchors(fragment: string): Array<WikiLink & { text: string }> {
  const links: Array<WikiLink & { text: string }> = [];
  for (const match of fragment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[1] ?? "", "href");
    if (!href) continue;
    const text = plain(match[2] ?? "");
    const link = wikiLinkFromHref(href, attr(match[1] ?? "", "title"), text);
    if (link) links.push({ ...link, text });
  }
  return links;
}

/** A track link names the cell. A name inside a longer title, such as Satoshi in a friendship theme, does not. */
function linkNamesContainer(text: string, container: string): boolean {
  const name = text.trim();
  const whole = plain(container);
  if (!name || !whole) return false;
  return whole.length <= name.length + 6;
}

function songLinkIn(fragment: string): WikiLink | undefined {
  const link = linkedAnchors(fragment).find(
    (candidate) => isSongCandidate(candidate) && linkNamesContainer(candidate.text, fragment),
  );
  return link ? { title: link.title, page: link.page } : undefined;
}

function dedupe(links: WikiLink[]): WikiLink[] {
  const seen = new Set<string>();
  const out: WikiLink[] = [];
  for (const link of links) {
    if (seen.has(link.page)) continue;
    seen.add(link.page);
    out.push(link);
  }
  return out;
}

/** HTML that sits in td cells (album and song lists) or th cells (section labels). */
function cellHtml(html: string, want: "td" | "th"): string {
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b[^>]*\/?>/g;
  let td = 0;
  let th = 0;
  let skip = 0;
  let last = 0;
  let out = "";
  const active = () => (want === "td" ? td > 0 && th === 0 : th > 0);
  for (const match of html.matchAll(re)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (skip === 0 && active()) out += html.slice(last, index);
    last = index + token.length;
    if (token.startsWith("<!--")) continue;
    const name = (match[1] ?? "").toLowerCase();
    const closing = token.startsWith("</");
    const selfClosing = token.endsWith("/>") || VOID_TAGS.has(name);
    if (skip > 0) {
      if (!selfClosing && (name === "script" || name === "style")) skip += closing ? -1 : 1;
      continue;
    }
    if (!closing && !selfClosing && (name === "script" || name === "style")) {
      skip = 1;
      continue;
    }
    if (name === "td" || name === "th") {
      if (name === "td") td = closing ? Math.max(0, td - 1) : td + 1;
      else th = closing ? Math.max(0, th - 1) : th + 1;
      continue;
    }
    if (selfClosing) {
      if (active()) out += token;
      continue;
    }
    if (active()) out += token;
  }
  if (skip === 0 && active()) out += html.slice(last);
  return out;
}

export function navigationContentLinks(html: string): WikiLink[] {
  return dedupe(anchors(cellHtml(html, "td"))).filter((link) => !/^list of /i.test(link.title));
}

export function navigationHeadingLinks(html: string): WikiLink[] {
  return dedupe(anchors(cellHtml(html, "th"))).filter((link) => !/^edit section:/i.test(link.title));
}

export function linksFromNavigation(
  html: string,
  role: MusicRole,
): { albums: WikiLink[]; songs: WikiLink[] } {
  const albums: WikiLink[] = [];
  const songs: WikiLink[] = [];
  for (const link of navigationContentLinks(html)) {
    const kind = musicLinkKind(link.title);
    if (role === "hub") {
      if (kind === "album") albums.push(link);
      else if (kind === "song") songs.push(link);
      continue;
    }
    if (role === "albums") {
      if (kind === "song") songs.push(link);
      else albums.push(link);
      continue;
    }
    if (kind === "album" || isReleaseTitle(link.title)) albums.push(link);
    else if (isSongCandidate(link)) songs.push(link);
  }
  return { albums, songs };
}

function trackSection(html: string): string {
  for (const match of html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)) {
    const ids = [...match[0].matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((item) => item[1] ?? "");
    if (!ids.some((id) => TRACK_IDS.has(id))) continue;
    const start = (match.index ?? 0) + match[0].length;
    const next = /<h2\b/i.exec(html.slice(start));
    return html.slice(start, next ? start + next.index : html.length);
  }
  return "";
}

function tableCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => cell[2] ?? "");
}

function columnScore(label: string): number {
  if (/artist|composer|arranger|performer|vocal|lyric|duration|length|time|^no\.?$|^#$/i.test(label)) return -1;
  if (/translation/i.test(label)) return 3;
  if (/track title|song title/i.test(label)) return 2;
  if (/title|song|曲/i.test(label)) return 1;
  return 0;
}

function songFromRow(cells: string[], header: string[] | null): WikiLink | null {
  const ranked = cells.map((cell, index) => ({
    cell,
    index,
    score: header ? columnScore(plain(header[index] ?? "")) : 0,
  }));
  const preferred = ranked.filter((item) => item.score > 0);
  const pool = (preferred.length > 0 ? preferred : ranked.filter((item) => item.score === 0)).sort(
    (a, b) => b.score - a.score || a.index - b.index,
  );
  for (const item of pool) {
    const link = songLinkIn(item.cell);
    if (link) return link;
  }
  return null;
}

function songsInList(section: string): WikiLink[] {
  const found: WikiLink[] = [];
  for (const item of section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const body = item[1] ?? "";
    const bold = body.match(/<b\b[^>]*>([\s\S]*?)<\/b>/i)?.[1];
    const boldLink = bold ? songLinkIn(bold) : undefined;
    if (boldLink) {
      found.push(boldLink);
      continue;
    }
    const beforeDash = body.split(/ [-–—] /)[0] ?? body;
    const link = songLinkIn(beforeDash);
    if (link) found.push(link);
  }
  return dedupe(found);
}

function songsInTables(section: string): WikiLink[] {
  const found: WikiLink[] = [];
  for (const table of section.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const rows = [...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((row) => tableCells(row[1] ?? ""))
      .filter((cells) => cells.length > 0);
    if (rows.length === 0) continue;
    const headerText = plain(rows[0]?.join(" ") ?? "");
    const headed = /no\.?|track|title|artist|duration|translation|曲/i.test(headerText);
    const header = headed ? (rows[0] ?? null) : null;
    for (const cells of rows.slice(headed ? 1 : 0)) {
      const link = songFromRow(cells, header);
      if (link) found.push(link);
    }
  }
  return dedupe(found);
}

/** Songs linked from an album's Tracklist or Track listing section. */
export function tracklistSongs(html: string): WikiLink[] {
  const section = trackSection(html);
  if (!section) return [];
  const fromTables = songsInTables(section);
  if (fromTables.length > 0) return fromTables;
  const fromList = songsInList(section);
  if (fromList.length > 0) return fromList;
  if (/<th\b[^>]*>[\s\S]{0,120}(?:track|title|translation|曲)/i.test(section)) return [];
  return dedupe(anchors(section).filter((link) => isSongCandidate(link) && !/^list of /i.test(link.title)));
}

function videoIdFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  let url: URL;
  try {
    url = new URL(withProtocol, "https://bulbapedia.bulbagarden.net");
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host !== "youtube.com" && host !== "youtube-nocookie.com" && host !== "youtu.be") return null;
  if (host === "youtu.be") return validVideoId(url.pathname.split("/").filter(Boolean)[0] ?? "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed" || parts[0] === "v" || parts[0] === "shorts" || parts[0] === "live") {
    return validVideoId(parts[1] ?? "");
  }
  return validVideoId(url.searchParams.get("v") ?? "");
}

function validVideoId(id: string): string | null {
  return isYoutubeVideoId(id) ? id : null;
}

/** First embedded YouTube video on a song page. Channel links are ignored. */
export function youtubeVideoId(html: string): string | null {
  for (const iframe of html.matchAll(/<iframe\b[^>]*>/gi)) {
    const src = attr(iframe[0], "src");
    const id = src ? videoIdFromUrl(src) : null;
    if (id) return id;
  }
  for (const match of html.matchAll(/(?:https?:)?\/\/[^\s"'<>]+/gi)) {
    const id = videoIdFromUrl(decodeHtml(match[0]));
    if (id) return id;
  }
  return null;
}

