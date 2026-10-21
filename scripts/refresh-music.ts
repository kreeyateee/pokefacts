/**
 * Refresh the Pokémon music index from Bulbapedia.
 * Reads the music navigation templates, each album tracklist, then the YouTube
 * link on each song page. Page HTML is cached in data/bulbapedia/music/.
 * The compact index is written to src/data/music-index.json.
 */
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BULBAPEDIA_API,
  BULBAPEDIA_USER_AGENT,
  bulbapediaParse,
  wikiFailureCode,
  wikiSectionHtml,
} from "../src/lib/bulbapedia";
import {
  MUSIC_SOURCES,
  bulbapediaWikiUrl,
  linksFromNavigation,
  navigationHeadingLinks,
  tracklistSongs,
  youtubeVideoId,
  type MusicAlbum,
  type MusicGap,
  type MusicIndex,
  type MusicSong,
  type WikiLink,
} from "../src/lib/music";

const CACHE_REVISION = 1;
const INDEX_PATH = path.join(process.cwd(), "src", "data", "music-index.json");
const CACHE_DIR = path.join(process.cwd(), "data", "bulbapedia", "music");
const GAP_MS = 600;
const CONCURRENCY = 2;
const BLOCK_LIMIT = 8;

type CacheRow = {
  page: string;
  status: "ready" | "missing";
  html: string;
  code?: string;
  fetchedAt: string;
  revision: number;
};

type DraftAlbum = {
  title: string;
  page: string;
  url: string;
  group: string;
  songLinks: WikiLink[];
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function cachePath(page: string): string {
  const encoded = encodeURIComponent(page);
  const name = encoded.length > 160 ? `${createHash("sha256").update(page).digest("hex")}.json` : `${encoded}.json`;
  return path.join(CACHE_DIR, name);
}

async function readCache(page: string): Promise<CacheRow | null> {
  try {
    const parsed = JSON.parse(await readFile(cachePath(page), "utf8")) as CacheRow;
    if (parsed.revision !== CACHE_REVISION || parsed.page !== page) return null;
    if (parsed.status !== "ready" && parsed.status !== "missing") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(row: CacheRow): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = cachePath(row.page);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(row));
  await rename(tmp, file);
}

function limitFetch(inner: typeof fetch): typeof fetch {
  let active = 0;
  const waiters: Array<() => void> = [];
  return async (input, init) => {
    await new Promise<void>((resolve) => {
      if (active < CONCURRENCY) {
        active += 1;
        resolve();
        return;
      }
      waiters.push(() => {
        active += 1;
        resolve();
      });
    });
    try {
      return await inner(input, init);
    } finally {
      await sleep(GAP_MS);
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    }
  };
}

async function nodeReachesBulbapedia(): Promise<boolean> {
  const url = new URL(BULBAPEDIA_API);
  url.searchParams.set("action", "parse");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("page", "Template:Pokérap");
  url.searchParams.set("prop", "text");
  url.searchParams.set("maxlag", "5");
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": BULBAPEDIA_USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    return response.ok && text.includes('"parse"');
  } catch {
    return false;
  }
}

type Cdp = {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<{
    result?: { sessionId?: string; targetId?: string; result?: { value?: { status?: number; body?: string } } };
    error?: { message?: string };
  }>;
  close(): void;
};

async function connectDevtools(port: number): Promise<Cdp> {
  let version: { webSocketDebuggerUrl?: string } | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      version = (await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json())) as {
        webSocketDebuggerUrl?: string;
      };
      if (version.webSocketDebuggerUrl) break;
    } catch {
      await sleep(150);
    }
  }
  if (!version?.webSocketDebuggerUrl) throw new Error("Chrome devtools did not start.");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("Chrome devtools websocket failed.")));
  });
  let seq = 0;
  const pending = new Map<number, (message: { result?: Cdp extends never ? never : never; error?: { message?: string } }) => void>();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number };
    if (!message.id) return;
    const done = pending.get(message.id);
    if (!done) return;
    pending.delete(message.id);
    done(message as { error?: { message?: string } });
  });
  return {
    send(method, params = {}, sessionId) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`devtools timeout during ${method}`));
        }, 25_000);
        pending.set(id, (message) => {
          clearTimeout(timer);
          const failed = (message as { error?: { message?: string } }).error;
          if (failed) reject(new Error(failed.message || "devtools error"));
          else resolve(message as Awaited<ReturnType<Cdp["send"]>>);
        });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    close() {
      ws.close();
    },
  };
}

