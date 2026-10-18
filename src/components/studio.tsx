"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConnectDialog } from "@/components/connect-dialog";
import { Button } from "@/components/ui/button";
import { buildKidCard, trackSpeech, type KidCard } from "@/lib/kid-cards";
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

function playableChapters(card: KidCard) {
  return card.chapters.filter((chapter) => chapter.key !== "start");
}

function entryLines(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^This is .+\.$/.test(line) && !/^It is number \d+\.$/.test(line));
}

function isMeasure(line: string): boolean {
  return /weighs|centimetres tall/.test(line);
}

export function Studio({ cards }: { cards: KidCard[] }) {
  const [cardId, setCardId] = useState<KidCard["id"]>("meet");
  const [chapterKey, setChapterKey] = useState("bulbasaur");
  const [revealed, setRevealed] = useState(false);
  const [session, setSession] = useState<YotoSession | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [voiceId, setVoiceId] = useState<string>(YOTO_VOICES[0].id);
  const [replace, setReplace] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [linked, setLinked] = useState<SavedCards>({});
  const [ready, setReady] = useState(false);

  const card = cards.find((item) => item.id === cardId) ?? cards[0];
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
    setRevealed(false);
    setCardId(next.id);
    setChapterKey(playableChapters(next)[0]?.key ?? "start");
    setJob(null);
  }

  function chooseChapter(key: string) {
    stopSpeaking();
    setSpeaking(false);
    setRevealed(false);
    setChapterKey(key);
  }

  function hear(texts: string[]) {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speakTexts(texts, () => setSpeaking(false));
  }

  function revealAnswer() {
    if (!chapter) return;
    setRevealed(true);
    const answer = chapter.tracks[1] ? trackSpeech(chapter.tracks[1]) : undefined;
    if (!answer) return;
    stopSpeaking();
    setSpeaking(true);
    speakTexts([answer], () => setSpeaking(false));
  }

  function anotherRiddle() {
    if (!card) return;
    const rounds = playableChapters(card);
    const index = rounds.findIndex((item) => item.key === chapter?.key);
    const next = rounds[(index + 1) % rounds.length];
    if (next) chooseChapter(next.key);
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

  const visibleTracks =
    card?.id === "guess" && !revealed ? chapter?.tracks.slice(0, 1) : chapter?.tracks;
  const source = visibleTracks?.find((track) => track.source)?.source;

  return (
    <div className="min-h-dvh bg-[#f4efe6] text-[#1c1916]">
      <header className="mx-auto w-full max-w-5xl px-4 pt-6 pb-2 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-[#8a5a22] uppercase">
              Champdex
            </p>
            <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {card?.id === "guess" ? "Guess Who" : "Pokémon facts"}
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#5c5348]">
              {card?.id === "guess"
                ? "Three clues. Guess the Pokémon. Then hear if you were right."
                : "Name, type, the Pokédex entry, the weight, and the height."}
            </p>
          </div>
          {session ? (
            <button
              type="button"
              className="self-start text-sm text-[#5c5348] underline sm:self-auto"
              onClick={disconnect}
            >
              {session.name ? `Yoto · ${session.name}` : "Yoto connected"}
            </button>
          ) : (
            <button
              type="button"
              className="self-start text-sm text-[#5c5348] underline sm:self-auto"
              onClick={() => setConnectOpen(true)}
            >
              Put this on a Yoto card
            </button>
          )}
        </div>
        <div className="mt-4 flex gap-2" role="tablist" aria-label="Play mode">
          {cards.map((item) => {
            const selected = item.id === card?.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => chooseCard(item)}
                className={`h-10 rounded-full px-4 text-sm font-medium ${
                  selected ? "bg-[#1c1916] text-[#f4efe6]" : "bg-white text-[#1c1916]"
                }`}
              >
                {item.id === "meet" ? "Facts" : "Guess Who"}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)]">
        {card && chapter ? (
          <>
            <nav aria-label={card.id === "guess" ? "Riddles" : "Pokémon"} className="grid content-start grid-cols-3 gap-2 self-start md:grid-cols-1">
              {playableChapters(card).map((item) => {
                const selected = item.key === chapter.key;
                const label = card.id === "guess" ? `Riddle ${item.overlay}` : item.title;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => chooseChapter(item.key)}
                    aria-current={selected ? "true" : undefined}
                    className={`rounded-xl px-2.5 py-2.5 text-left text-sm font-medium ${
                      selected
                        ? "bg-[#1c1916] text-[#f4efe6]"
                        : "bg-white text-[#1c1916] hover:bg-white/70"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            <div className="min-w-0">
              <article className="rounded-2xl bg-white px-5 py-6 sm:px-8 sm:py-8">
                <p className="text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">
                  {card.id === "guess"
                    ? revealed
                      ? "Answer"
                      : "Three clues"
                    : `Number ${chapter.overlay}`}
                </p>
                <h2 className="font-display mt-1 text-4xl leading-tight sm:text-5xl">
                  {card.id === "guess" && !revealed ? `Riddle ${chapter.overlay}` : chapter.title}
                </h2>
                <div className="mt-6 max-w-prose space-y-3 text-base leading-7 text-[#2a241c]">
                  {visibleTracks?.map((track) =>
                    entryLines(track.text).map((line) =>
                      isMeasure(line) ? (
                        <p
                          key={`${track.key}-${line}`}
                          className="rounded-xl bg-[#f4efe6] px-4 py-3 font-medium"
                        >
                          {line}
                        </p>
                      ) : (
                        <p key={`${track.key}-${line}`}>{line}</p>
                      ),
                    ),
                  )}
                </div>
                {source ? (
                  <p className="mt-4 text-xs text-[#8d8272]">Pokédex, {source}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-2">
                  {card.id === "guess" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 border-[#1c1916]/15 bg-white px-4 text-[#1c1916]"
                        onClick={() => {
                          const track = revealed ? chapter.tracks[1] : chapter.tracks[0];
                          if (track) hear([trackSpeech(track)]);
                        }}
                      >
                        {speaking ? "Stop" : revealed ? "Hear the answer" : "Hear the clues"}
                      </Button>
                      {revealed ? (
                        <Button type="button" className="h-11 px-4" onClick={anotherRiddle}>
                          Another riddle
                        </Button>
                      ) : (
                        <Button type="button" className="h-11 px-4" onClick={revealAnswer}>
                          I guessed
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      type="button"
                      className="h-11 px-5"
                      onClick={() => hear(chapter.tracks.map((track) => trackSpeech(track)))}
                    >
                      {speaking ? "Stop" : "Hear the entry"}
                    </Button>
                  )}
                </div>
              </article>

              <details className="mt-4 rounded-2xl border border-[#1c1916]/10 bg-white px-5 py-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Put {card.title === "Facts" ? "these facts" : "Guess Who"} on a Yoto card
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#5c5348]">
                  {card.childDoes} Yoto records the words. Then you link the playlist to a blank card in the Yoto app.
                </p>
                <label className="mt-3 grid gap-1 text-sm" htmlFor="voice">
                  Voice
                  <select
                    id="voice"
                    value={voiceId}
                    onChange={(event) => setVoiceId(event.target.value)}
                    className="h-10 w-full max-w-sm rounded-lg border border-[#1c1916]/15 bg-white px-2"
                  >
                    {YOTO_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs leading-5 text-[#5c5348]">
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
                  className="mt-4 h-11 px-4"
                  disabled={sending || !ready}
                  onClick={() => void send()}
                >
                  {sending ? "Recording…" : `Send ${card.title} to Yoto`}
                </Button>
                {job ? (
                  <p
                    className={`mt-3 text-sm leading-6 ${
                      job.status === "failed" ? "text-[#9f2d22]" : "text-[#8a5a22]"
                    }`}
                    role="status"
                  >
                    {job.detail}
                  </p>
                ) : null}
                {job?.status === "completed" ? (
                  <ol className="mt-3 grid list-decimal gap-2 pl-4 text-sm leading-6">
                    <li>Open the Yoto app and go to Make Your Own.</li>
                    <li>Find {card.libraryTitle}.</li>
                    <li>Choose Link to a card.</li>
                    <li>Put a blank Make Your Own card in the player when it asks.</li>
                    <li>Hand that card to your child. They do not need this page.</li>
                  </ol>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-[#5c5348]">
                    Facts and Guess Who are two cards. Link each one to its own blank card.
                  </p>
                )}
              </details>
            </div>
          </>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs leading-5 text-[#8d8272] sm:px-6">
        Unofficial fan cards for your own Yoto library. Not made by Nintendo, Game Freak,
        Creatures, or Yoto. Pokémon names are theirs. The words are written for ages 8 to 12.
      </footer>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
