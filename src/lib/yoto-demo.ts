import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { audioContainer, mergeCryFirst } from "@/lib/cry-audio";
import { ensureCry } from "@/lib/yoto-fact-audio";
import { reconnectMessage, yotoErrorText } from "@/lib/yoto-error";
import { spokenForDemo } from "@/lib/voice-choice";
import { voiceOrLily } from "@/lib/yoto-icons";

export type DemoAudio = {
  audio: Buffer;
  /** True when the cry was mixed in front of the voice. */
  cryFirst: boolean;
};

type DemoRequest = {
  text?: string;
  title?: string;
  voiceId?: string;
  dexId?: number;
};

type DemoOptions = {
  speech?: string;
  merge?: (cry: Buffer, speech: Buffer) => Promise<Buffer>;
  loadCry?: (id: number) => Promise<Buffer>;
  cryTimeoutMs?: number;
  wait?: (ms: number) => Promise<void>;
  polls?: number;
};

const DEMO_ROOT = path.join(process.cwd(), "data", "demo");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function messageOf(payload: unknown, fallback: string): string {
  const text = yotoErrorText(payload, fallback);
  return reconnectMessage(text) ?? text;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function yoto(
  token: string,
  url: string,
  init: RequestInit | undefined,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  return fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}

function scratchContent(text: string, title: string, voiceId: string) {
  return {
    title: "Champdex demo",
    content: {
      chapters: [
        {
          key: "line",
          title,
          tracks: [
            {
              key: "line-1",
              title,
              trackUrl: text,
              type: "elevenlabs" as const,
              voiceId,
            },
          ],
        },
      ],
    },
    metadata: {
      description: "Temporary demo line.",
    },
  };
}

function jobFields(payload: unknown): { jobId?: string; status?: string; cardId?: string; error?: string } {
  if (!payload || typeof payload !== "object") return {};
  const row = payload as {
    jobId?: string;
    status?: string;
    error?: unknown;
    result?: { cardId?: string };
    job?: { jobId?: string; status?: string; error?: unknown; result?: { cardId?: string } };
  };
  const job = row.job ?? row;
  const error = typeof job.error === "string" ? job.error : undefined;
  return { jobId: job.jobId, status: job.status, cardId: job.result?.cardId, error };
}

function httpsAudio(payload: unknown): string {
  const row = payload as { card?: { content?: { chapters?: Array<{ tracks?: Array<{ trackUrl?: string }> }> } } };
  for (const chapter of row.card?.content?.chapters ?? []) {
    for (const track of chapter.tracks ?? []) {
      if (track.trackUrl && /^https?:\/\//.test(track.trackUrl)) return track.trackUrl;
    }
  }
  return "";
}

async function discardCard(token: string, cardId: string, fetchImpl: typeof fetch): Promise<void> {
  if (!/^[\w-]{4,80}$/.test(cardId)) return;
  try {
    await yoto(
      token,
      `https://api.yotoplay.com/content/${encodeURIComponent(cardId)}`,
      { method: "DELETE" },
      fetchImpl,
      15_000,
    );
  } catch {
    // The demo card is only a scratch recording.
  }
}

/**
 * Record one line in the selected voice and return playable audio.
 * A cry is mixed in front when this entry leads with one. If that mix does not
 * finish in time, the voice recording is returned on its own.
 */
export async function prepareDemoAudio(
  token: string,
  request: DemoRequest,
  fetchImpl: typeof fetch = fetch,
  options: DemoOptions = {},
): Promise<DemoAudio> {
  const text = spokenForDemo(request.text ?? "");
  if (!text || text.length > 3000) throw new Error("That line is empty or longer than Yoto allows.");
  const title = (request.title?.trim() || "Line").slice(0, 80);
  const voiceId = voiceOrLily(request.voiceId);
  const dexId = request.dexId;
  if (dexId != null && (!Number.isInteger(dexId) || dexId < 1 || dexId > 1025)) {
    throw new Error(`That cry is not in the national Pokédex (${String(dexId)}).`);
  }

  const speech = await recordVoice(token, text, title, voiceId, fetchImpl, options);
  if (!dexId) return { audio: speech, cryFirst: false };

  const timeoutMs = options.cryTimeoutMs ?? 12_000;
  const merge = options.merge ?? mergeCryFirst;
  const loadCry = options.loadCry ?? ((id: number) => ensureCry(id, fetchImpl));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const mix = (async () => {
    const cry = await loadCry(dexId);
    const merged = await merge(cry, speech);
    if (!audioContainer(merged) || merged.length < 128) {
      throw new Error("The cry mix was not playable audio.");
    }
    return merged;
  })();
  const timed = new Promise<Buffer>((resolve) => {
    timer = setTimeout(() => resolve(speech), timeoutMs);
  });
  try {
    const audio = await Promise.race([mix, timed]);
    return { audio, cryFirst: audio !== speech };
  } catch {
    return { audio: speech, cryFirst: false };
  } finally {
    if (timer) clearTimeout(timer);
    void mix.catch(() => undefined);
  }
}

async function recordVoice(
  token: string,
  text: string,
  title: string,
  voiceId: string,
  fetchImpl: typeof fetch,
  options: DemoOptions,
): Promise<Buffer> {
  const root = options.speech ?? DEMO_ROOT;
  const file = path.join(root, `${sha256(Buffer.from(`${voiceId}\n${text}`))}.mp3`);
  try {
    const cached = await readFile(file);
    if (audioContainer(cached) && cached.length >= 128) return cached;
  } catch {
    // Record below.
  }

  const wait = options.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const created = await yoto(
    token,
    `https://labs.api.yotoplay.com/content/job?voiceId=${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scratchContent(text, title, voiceId)),
    },
    fetchImpl,
    20_000,
  );
  const createdBody = await readJson(created);
  let fields = jobFields(createdBody);
  if (!created.ok || !fields.jobId) {
    throw new Error(fields.error || messageOf(createdBody, "Yoto did not start this line."));
  }

  const polls = options.polls ?? 20;
  for (let attempt = 0; attempt < polls && !(fields.status === "completed" && fields.cardId); attempt += 1) {
    if (fields.status === "failed") throw new Error(fields.error || "Yoto could not record this line.");
    if (attempt > 0) await wait(1000);
    const status = await yoto(
      token,
      `https://labs.api.yotoplay.com/content/job/${encodeURIComponent(fields.jobId)}`,
      undefined,
      fetchImpl,
      15_000,
    );
    const next = jobFields(await readJson(status));
    if (!status.ok) throw new Error(next.error || "Could not check this recording.");
    fields = { ...fields, ...next, jobId: next.jobId ?? fields.jobId };
  }
  if (fields.status === "failed") throw new Error(fields.error || "Yoto could not record this line.");
  if (!fields.cardId) throw new Error("This voice is still recording. Try Hear again.");

  const playable = await yoto(
    token,
    `https://api.yotoplay.com/content/${encodeURIComponent(fields.cardId)}?playable=true`,
    undefined,
    fetchImpl,
    20_000,
  );
  const playableBody = await readJson(playable);
  const source = httpsAudio(playableBody);
  if (!playable.ok || !source) {
    throw new Error(messageOf(playableBody, "This voice recording is not ready to play."));
  }
  const audioResponse = await fetchImpl(source, { signal: AbortSignal.timeout(20_000) });
  if (!audioResponse.ok) throw new Error("This voice recording could not be downloaded.");
  const audio = Buffer.from(await audioResponse.arrayBuffer());
  if (!audioContainer(audio) || audio.length < 128) throw new Error("This voice recording was not playable audio.");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, audio);
  await discardCard(token, fields.cardId, fetchImpl);
  return audio;
}
