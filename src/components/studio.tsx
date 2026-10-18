"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConnectDialog } from "@/components/connect-dialog";
import { Button } from "@/components/ui/button";
import { buildKidCard, KID_CARDS, type KidCard } from "@/lib/kid-cards";
import { speakTexts, stopSpeaking } from "@/lib/speak";
import { YOTO_VOICES } from "@/lib/yoto-icons";
import {
  ensureSession,
  writeSession,
  yotoFetch,
  type YotoSession,
} from "@/lib/yoto-session";

const SAVED_CARDS = "champdex.kidCards";

type SavedCards = Partial<Record<KidCard["id"], string>>;

type JobView = {
  status: string;
  detail: string;
};

function savedCards(): SavedCards {
  try {
    return JSON.parse(localStorage.getItem(SAVED_CARDS) ?? "{}") as SavedCards;
  } catch {
    return {};
  }
}

function rememberCard(id: KidCard["id"], cardId: string) {
  const next = { ...savedCards(), [id]: cardId };
  localStorage.setItem(SAVED_CARDS, JSON.stringify(next));
}

function messageFrom(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const row = data as {
    error?: string;
    message?: string;
    error_description?: string;
    job?: { error?: string };
  };
  return (
    row.error_description || row.message || row.error || row.job?.error || fallback
  );
}

function jobOf(data: unknown): {
  jobId?: string;
  status?: string;
  progress?: unknown;
  error?: string;
  result?: { cardId?: string; title?: string };
} | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { job?: { jobId?: string; status?: string } };
  if (row.job) return row.job;
  if ("status" in data || "jobId" in data) return data as { status?: string; jobId?: string };
  return null;
}

function progressLabel(progress: unknown): string | null {
  if (!progress) return null;
  if (typeof progress === "string") return progress;
  if (typeof progress === "object") {
    const row = progress as { completed?: number; total?: number };
    if (row.total) return `${row.completed ?? 0} of ${row.total} pictures recorded`;
  }
  return null;
}

