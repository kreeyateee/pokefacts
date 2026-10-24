import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Yoto Labs recordings in flight, per Yoto account.
 *
 * A track recorded in pieces sends its missing lines to Yoto Labs a voice at a time: one job holds up to
 * LABS_LINES_PER_JOB lines of one voice, each as its own track of a scratch card. This remembers which job
 * is recording which line, so the browser's next poll, a refreshed page and a restarted server all find
 * the same jobs, and a line that two tracks share is only recorded once. It is kept in memory and in one
 * small file per account, named by the one-way hash `renderedAccount` makes. An entry is a job id, the
 * line's speech key (a hash of its words and voice), its track in the scratch card and when it started:
 * never a token or the words.
 */

/** Lines of one voice sent in one job. One would mean a job per line. */
export const LABS_LINES_PER_JOB = 8;

let linesPerJob = LABS_LINES_PER_JOB;

/** Lines to send in one job now: LABS_LINES_PER_JOB, or one once a card came back without each line's recording. */
export function labsLinesPerJob(): number {
  return linesPerJob;
}

/**
 * Yoto handed back a scratch card without a recording for each of its lines. From now on each line gets
 * a job of its own, as before lines were sent together, so no line is recorded again for nothing.
 */
export function oneLinePerJob(reason: string): void {
  if (linesPerJob === 1) return;
  linesPerJob = 1;
  console.warn(`[labs jobs] ${reason}; recording one line per job from now on`);
}

/** Jobs one track keeps going at once: about one per voice. */
export const LABS_TRACK_JOBS = 3;

/**
 * Jobs one Yoto account keeps going at once, across the three tracks the page records side by side. A
 * track with nothing recording may still start one, so no track waits on the others' lines.
 */
export const LABS_ACCOUNT_JOBS = 3;

/** A job still recording this long after it started is treated as failed, as the page's own wait was. */
export const LABS_STUCK_MS = 3 * 60_000;

/** An entry this old is dropped: its job finished or was lost long ago, so its line starts again. */
export const LABS_FORGET_MS = 30 * 60_000;

/** One job is asked about at most this often, so two tracks waiting on one job do not both ask. */
export const LABS_CHECK_MS = 1_000;

/** The longest a 429 from Yoto pauses an account's recordings, even when Yoto asks for longer. */
export const LABS_PAUSE_LIMIT_MS = 2 * 60_000;

const ACCOUNT = /^[a-f0-9]{32}$/;
const KEY = /^[a-f0-9]{64}$/;
const JOB_ID = /^[\w-]{8,80}$/;
const CARD_ID = /^[\w-]{4,80}$/;
const TRACK = /^[\w-]{0,20}$/;

/** One line being recorded. Lines sent together share a job id. */
export type LabsLine = {
  /** The line's speech key. Its recording is saved as <key>.mp3. */
  key: string;
  jobId: string;
  /** The line's track key in the job's scratch card. Empty for a job an older page started. */
  track: string;
  startedAt: number;
  /** The scratch card, once the job has finished and before this line's recording is saved. */
  cardId?: string;
  /** Times saving the job's recordings failed. */
  misses?: number;
};

function readLine(value: unknown, now: number): LabsLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.key !== "string" || !KEY.test(row.key)) return null;
  if (typeof row.jobId !== "string" || !JOB_ID.test(row.jobId)) return null;
  if (typeof row.startedAt !== "number" || !Number.isFinite(row.startedAt)) return null;
  if (now - row.startedAt > LABS_FORGET_MS) return null;
  const track = typeof row.track === "string" && TRACK.test(row.track) ? row.track : "";
  const line: LabsLine = { key: row.key, jobId: row.jobId, track, startedAt: row.startedAt };
  if (typeof row.cardId === "string" && CARD_ID.test(row.cardId)) line.cardId = row.cardId;
  if (typeof row.misses === "number" && row.misses > 0) line.misses = Math.trunc(row.misses);
  return line;
}

