import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { isYotoMediaHash } from "@/lib/yoto-error";

/**
 * data/rendered/<key>.json remembers the yoto:# hash a finished track was given, next to <key>.mp3.
 * Yoto keeps uploaded media per account, so a hash is only handed back to the account that uploaded it.
 * Another account uploads the same .mp3 (Yoto skips the PUT when it already has those bytes) and gets
 * its own entry. Accounts are stored as a one-way hash of the token's user id; never a token or an email.
 */
export type RenderedAudio = {
  trackUrl: string;
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string;
};

export type RenderedFile = {
  cryFirst?: boolean;
  /** One finished upload per Yoto account, keyed by `renderedAccount`. */
  accounts?: Record<string, RenderedAudio>;
  /** Written before uploads had an owner. Unknown, so never reused; the next send records its own. */
  trackUrl?: string;
  duration?: number;
  fileSize?: number;
  format?: string;
  channels?: string;
};

/** The most hashes one forget request may name. A playlist holds 100 tracks. */
export const FORGET_MEDIA_LIMIT = 100;

/** A rendered cache entry is a sha256 hex name. Nothing else in the folder is ever touched. */
const RENDERED_JSON = /^[a-f0-9]{64}\.json$/;

function decodeJwtSub(token: string): string | undefined {
  const part = token.split(".")[1];
  if (!part || !/^[A-Za-z0-9_-]+={0,2}$/.test(part)) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Who uploaded a cached track: a hash of the Yoto user id in the access token (its `sub`).
 * A token that is not a JWT falls back to a hash of the token itself, so its uploads are only reused
 * by that same login. Either way nothing that could sign in or name a person is kept.
 */
export function renderedAccount(token: string): string {
  const sub = decodeJwtSub(token);
  const identity = sub ? `sub\n${sub}` : `token\n${token}`;
  return createHash("sha256").update(`pokefacts-account\n${identity}`).digest("hex").slice(0, 32);
}

function isAudio(value: unknown): value is RenderedAudio {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { trackUrl?: unknown }).trackUrl === "string" &&
    (value as { trackUrl: string }).trackUrl.startsWith("yoto:#")
  );
}

export async function readRenderedFile(file: string): Promise<RenderedFile | undefined> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as RenderedFile;
  } catch {
    return undefined;
  }
}

/** This account's own upload of the track, or undefined when it has none (an ownerless entry included). */
export function renderedAudioFor(file: RenderedFile | undefined, account: string): RenderedAudio | undefined {
  const entry = file?.accounts?.[account];
  return isAudio(entry) ? entry : undefined;
}

function audioOnly(audio: RenderedAudio): RenderedAudio {
  return {
    trackUrl: audio.trackUrl,
    duration: audio.duration,
    fileSize: audio.fileSize,
    format: audio.format,
    channels: audio.channels,
  };
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(value));
  try {
    await rename(tmp, file);
  } catch {
    // Windows will not rename over a file another reader has open. Replace it in two steps.
    await rm(file, { force: true });
    try {
      await rename(tmp, file);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }
}

/** Remember this account's upload beside any other account's. An ownerless hash is dropped: nobody owns it. */
export async function recordRenderedAudio(
  file: string,
  account: string,
  audio: RenderedAudio,
  cryFirst: boolean,
): Promise<void> {
  const known = await readRenderedFile(file);
  const accounts: Record<string, RenderedAudio> = {};
  for (const [owner, entry] of Object.entries(known?.accounts ?? {})) {
    if (isAudio(entry)) accounts[owner] = audioOnly(entry);
  }
  accounts[account] = audioOnly(audio);
  await writeJsonAtomic(file, { cryFirst, accounts } satisfies RenderedFile);
}

/** Hashes Yoto named, checked and capped. Throws on anything that does not look like a Yoto media id. */
export function readForgetHashes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Name the recordings Yoto no longer has.");
  if (value.length > FORGET_MEDIA_LIMIT) {
    throw new Error(`At most ${FORGET_MEDIA_LIMIT} recordings can be forgotten at once.`);
  }
  if (!value.every(isYotoMediaHash)) throw new Error("That recording id does not look like a Yoto one.");
  return [...new Set(value as string[])];
}

/**
 * Yoto said it no longer has these recordings for this account. Drop this account's cached yoto:# for
 * each one, and any ownerless entry naming it, so the next prepare uploads the kept .mp3 again.
 * Other accounts' entries stay. A file left with no hash is renamed to .json.stale; the .mp3 is kept.
 * Only <sha256>.json files directly inside `root` are read, and only the jsons.
 */
export async function forgetRenderedMedia(
  hashes: readonly string[],
  account: string,
  root: string,
): Promise<{ forgotten: number; files: string[] }> {
  const wanted = new Set(hashes.filter(isYotoMediaHash).map((hash) => `yoto:#${hash}`));
  if (wanted.size === 0) return { forgotten: 0, files: [] };
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return { forgotten: 0, files: [] };
  }
  const jsons = names.filter((name) => RENDERED_JSON.test(name));
  const needles = [...wanted];
  const changed: string[] = [];
  let forgotten = 0;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const name = jsons[cursor];
      cursor += 1;
      if (name === undefined) return;
      const file = path.join(/* turbopackIgnore: true */ root, name);
      let raw: string;
      try {
        raw = await readFile(file, "utf8");
      } catch {
        continue;
      }
      if (!needles.some((needle) => raw.includes(needle))) continue;
      let parsed: RenderedFile;
      try {
        parsed = JSON.parse(raw) as RenderedFile;
      } catch {
        continue;
      }
      let hits = 0;
      const next: RenderedFile = { ...parsed };
      const own = parsed.accounts?.[account];
      if (own && wanted.has(own.trackUrl)) {
        const accounts = { ...parsed.accounts };
        delete accounts[account];
        next.accounts = accounts;
        hits += 1;
      }
      if (typeof parsed.trackUrl === "string" && wanted.has(parsed.trackUrl)) {
        delete next.trackUrl;
        delete next.duration;
        delete next.fileSize;
        delete next.format;
        delete next.channels;
        hits += 1;
      }
      if (hits === 0) continue;
      forgotten += hits;
      changed.push(name);
      const left = Object.keys(next.accounts ?? {}).length > 0 || typeof next.trackUrl === "string";
      if (left) {
        await writeJsonAtomic(file, next);
      } else {
        const stale = `${file}.stale`;
        await rm(stale, { force: true });
        await rename(file, stale);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, jsons.length) }, () => worker()));
  return { forgotten, files: changed };
}
