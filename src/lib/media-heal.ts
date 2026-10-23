import { tracksUsingMedia } from "@/lib/pending-send";
import { MEDIA_EXPIRED, missingMediaHashes, missingMediaText, SendFailure } from "@/lib/yoto-error";
import type { FinishedAudio } from "@/lib/yoto-send";

/**
 * Yoto can turn a playlist away because a recording it was given earlier is gone ("Media file not found").
 * The page then forgets those cached uploads on the server, prepares just those tracks again (the server
 * uploads the kept .mp3 to this account) and posts the playlist again. At most this many times.
 */
export const MEDIA_HEAL_ROUNDS = 2;

export class MissingMediaError extends Error {
  readonly hashes: string[];

  constructor(hashes: string[]) {
    super(missingMediaText(hashes.length));
    this.name = "MissingMediaError";
    this.hashes = hashes;
  }
}

/** The job route's 409 `{ missingMedia }`, or Yoto's own words, as an error naming every lost hash. */
export function missingMediaError(status: number, payload: unknown): MissingMediaError | undefined {
  if (status >= 200 && status < 300) return undefined;
  const hashes = missingMediaHashes(payload);
  return hashes.length > 0 ? new MissingMediaError(hashes) : undefined;
}

/** Progress text while those tracks are uploaded again. */
export function healingText(count: number): string {
  return count === 1
    ? "Re-uploading 1 recording Yoto had lost…"
    : `Re-uploading ${count} recordings Yoto had lost…`;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Ask the server to forget its cached yoto:# for these hashes, so the next prepare uploads again. */
export async function forgetMissingMedia(hashes: readonly string[], fetcher: Fetcher): Promise<void> {
  const response = await fetcher("/api/yoto/forget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn("Pokefacts could not forget the lost recordings.", response.status, detail);
    throw new SendFailure(MEDIA_EXPIRED, false);
  }
}

/**
 * Post the playlist; when Yoto says recordings are missing, drop those tracks, prepare them again and
 * post again. Gives up after `rounds` heals with one plain sentence, never Yoto's raw reply.
 */
export async function postWithMediaHeal<T>(input: {
  audio: Record<string, FinishedAudio>;
  post: (audio: Record<string, FinishedAudio>) => Promise<T>;
  forget: (hashes: string[]) => Promise<void>;
  /** Prepare `keys` again. `kept` is every other finished track. Returns the full set. */
  redo: (keys: string[], kept: Record<string, FinishedAudio>) => Promise<Record<string, FinishedAudio>>;
  /** Called before a heal round: drop `keys` from the saved send and say what is happening. */
  onHeal?: (keys: string[], round: number) => void;
  rounds?: number;
}): Promise<T> {
  const rounds = input.rounds ?? MEDIA_HEAL_ROUNDS;
  let audio = input.audio;
  for (let round = 0; ; round += 1) {
    try {
      return await input.post(audio);
    } catch (error) {
      if (!(error instanceof MissingMediaError)) throw error;
      console.warn("Yoto no longer has these recordings:", error.hashes);
      const keys = tracksUsingMedia(audio, error.hashes);
      // A hash on none of our tracks (an older track on the playlist being added to) cannot be uploaded again.
      if (round >= rounds || keys.length === 0) throw new SendFailure(MEDIA_EXPIRED, false);
      input.onHeal?.(keys, round + 1);
      try {
        await input.forget(error.hashes);
      } catch (forgetError) {
        console.warn("Forgetting the lost recordings failed.", forgetError);
        throw new SendFailure(MEDIA_EXPIRED, false);
      }
      const kept = { ...audio };
      for (const key of keys) delete kept[key];
      audio = await input.redo(keys, kept);
    }
  }
}