async function openSession(cdp: Cdp): Promise<string> {
  const created = await cdp.send("Target.createTarget", { url: "about:blank" });
  const targetId = created.result?.targetId;
  if (!targetId) throw new Error("Chrome did not open a tab.");
  const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attached.result?.sessionId;
  if (!sessionId) throw new Error("Chrome did not attach to a tab.");
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Network.setUserAgentOverride", { userAgent: BULBAPEDIA_USER_AGENT }, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.navigate", { url: "https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_music" }, sessionId);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    const evaluated = await cdp.send(
      "Runtime.evaluate",
      { expression: "document.body ? document.body.innerText.slice(0, 160) : ''", returnByValue: true },
      sessionId,
    );
    const text = (evaluated.result?.result?.value as unknown as string) ?? "";
    if (text && !text.includes("Just a moment") && !text.includes("Enable JavaScript")) return sessionId;
  }
  throw new Error("Bulbapedia did not finish its browser check.");
}

async function chromeFetchImpl(port: number): Promise<{ fetchImpl: typeof fetch; stop: () => void }> {
  const userData = `/tmp/chrome-pokefacts-music-${process.pid}`;
  const chrome: ChildProcess = spawn(
    "/opt/google/chrome/chrome",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      `--user-agent=${BULBAPEDIA_USER_AGENT}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  const stop = () => {
    if (!chrome.pid) return;
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {
      chrome.kill("SIGKILL");
    }
  };
  try {
    const cdp = await connectDevtools(port);
    const sessions = [await openSession(cdp), await openSession(cdp)];
    let cursor = 0;
    const locks = sessions.map(() => Promise.resolve());
    const fetchImpl: typeof fetch = async (input) => {
      const href = input instanceof URL ? input.toString() : String(input);
      const index = cursor % sessions.length;
      cursor += 1;
      const previous = locks[index] ?? Promise.resolve();
      let release: () => void = () => {};
      locks[index] = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const expression = `fetch(${JSON.stringify(href)}, { headers: { Accept: "application/json" }, cache: "no-store" }).then(async (response) => ({ status: response.status, body: await response.text() }))`;
        const evaluated = await cdp.send(
          "Runtime.evaluate",
          { expression, awaitPromise: true, returnByValue: true },
          sessions[index],
        );
        const value = evaluated.result?.result?.value;
        if (!value || typeof value.body !== "string" || typeof value.status !== "number") {
          throw new Error("Bulbapedia returned an empty response.");
        }
        return new Response(value.body, {
          status: value.status,
          headers: { "Content-Type": "application/json" },
        });
      } finally {
        release();
      }
    };
    return {
      fetchImpl,
      stop() {
        cdp.close();
        stop();
      },
    };
  } catch (error) {
    stop();
    throw error;
  }
}

async function chooseFetch(): Promise<{ fetchImpl: typeof fetch; stop: () => void }> {
  if (await nodeReachesBulbapedia()) {
    console.log("Bulbapedia answered the parse API directly.");
    return { fetchImpl: fetch, stop() {} };
  }
  console.log("Bulbapedia challenged a plain request. Using a browser with the Pokefacts user agent.");
  return chromeFetchImpl(9358);
}

function addGap(gaps: MusicGap[], page: string, code: string) {
  if (!code) return;
  if (gaps.some((gap) => gap.page === page)) return;
  gaps.push({ page, code });
}

async function main() {
  const chosen = await chooseFetch();
  const stop = () => chosen.stop();
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stop();
    process.exit(143);
  });
  try {
  const fetchImpl = limitFetch(chosen.fetchImpl);
  const gaps: MusicGap[] = [];
  let streak = 0;
  let stopped = false;
  let fetched = 0;

  async function loadPage(page: string): Promise<{ html: string; code: string }> {
    const cached = await readCache(page);
    if (cached) return { html: cached.html, code: cached.status === "missing" ? cached.code || "missingtitle" : "" };
    if (stopped) return { html: "", code: "skipped-after-block" };
    try {
      const payload = await bulbapediaParse({ page, prop: "text" }, { fetchImpl, sleep });
      const html = wikiSectionHtml(payload);
      await writeCache({
        page,
        status: "ready",
        html,
        fetchedAt: new Date().toISOString(),
        revision: CACHE_REVISION,
      });
      streak = 0;
      fetched += 1;
      if (fetched % 25 === 0) console.log(`fetched ${fetched} pages, latest ${page}`);
      return { html, code: "" };
    } catch (error) {
      const code = wikiFailureCode(error) || "fetch-failed";
      if (code === "missingtitle") {
        await writeCache({
          page,
          status: "missing",
          html: "",
          code,
          fetchedAt: new Date().toISOString(),
          revision: CACHE_REVISION,
        });
        streak = 0;
        return { html: "", code };
      }
      streak += 1;
      console.log(`gap ${page} ${code}`);
      if (streak >= BLOCK_LIMIT) {
        stopped = true;
        console.log(`stopping after ${BLOCK_LIMIT} blocked pages`);
      }
      return { html: "", code };
    }
  }

  const drafts: DraftAlbum[] = [];
  const seenAlbums = new Set<string>();

  for (const source of MUSIC_SOURCES) {
    const loaded = await loadPage(source.page);
    if (!loaded.html) {
      addGap(gaps, source.page, loaded.code || "fetch-failed");
      continue;
    }
    const links = linksFromNavigation(loaded.html, source.role);
    if (source.role === "albums" || source.role === "hub") {
      for (const album of links.albums) {
        if (seenAlbums.has(album.page)) continue;
        seenAlbums.add(album.page);
        drafts.push({
          title: album.title,
          page: album.page,
          url: bulbapediaWikiUrl(album.page),
          group: source.group,
          songLinks: [],
        });
      }
    }
    if ((source.role === "songs" || source.role === "hub") && links.songs.length > 0) {
      const heading =
        navigationHeadingLinks(loaded.html).find((link) => /^list of /i.test(link.title)) ??
        navigationHeadingLinks(loaded.html)[0];
      drafts.push({
        title: source.group,
        page: `collection:${source.group}`,
        url: heading ? bulbapediaWikiUrl(heading.page) : bulbapediaWikiUrl(source.page.replace(/ /g, "_")),
        group: source.group,
        songLinks: links.songs,
      });
    }
    console.log(`${source.group}: ${links.albums.length} albums, ${links.songs.length} songs in the nav`);
  }

  for (const album of drafts) {
    if (album.page.startsWith("collection:")) continue;
    const loaded = await loadPage(album.page);
    if (!loaded.html) {
      addGap(gaps, album.page, loaded.code || "fetch-failed");
      continue;
    }
    album.songLinks = tracklistSongs(loaded.html);
  }

  const songLinks = new Map<string, WikiLink>();
  for (const album of drafts) {
    for (const song of album.songLinks) {
      if (!songLinks.has(song.page)) songLinks.set(song.page, song);
    }
  }

  const songs: MusicSong[] = [];
  for (const link of songLinks.values()) {
    const loaded = await loadPage(link.page);
    if (loaded.code) addGap(gaps, link.page, loaded.code);
    songs.push({
      title: link.title,
      page: link.page,
      url: bulbapediaWikiUrl(link.page),
      youtubeId: loaded.html ? youtubeVideoId(loaded.html) : null,
    });
  }

  const albums: MusicAlbum[] = drafts.map((album) => ({
    title: album.title,
    page: album.page,
    url: album.url,
    group: album.group,
    songs: album.songLinks.map((song) => song.page),
  }));

  const index: MusicIndex = {
    revision: 1,
    fetchedAt: new Date().toISOString(),
    albums,
    songs,
    gaps,
  };
  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  const tmp = `${INDEX_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(index, null, 2)}\n`);
  await rename(tmp, INDEX_PATH);
  const withVideo = songs.filter((song) => song.youtubeId).length;
  const emptyAlbums = albums.filter((album) => album.songs.length === 0);
  console.log(
    JSON.stringify(
      {
        albums: albums.length,
        songs: songs.length,
        youtubeIds: withVideo,
        gaps: gaps.length,
        emptyAlbums: emptyAlbums.length,
        emptyAlbumTitles: emptyAlbums.slice(0, 20).map((album) => album.title),
        gapCodes: gaps.reduce<Record<string, number>>((counts, gap) => {
          counts[gap.code] = (counts[gap.code] ?? 0) + 1;
          return counts;
        }, {}),
      },
      null,
      2,
    ),
  );
  } finally {
    chosen.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
