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

function playableChapters(card: KidCard) {
  return card.chapters.filter((chapter) => chapter.key !== "start");
}

export function Studio() {
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
    const answer = chapter.tracks[1]?.text;
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

  return (
    <div className="min-h-dvh bg-[radial-gradient(900px_420px_at_0%_-10%,rgba(198,161,91,0.18),transparent_55%),radial-gradient(700px_380px_at_100%_0%,rgba(214,69,50,0.14),transparent_50%),#14110e] text-[#f4efe4]">
      <header className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-[#c6a15b] uppercase">
            Champdex
          </p>
          <h1 className="font-display mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
            {card?.id === "guess" ? "Guess Who" : "Pokémon facts"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#cbbfa8] sm:text-base">
            {card?.id === "guess"
              ? "Three clues. Guess the Pokémon. Then hear if you were right."
              : "Pick a Pokémon and hear one fact."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Play mode">
          {KID_CARDS.map((item) => {
            const selected = item.id === card?.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => chooseCard(item)}
                className={`h-11 rounded-full px-5 text-sm font-medium ${
                  selected ? "bg-[#d64532] text-white" : "bg-white/10 text-[#f4efe4]"
                }`}
              >
                {item.id === "meet" ? "Facts" : "Guess Who"}
              </button>
            );
          })}
          <span className="ml-auto">
            {session ? (
              <button type="button" className="text-sm text-[#cbbfa8] underline" onClick={disconnect}>
                {session.name ? `Yoto · ${session.name}` : "Yoto connected"}
              </button>
            ) : (
              <button
                type="button"
                className="text-sm text-[#cbbfa8] underline"
                onClick={() => setConnectOpen(true)}
              >
                Put this on a Yoto card
              </button>
            )}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-16">
        {card && chapter ? (
          <section className="rounded-[28px] bg-[#f3ecdf] p-4 text-[#1d1814] sm:p-6">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {playableChapters(card).map((item) => {
                const selected = item.key === chapter.key;
                const guessLabel = card.id === "guess";
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => chooseChapter(item.key)}
                    aria-pressed={selected}
                    className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center ${
                      selected
                        ? "border-[#1d1814] bg-white"
                        : "border-[#1d1814]/10 bg-[#e7decd]"
                    }`}
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-[#14110e] text-lg text-[#f4efe4]">
                      {guessLabel && !selected ? "?" : item.mark}
                    </span>
                    <span className="text-[11px] leading-4 font-medium">
                      {guessLabel ? `Riddle ${item.overlay}` : item.title}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold tracking-[0.16em] text-[#8a5a22] uppercase">
                {card.id === "guess"
                  ? revealed
                    ? chapter.picture
                    : "Three clues"
                  : chapter.picture}
              </p>
              <h2 className="font-display mt-1 text-4xl">
                {card.id === "guess" && !revealed
                  ? `Riddle ${chapter.overlay}`
                  : chapter.title}
              </h2>
              <div className="mt-3 grid gap-3">
                {(card.id === "guess" && !revealed
                  ? chapter.tracks.slice(0, 1)
                  : chapter.tracks
                ).map((track) => (
                  <p
                    key={track.key}
                    className="font-display text-lg leading-8 text-[#2a241c]"
                  >
                    {track.text}
                  </p>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {card.id === "guess" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 bg-white"
                      onClick={() =>
                        hear([
                          (revealed ? chapter.tracks[1] : chapter.tracks[0])?.text ?? "",
                        ])
                      }
                    >
                      {speaking ? "Stop" : revealed ? "Hear the answer" : "Hear the clues"}
                    </Button>
                    {revealed ? (
                      <Button type="button" className="h-10" onClick={anotherRiddle}>
                        Another riddle
                      </Button>
                    ) : (
                      <Button type="button" className="h-10" onClick={revealAnswer}>
                        I guessed
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    type="button"
                    className="h-10"
                    onClick={() => hear(chapter.tracks.map((track) => track.text))}
                  >
                    {speaking ? "Stop" : "Hear the fact"}
                  </Button>
                )}
              </div>
            </div>

            <details className="mt-6 rounded-2xl bg-[#1d1814] p-4 text-[#f4efe4]">
              <summary className="cursor-pointer text-sm font-medium">
                Put {card.title === "Facts" ? "these facts" : "Guess Who"} on a Yoto card
              </summary>
              <p className="mt-3 text-sm leading-5 text-[#cbbfa8]">
                {card.childDoes} Yoto records the words. Then you link the playlist to a blank card in the Yoto app.
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
                    Facts and Guess Who are two cards. Link each one to its own blank card.
                  </p>
                )}
            </details>
          </section>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs leading-5 text-[#8d8272]">
        Unofficial fan cards for your own Yoto library. Not made by Nintendo, Game Freak,
        Creatures, or Yoto. Pokémon names are theirs. The words are written for a
        ages 8 to 12 to hear on a player.
      </footer>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
