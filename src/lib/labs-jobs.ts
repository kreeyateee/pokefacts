import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Yoto Labs recordings in flight, per Yoto account.
 *
 * A track recorded in pieces keeps a few Labs jobs going at once. This remembers which job is recording
 * which line, so the browser's next poll, a refreshed page and a restarted server all find the same jobs,
 * and a line that two tracks share is only recorded once. It is kept in memory and in one small file per
 * account, named by the one-way hash `renderedAccount` makes. An entry is a job id, the line's speech key
 * (a hash of its words and voice) and when it started: never a token or the words.
 */

/** Jobs one track keeps going at once. */
export const LABS_TRACK_JOBS = 3;

/**
 * Jobs one Yoto account keeps going at once. The page records three tracks side by side, so this keeps
 * the whole send polite. A track with nothing recording may still start one line.
 */
export const LABS_ACCOUNT_JOBS = 6;

/** A job still recording this long after it started is treated as failed, as the page's own wait was. */
export const LABS_STUCK_MS = 3 * 60_000;

/** An entry this old is dropped when its file is read: its job finished or was lost long ago. */
export const LABS_FORGET_MS = 30 * 60_000;

/** One job is asked about at most this often, so two tracks waiting on one line do not both ask. */
export const LABS_CHECK_MS = 1_000;

/** The longest a 429 from Yoto pauses an account's recordings, even when Yoto asks for longer. */
export const LABS_PAUSE_LIMIT_MS = 2 * 60_000;

const ACCOUNT = /^[a-f0-9]{32}$/;
const KEY = /^[a-f0-9]{64}$/;
const JOB_ID = /^[\w-]{8,80}$/;
const CARD_ID = /^[\w-]{4,80}$/;

export type LabsJob = {
  /** The line's speech key. Its recording is saved as <key>.mp3. */
  key: string;
  jobId: string;
  startedAt: number;
  /** The scratch card, once the job has finished and before its recording is saved. */
  cardId?: string;
  /** Times saving that recording failed. */
  misses?: number;
};

function readJob(value: unknown, now: number): LabsJob | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.key !== "string" || !KEY.test(row.key)) return null;
  if (typeof row.jobId !== "string" || !JOB_ID.test(row.jobId)) return null;
  if (typeof row.startedAt !== "number" || !Number.isFinite(row.startedAt)) return null;
  if (now - row.startedAt > LABS_FORGET_MS) return null;
  const job: LabsJob = { key: row.key, jobId: row.jobId, startedAt: row.startedAt };
  if (typeof row.cardId === "string" && CARD_ID.test(row.cardId)) job.cardId = row.cardId;
  if (typeof row.misses === "number" && row.misses > 0) job.misses = Math.trunc(row.misses);
  return job;
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

export class LabsJobs {
  private readonly jobs = new Map<string, LabsJob>();
  /** Lines whose job is being started right now. They count as recording, and are never saved. */
  private readonly starting = new Set<string>();
  /** Lines one request is checking or saving right now. */
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
      const parsed = JSON.parse(await readFile(file, "utf8")) as { jobs?: unknown };
      if (Array.isArray(parsed?.jobs)) rows = parsed.jobs;
    } catch {
      // No file yet, or a broken one: nothing is recording.
    }
    for (const row of rows) {
      const job = readJob(row, now);
      if (job) jobs.jobs.set(job.key, job);
    }
    LOADED.set(file, jobs);
    if (jobs.jobs.size !== rows.length) await jobs.save();
    return jobs;
  }

  private idle(now: number): boolean {
    return (
      this.jobs.size === 0 && this.starting.size === 0 && this.checking.size === 0 && !this.writing && now >= this.pausedUntil
    );
  }

  /** Forget jobs started longer ago than LABS_FORGET_MS: Yoto may no longer know them, so their lines start again. */
  async prune(now: number): Promise<void> {
    let dropped = false;
    for (const job of this.jobs.values()) {
      if (now - job.startedAt <= LABS_FORGET_MS || this.checking.has(job.key)) continue;
      this.jobs.delete(job.key);
      this.checkedAt.delete(job.key);
      dropped = true;
    }
    if (dropped) await this.save();
  }

  get(key: string): LabsJob | undefined {
    return this.jobs.get(key);
  }

  /** A job is recording this line, or one is being started for it. */
  has(key: string): boolean {
    return this.jobs.has(key) || this.starting.has(key);
  }

  /** Yoto is recording this line now: its job is starting or running, not finished and waiting to be saved. */
  isRecording(key: string): boolean {
    return this.starting.has(key) || (this.jobs.has(key) && !this.jobs.get(key)?.cardId);
  }

  list(): LabsJob[] {
    return [...this.jobs.values()];
  }

  /** Jobs Yoto is still recording for this account: the ones that count against its limit. */
  recording(now: number): number {
    let count = this.starting.size;
    for (const job of this.jobs.values()) {
      if (!job.cardId && now - job.startedAt < LABS_STUCK_MS) count += 1;
    }
    return count;
  }

  /** Hold a line while its job is started, so a second request cannot start it as well. */
  reserve(key: string): boolean {
    if (this.has(key)) return false;
    this.starting.add(key);
    return true;
  }

  unreserve(key: string): void {
    this.starting.delete(key);
  }

  async started(key: string, jobId: string, now: number): Promise<void> {
    this.starting.delete(key);
    this.jobs.set(key, { key, jobId, startedAt: now });
    await this.save();
  }

  /** A job an older page started and polls itself. It is checked like any other from now on. */
  async adopt(key: string, jobId: string, now: number): Promise<void> {
    if (this.has(key) || !JOB_ID.test(jobId)) return;
    this.jobs.set(key, { key, jobId, startedAt: now });
    await this.save();
  }

  /**
   * Take a line to check its job or save its recording. False while another request has it, and, unless
   * `due` is false, when the line has no job or its job was asked about a moment ago. Give it back with
   * `release`.
   */
  claim(key: string, now: number, due = true): boolean {
    if (this.checking.has(key)) return false;
    if (due && (!this.jobs.has(key) || now - (this.checkedAt.get(key) ?? 0) < LABS_CHECK_MS)) return false;
    this.checking.add(key);
    return true;
  }

  release(key: string, now: number): void {
    this.checking.delete(key);
    if (this.jobs.has(key)) this.checkedAt.set(key, now);
  }

  /** The job finished, but its recording could not be saved yet. */
  async missed(key: string, cardId: string): Promise<number> {
    const job = this.jobs.get(key);
    if (!job) return 0;
    job.cardId = cardId;
    job.misses = (job.misses ?? 0) + 1;
    await this.save();
    return job.misses;
  }

  /** The line is saved, or its job is over: forget it. */
  async finish(key: string): Promise<void> {
    this.checkedAt.delete(key);
    if (this.jobs.delete(key)) await this.save();
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

  /** Write the file, one write at a time. A failed write is logged; the jobs are still known in memory. */
  private save(): Promise<void> {
    this.dirty = true;
    this.writing ??= (async () => {
      try {
        while (this.dirty) {
          this.dirty = false;
          const jobs = [...this.jobs.values()];
          if (jobs.length === 0) await rm(this.file, { force: true });
          else await writeJsonAtomic(this.file, { version: 1, jobs });
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

/** For tests: forget every account in memory, as a restarted server would. The files stay. */
export function dropLabsJobMemory(): void {
  MEMORY.clear();
  LOADED.clear();
}
