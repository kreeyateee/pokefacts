"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ConnectDialog } from "@/components/connect-dialog";
import { RADIO_SUMMARY } from "@/lib/radio/radio-feed";
import { ensureSession, yotoFetch } from "@/lib/yoto-session";

type Episode = { date: string; title: string; description: string; seconds: number; audio: string };

function minutes(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds / 60));
  return whole === 1 ? "1 minute" : `${whole} minutes`;
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The podcast feed's address on this site. */
function useFeedUrl(): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => `${window.location.origin}/radio/feed.xml`,
    () => "https://pokefacts.online/radio/feed.xml",
  );
}

export function RadioPage() {
  const feedUrl = useFeedUrl();
  const recorder = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash === "#record",
    () => false,
  );
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/radio/episodes")
      .then((response) => response.json() as Promise<{ episodes?: Episode[] }>)
      .then((payload) => {
        if (!cancelled) setEpisodes(payload.episodes ?? []);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyFeed(field: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      field?.select();
    }
  }

  return (
    <section className="pk-card mx-auto max-w-3xl px-5 py-6 sm:px-8">
      <h1 className="font-display text-3xl leading-tight text-balance sm:text-4xl">Pokefacts Radio</h1>
      <p className="mt-2 text-base leading-7">{RADIO_SUMMARY}</p>
      <p className="mt-2 text-sm leading-6">A new episode every day, a few minutes long.</p>

      <h2 className="pk-kicker mt-6">Listen in a podcast app</h2>
      <p className="mt-2 text-base leading-7">Copy this address, then add it to your podcast app.</p>
      <FeedField url={feedUrl} copied={copied} onCopy={copyFeed} />
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
        <li>
          <span className="font-bold">Apple Podcasts (iPhone):</span> Library, then the ••• button, then Follow a
          Show by URL.
        </li>
        <li>
          <span className="font-bold">Pocket Casts:</span> paste the address into Search.
        </li>
        <li>
          <span className="font-bold">AntennaPod, Overcast and most others:</span> Add podcast, then add by URL or
          RSS.
        </li>
        <li>Spotify cannot follow a show by its address.</li>
      </ul>

      <h2 className="pk-kicker mt-6">Episodes</h2>
      {episodes === null ? (
        <p className="mt-2 text-sm">Loading…</p>
      ) : episodes.length === 0 ? (
        <p className="mt-2 text-sm leading-6">The first episode is on its way. Check back soon.</p>
      ) : (
        <ol className="mt-3 grid gap-4">
          {episodes.slice(0, 14).map((episode) => (
            <li key={episode.date} className="rounded-xl border-2 border-ink/20 bg-white px-3 py-3">
              <p className="font-bold">{episode.title}</p>
              <p className="mt-1 text-sm leading-6">
                {episode.description} {minutes(episode.seconds)}.
              </p>
              <audio className="mt-2 w-full" controls preload="none" src={episode.audio}>
                <a href={episode.audio}>Download the episode</a>
              </audio>
            </li>
          ))}
        </ol>
      )}

      {recorder ? <HostRecorder /> : null}
    </section>
  );
}

function FeedField({
  url,
  copied,
  onCopy,
}: {
  url: string;
  copied: boolean;
  onCopy: (field: HTMLInputElement | null) => void;
}) {
  const [field, setField] = useState<HTMLInputElement | null>(null);
  return (
    <div className="mt-2 flex min-w-0 flex-wrap gap-2">
      <input
        ref={setField}
        readOnly
        value={url}
        aria-label="Podcast feed address"
        className="pk-field min-w-0 flex-1 font-mono text-sm"
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button type="button" className="h-11 px-5" onClick={() => onCopy(field)}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

type VoiceRow = { id: string; name: string; saved: string[] };

const STEP_WAIT_MS = 3_000;
const MAX_STEPS = 40;

/**
 * Hidden on /radio#record: records the host's lines in the chosen Yoto voices with your own Yoto login.
 * Each line is recorded once and kept; the radio uses a voice as host once it has every line.
 */
function HostRecorder() {
  const [lines, setLines] = useState<string[]>([]);
  const [voices, setVoices] = useState<VoiceRow[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/radio/line")
      .then((response) => response.json() as Promise<{ lines?: string[]; voices?: VoiceRow[] }>)
      .then((payload) => {
        if (cancelled) return;
        setLines(payload.lines ?? []);
        setVoices(payload.voices ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function recordLine(line: string, voiceId: string): Promise<void> {
    let speechJobId: string | undefined;
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const response = await yotoFetch("/api/radio/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line, voiceId, speechJobId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        phase?: string;
        speechJobId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Yoto did not record this line.");
      if (payload.phase === "saved") return;
      speechJobId = payload.speechJobId;
      await new Promise((resolve) => window.setTimeout(resolve, STEP_WAIT_MS));
    }
    throw new Error("Yoto took too long to record this line.");
  }

  async function recordMissing() {
    if (!(await ensureSession())) {
      setConnectOpen(true);
      return;
    }
    setBusy(true);
    try {
      for (const voice of voices.filter((row) => chosen.includes(row.id))) {
        for (const line of lines.filter((id) => !voice.saved.includes(id))) {
          setStatus(`Recording the ${line} line in ${voice.name}…`);
          await recordLine(line, voice.id);
        }
      }
      setStatus("Done. Those voices can now host the radio.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "That did not record.");
    } finally {
      setBusy(false);
      setRefresh((value) => value + 1);
    }
  }

  return (
    <div className="mt-8 rounded-xl border-2 border-dashed border-ink/30 px-4 py-4">
      <h2 className="pk-kicker">Record the host lines</h2>
      <p className="mt-2 text-sm leading-6">
        Pick the voices to host the radio. Each line is recorded once with your Yoto login, then kept.
      </p>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {voices.map((voice) => {
          const complete = lines.length > 0 && lines.every((id) => voice.saved.includes(id));
          return (
            <li key={voice.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={busy || complete}
                  checked={complete || chosen.includes(voice.id)}
                  onChange={(event) =>
                    setChosen((current) =>
                      event.target.checked ? [...current, voice.id] : current.filter((id) => id !== voice.id),
                    )
                  }
                />
                <span className="font-bold">{voice.name}</span>
                <span className="text-xs">
                  {complete ? "ready" : `${voice.saved.length} of ${lines.length} lines`}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button type="button" className="mt-3 h-11 px-5" disabled={busy || chosen.length === 0} onClick={() => void recordMissing()}>
        {busy ? "Recording…" : "Record missing lines"}
      </Button>
      {status ? (
        <p className="mt-2 text-sm leading-6" role="status">
          {status}
        </p>
      ) : null}
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