let writes = 0;

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  writes += 1;
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${writes}.tmp`);
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

/** Loaded accounts, by file. A promise, so two requests arriving together share one copy. */
const MEMORY = new Map<string, Promise<LabsJobs>>();
const LOADED = new Map<string, LabsJobs>();
const MEMORY_LIMIT = 2_000;

let groups = 0;

export class LabsJobs {
  private readonly lines = new Map<string, LabsLine>();
  /** Lines whose job is being started right now, by the start they belong to. They count as recording. */
  private readonly starting = new Map<string, number>();
  /** Jobs one request is checking or saving right now. */
  private readonly checking = new Set<string>();
  private readonly checkedAt = new Map<string, number>();
  private pausedUntil = 0;
  private strikes = 0;
  private writing: Promise<void> | null = null;
  private dirty = false;

  private constructor(private readonly file: string) {}

  /** This account's jobs. `root` is the folder of account files, `account` a renderedAccount hash. */
  static open(root: string, account: string, now = Date.now()): Promise<LabsJobs> {
    if (!ACCOUNT.test(account)) return Promise.reject(new Error("That Yoto account does not look right."));
    const file = path.join(/* turbopackIgnore: true */ root, `${account}.json`);
    const known = MEMORY.get(file);
    if (known) return known;
    if (MEMORY.size >= MEMORY_LIMIT) {
      for (const [name, jobs] of LOADED) {
        if (!jobs.idle(now)) continue;
        LOADED.delete(name);
        MEMORY.delete(name);
      }
    }
    const loading = LabsJobs.load(file, now);
    MEMORY.set(file, loading);
    return loading;
  }

  private static async load(file: string, now: number): Promise<LabsJobs> {
    const jobs = new LabsJobs(file);
    let rows: unknown[] = [];
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as { lines?: unknown };
      if (Array.isArray(parsed?.lines)) rows = parsed.lines;
    } catch {
      // No file yet, or a broken one: nothing is recording.
    }
    for (const row of rows) {
      const line = readLine(row, now);
      if (line) jobs.lines.set(line.key, line);
    }
    LOADED.set(file, jobs);
    if (jobs.lines.size !== rows.length) await jobs.save();
    return jobs;
  }

  private idle(now: number): boolean {
    return (
      this.lines.size === 0 && this.starting.size === 0 && this.checking.size === 0 && !this.writing && now >= this.pausedUntil
    );
  }

  /** Forget lines whose job started longer ago than LABS_FORGET_MS: Yoto may no longer know it. */
  async prune(now: number): Promise<void> {
    let dropped = false;
    for (const line of this.lines.values()) {
      if (now - line.startedAt <= LABS_FORGET_MS || this.checking.has(line.jobId)) continue;
      this.lines.delete(line.key);
      dropped = true;
    }
    if (dropped) await this.save();
  }

  line(key: string): LabsLine | undefined {
    return this.lines.get(key);
  }

  /** Every line being recorded, in the order their jobs started. */
  list(): LabsLine[] {
    return [...this.lines.values()];
  }

  /** The lines one job is recording, in the order of its tracks. */
  linesOf(jobId: string): LabsLine[] {
    return this.list().filter((line) => line.jobId === jobId);
  }

  /** A job is recording this line, or one is being started for it. */
  has(key: string): boolean {
    return this.lines.has(key) || this.starting.has(key);
  }

  /** Yoto is recording this line now: its job is starting or running, not finished and waiting to be saved. */
  isRecording(key: string): boolean {
    return this.starting.has(key) || (this.lines.has(key) && !this.lines.get(key)?.cardId);
  }

  /** How many jobs are recording these lines. */
  jobsFor(keys: Iterable<string>): number {
    const going = new Set<string>();
    for (const key of keys) {
      const start = this.starting.get(key);
      if (start !== undefined) going.add(`start ${start}`);
      const line = this.lines.get(key);
      if (line && !line.cardId) going.add(line.jobId);
    }
    return going.size;
  }

  /** Jobs Yoto is still recording for this account: the ones that count against its limit. */
  recording(now: number): number {
    const going = new Set<string>([...this.starting.values()].map((start) => `start ${start}`));
    for (const line of this.lines.values()) {
      if (!line.cardId && now - line.startedAt < LABS_STUCK_MS) going.add(line.jobId);
    }
    return going.size;
  }

  /**
   * Hold lines while their job is started, so a second request cannot start them as well. Returns the
   * lines held: those no other job has. Give them back with `unreserve`, or to `started`.
   */
  reserve(keys: readonly string[]): string[] {
    const free = keys.filter((key) => !this.has(key));
    if (free.length === 0) return free;
    groups += 1;
    for (const key of free) this.starting.set(key, groups);
    return free;
  }

  unreserve(keys: readonly string[]): void {
    for (const key of keys) this.starting.delete(key);
  }

  /** The job for these lines started. Each line is the track `track` of its scratch card. */
  async started(lines: ReadonlyArray<{ key: string; track: string }>, jobId: string, now: number): Promise<void> {
    for (const line of lines) {
      this.starting.delete(line.key);
      this.lines.set(line.key, { key: line.key, jobId, track: line.track, startedAt: now });
    }
    await this.save();
  }

  /** A one-line job an older page started and polls itself. It is checked like any other from now on. */
  async adopt(key: string, jobId: string, now: number): Promise<void> {
    if (this.has(key) || !JOB_ID.test(jobId)) return;
    this.lines.set(key, { key, jobId, track: "", startedAt: now });
    await this.save();
  }

  /**
   * Take a job to check it or save its recordings. False while another request has it, and, unless `due`
   * is false, when it was asked about a moment ago. Give it back with `release`.
   */
  claim(jobId: string, now: number, due = true): boolean {
    if (this.checking.has(jobId)) return false;
    if (due && now - (this.checkedAt.get(jobId) ?? 0) < LABS_CHECK_MS) return false;
    this.checking.add(jobId);
    return true;
  }

  release(jobId: string, now: number): void {
    this.checking.delete(jobId);
    if (this.list().some((line) => line.jobId === jobId)) this.checkedAt.set(jobId, now);
    else this.checkedAt.delete(jobId);
  }

  /** The job finished, but some of its recordings could not be saved yet. Returns how often that happened. */
  async missed(jobId: string, cardId: string): Promise<number> {
    let misses = 0;
    for (const line of this.linesOf(jobId)) {
      line.cardId = cardId;
      line.misses = (line.misses ?? 0) + 1;
      misses = Math.max(misses, line.misses);
    }
    if (misses > 0) await this.save();
    return misses;
  }

  /** The line is saved, or given up on: forget it. */
  async finish(key: string): Promise<void> {
    if (this.lines.delete(key)) await this.save();
  }

  /** Forget every line of a job that is over. */
  async finishJob(jobId: string): Promise<void> {
    let dropped = false;
    for (const line of this.linesOf(jobId)) dropped = this.lines.delete(line.key) || dropped;
    if (dropped) await this.save();
  }

  /** How long Yoto asked this account to wait, from now. */
  pausedFor(now: number): number {
    return Math.max(0, this.pausedUntil - now);
  }

  /**
   * Yoto answered 429. Nothing for this account asks Labs again until the wait is over: Yoto's Retry-After
   * when it gives one, otherwise 2 seconds, doubling each time it happens again, up to a minute.
   */
  pause(now: number, retryAfterMs?: number): number {
    this.strikes = Math.min(this.strikes + 1, 6);
    const backoff = Math.min(60_000, 2_000 * 2 ** (this.strikes - 1));
    const wait = Math.min(LABS_PAUSE_LIMIT_MS, Math.max(backoff, retryAfterMs ?? 0));
    this.pausedUntil = Math.max(this.pausedUntil, now + wait);
    return this.pausedUntil - now;
  }

  /** Yoto took a request, so the next 429 waits the shortest time again. */
  calm(): void {
    this.strikes = 0;
  }

  /** Write the file, one write at a time. A failed write is logged; the lines are still known in memory. */
  private save(): Promise<void> {
    this.dirty = true;
    this.writing ??= (async () => {
      try {
        while (this.dirty) {
          this.dirty = false;
          const lines = this.list();
          if (lines.length === 0) await rm(this.file, { force: true });
          else await writeJsonAtomic(this.file, { version: 1, lines });
        }
      } catch (error) {
        console.warn(`[labs jobs] could not save: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.writing = null;
      }
    })();
    return this.writing;
  }
}