export function Studio() {
  const [cardId, setCardId] = useState<KidCard["id"]>("meet");
  const [chapterKey, setChapterKey] = useState(KID_CARDS[0]?.chapters[0]?.key ?? "start");
  const [session, setSession] = useState<YotoSession | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [voiceId, setVoiceId] = useState<string>(YOTO_VOICES[0].id);
  const [replace, setReplace] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [linked, setLinked] = useState<SavedCards>({});
  const [ready, setReady] = useState(false);

  const card = KID_CARDS.find((item) => item.id === cardId) ?? KID_CARDS[0];
  const chapter =
    card?.chapters.find((item) => item.key === chapterKey) ?? card?.chapters[0];

  useEffect(() => {
    let cancelled = false;
    void ensureSession().then((next) => {
      if (cancelled) return;
      setSession(next);
      setLinked(savedCards());
      setReady(true);
    });
    const loadVoices = () => window.speechSynthesis?.getVoices();
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => {
      cancelled = true;
      stopSpeaking();
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  function chooseCard(next: KidCard) {
    stopSpeaking();
    setSpeaking(false);
    setCardId(next.id);
    setChapterKey(next.chapters[0]?.key ?? "start");
    setJob(null);
  }

  function hear() {
    if (!chapter) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speakTexts(
      chapter.tracks.map((track) => track.text),
      () => setSpeaking(false),
    );
  }

  async function send() {
    if (!card) return;
    const live = (await ensureSession()) ?? session;
    if (!live) {
      setConnectOpen(true);
      toast("Connect Yoto first. Your child will not need this page.");
      return;
    }
    setSession(live);
    setSending(true);
    setJob({ status: "sending", detail: "Sending the script to Yoto…" });
    try {
      const previous = savedCards()[card.id];
      const content = buildKidCard(
        card,
        replace && previous ? previous : undefined,
      );
      const response = await yotoFetch("/api/yoto/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, content }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(messageFrom(payload, "Yoto did not accept this card."));
      }
      const created = jobOf(payload);
      if (!created?.jobId) {
        throw new Error("Yoto did not start a recording job.");
      }
      const finished = await pollJob(created.jobId);
      const newId = finished.result?.cardId ?? previous;
      if (newId) {
        rememberCard(card.id, newId);
        setLinked(savedCards());
      }
      setJob({
        status: "completed",
        detail: "The recording is in your Yoto library.",
      });
      toast.success(`${card.libraryTitle} is ready to link to a blank card.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The recording stopped.";
      setJob({ status: "failed", detail });
      toast.error(detail);
    } finally {
      setSending(false);
    }
  }

  async function pollJob(id: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const response = await yotoFetch(`/api/yoto/job/${id}`);
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(messageFrom(payload, "Could not check the recording."));
      }
      const current = jobOf(payload);
      if (!current) throw new Error("Yoto sent back a recording Yoto could not read.");
      const detail =
        progressLabel(current.progress) ??
        (current.status === "queued"
          ? "Waiting for a voice…"
          : "Yoto is recording the pictures…");
      setJob({ status: current.status ?? "processing", detail });
      if (current.status === "completed") return current;
      if (current.status === "failed") {
        throw new Error(current.error || "Yoto could not finish the recording.");
      }
    }
    throw new Error("Yoto is still recording. Check Make Your Own in the Yoto app in a minute.");
  }

  function disconnect() {
    writeSession(null);
    setSession(null);
    toast("Disconnected. Cards already in your library stay there.");
  }

  const previousId = card ? linked[card.id] : undefined;

  return (
    <div className="min-h-dvh bg-[radial-gradient(900px_420px_at_0%_-10%,rgba(198,161,91,0.18),transparent_55%),radial-gradient(700px_380px_at_100%_0%,rgba(214,69,50,0.14),transparent_50%),#14110e] text-[#f4efe4]">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-medium tracking-[0.18em] text-[#c6a15b] uppercase">
            For the Yoto player
          </p>
          <h1 className="font-display mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
            Champdex
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#cbbfa8] sm:text-base">
            Three spoken cards for a seven-year-old. They put a card in the
            player, turn to a picture, and press play. This page is only for you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session ? (
            <>
              <span className="rounded-full border border-white/15 px-3 py-1 text-sm">
                {session.name ? `Yoto · ${session.name}` : "Yoto connected"}
              </span>
              <Button variant="outline" onClick={disconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button className="h-10 px-4" onClick={() => setConnectOpen(true)}>
              Connect Yoto
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-16 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {KID_CARDS.map((item) => {
            const selected = item.id === card?.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseCard(item)}
                aria-pressed={selected}
                className={`rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-[#c6a15b] bg-[#2a231c]"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl">{item.title}</span>
                  {item.recommended ? (
                    <span className="rounded-full bg-[#d64532] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                      Start here
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm leading-5 text-[#cbbfa8]">
                  {item.blurb}
                </span>
              </button>
            );
          })}
        </div>

        {card && chapter ? (
          <section className="rounded-[28px] bg-[#f3ecdf] p-4 text-[#1d1814] sm:p-6">
            <p className="text-xs font-semibold tracking-[0.16em] text-[#8a5a22] uppercase">
              What your child does
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5c5146]">
              {card.childDoes}
            </p>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {card.chapters.map((item) => {
                const selected = item.key === chapter.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      stopSpeaking();
                      setSpeaking(false);
                      setChapterKey(item.key);
                    }}
                    aria-pressed={selected}
                    className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center ${
                      selected
                        ? "border-[#1d1814] bg-white"
                        : "border-[#1d1814]/10 bg-[#e7decd]"
                    }`}
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-[#14110e] text-lg text-[#f4efe4]">
                      {item.mark}
                    </span>
                    <span className="text-[11px] leading-4 font-medium">{item.title}</span>
                    <span className="text-[10px] text-[#6d6256]">{item.overlay}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-[#8a5a22] uppercase">
                  On the player: {chapter.picture}
                </p>
                <h2 className="font-display mt-1 text-3xl">{chapter.title}</h2>
                <div className="mt-3 grid gap-3">
                  {chapter.tracks.map((track, index) => (
                    <p
                      key={track.key}
                      className="font-display text-lg leading-8 text-[#2a241c]"
                    >
                      {chapter.tracks.length > 1 ? (
                        <span className="mr-2 text-sm font-sans font-semibold tracking-wide text-[#8a5a22] uppercase">
                          {index === 0 ? "First" : "Then"}
                        </span>
                      ) : null}
                      {track.text}
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-10 bg-white" onClick={hear}>
                    {speaking ? "Stop preview" : "Hear this picture"}
                  </Button>
                </div>
              </div>

              <aside className="rounded-2xl bg-[#1d1814] p-4 text-[#f4efe4]">
                <h3 className="font-display text-xl">Send {card.title}</h3>
                <p className="mt-1 text-sm leading-5 text-[#cbbfa8]">
                  Yoto records the words, then you link the playlist to a blank card in the Yoto app.
                </p>
                <label className="mt-3 grid gap-1 text-sm" htmlFor="voice">
                  Voice
                  <select
                    id="voice"
                    value={voiceId}
                    onChange={(event) => setVoiceId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-white/15 bg-black/30 px-2"
                  >
                    {YOTO_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs leading-5 text-[#cbbfa8]">
                    {YOTO_VOICES.find((voice) => voice.id === voiceId)?.note}
                  </span>
                </label>
                {previousId ? (
                  <label className="mt-3 flex items-start gap-2 text-sm leading-5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={replace}
                      onChange={(event) => setReplace(event.target.checked)}
                    />
                    Replace the {card.title} card already in your library.
                  </label>
                ) : null}
                <Button
                  type="button"
                  className="mt-4 h-11 w-full"
                  disabled={sending || !ready}
                  onClick={() => void send()}
                >
                  {sending ? "Recording…" : `Send ${card.title} to Yoto`}
                </Button>
                {job ? (
                  <p
                    className={`mt-3 text-sm leading-5 ${
                      job.status === "failed" ? "text-[#ffb4a8]" : "text-[#c6a15b]"
                    }`}
                    role="status"
                  >
                    {job.detail}
                  </p>
                ) : null}
                {job?.status === "completed" ? (
                  <ol className="mt-3 grid list-decimal gap-2 pl-4 text-sm leading-5 text-[#f4efe4]">
                    <li>Open the Yoto app and go to Make Your Own.</li>
                    <li>Find {card.libraryTitle}.</li>
                    <li>Choose Link to a card.</li>
                    <li>Put a blank Make Your Own card in the player when it asks.</li>
                    <li>Hand that card to your child. They do not need this page.</li>
                  </ol>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-[#cbbfa8]">
                    One blank card is enough. Link Meet Them first.
                  </p>
                )}
              </aside>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs leading-5 text-[#8d8272]">
        Unofficial fan cards for your own Yoto library. Not made by Nintendo, Game Freak,
        Creatures, or Yoto. Pokémon names are theirs. The words are written for a
        seven-year-old to hear on a player.
      </footer>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