/**
 * Labs jobs the whole site keeps going at once, across everyone sending. When they are all taken, an
 * account that wants another waits in line, and the first in line goes when one frees up, so a big send
 * cannot crowd out a small one. Set high to start, about four families at full speed: the log line
 * "[labs line]" shows when anyone has to wait, and Yoto's own 429 pause still holds everyone back.
 */
export const LABS_SITE_JOBS = 12;

/** A place in line is kept this long without the page asking again; a closed page drops out. */
const LINE_KEPT_MS = 15_000;

/** Accounts waiting for a site slot, in order, with when each last asked. Memory only: after a restart they line up again. */
const line: Array<{ account: string; seen: number }> = [];

/** Jobs held outside the per-account lists, by account: a Hear recording, which runs inside one request. */
const held = new Map<string, number>();

function siteRecording(now: number): number {
  let count = 0;
  for (const jobs of LOADED.values()) count += jobs.recording(now);
  for (const jobs of held.values()) count += jobs;
  return count;
}

export type LabsTurn = { ok: true } | { ok: false; position: number };

/**
 * May this account start a Labs job now? Yes when the site has a slot free and nobody is waiting ahead of
 * it. Otherwise it joins the line, or keeps its place, and hears its position (1 is next).
 */
export function takeTurn(account: string, now: number): LabsTurn {
  for (let index = line.length - 1; index >= 0; index -= 1) {
    const entry = line[index] as { account: string; seen: number };
    if (entry.account !== account && now - entry.seen > LINE_KEPT_MS) line.splice(index, 1);
  }
  let at = line.findIndex((entry) => entry.account === account);
  if (at >= 0) (line[at] as { seen: number }).seen = now;
  if (siteRecording(now) < LABS_SITE_JOBS && (at === 0 || (at < 0 && line.length === 0))) {
    if (at === 0) line.shift();
    return { ok: true };
  }
  if (at < 0) {
    line.push({ account, seen: now });
    at = line.length - 1;
    // Counts only: no account, words or token.
    console.info(`[labs line] a send joined the line at place ${at + 1}; ${siteRecording(now)} of ${LABS_SITE_JOBS} jobs going`);
  }
  return { ok: false, position: at + 1 };
}

/** Hold a site slot for a job that is not in an account's list, such as a Hear recording. */
export function holdSlot(account: string): void {
  held.set(account, (held.get(account) ?? 0) + 1);
}

export function releaseSlot(account: string): void {
  const left = (held.get(account) ?? 0) - 1;
  if (left > 0) held.set(account, left);
  else held.delete(account);
}

/** For tests: forget every account in memory, as a restarted server would. The files stay. */
export function dropLabsJobMemory(): void {
  MEMORY.clear();
  LOADED.clear();
  line.length = 0;
  held.clear();
  linesPerJob = LABS_LINES_PER_JOB;
}
