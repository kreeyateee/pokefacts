"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Catalogue } from "@/components/catalogue";
import { ConnectDialog } from "@/components/connect-dialog";
import { Button } from "@/components/ui/button";
import {
  applyUploadedPixels,
  buildKidCard,
  factPoolFromCards,
  mulberry32,
  pokedexUpload,
  RANDOM_POKEDEX_ID,
  randomPokedexCard,
  trackSpeech,
  type KidCard,
  type KidCardKind,
} from "@/lib/kid-cards";
import { speakTexts, stopSpeaking } from "@/lib/speak";
import { YOTO_VOICES } from "@/lib/yoto-icons";
import {
  ensureSession,
  writeSession,
  yotoFetch,
  type YotoSession,
} from "@/lib/yoto-session";

const SAVED_CARDS = "champdex.kidCards";

type SavedCards = Partial<Record<string, string>>;

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

function rememberCard(id: string, cardId: string) {
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

async function uploadPixels(card: KidCard): Promise<Record<number, string>> {
  const media: Record<number, string> = {};
  for (const chapter of card.chapters) {
    if (!chapter.dexId) continue;
    const response = await yotoFetch(`/api/yoto/icon?id=${chapter.dexId}`, { method: "POST" });
    const payload = (await response.json()) as { mediaId?: string; error?: string };
    if (!response.ok || !payload.mediaId) {
      throw new Error(payload.error || "Yoto did not take the 16×16 picture.");
    }
    media[chapter.dexId] = payload.mediaId;
  }
  return media;
}

function entryLines(text: string, title: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        line !== `${title}.` &&
        !/^It is number \d+\.$/.test(line),
    );
}

function isMeasure(line: string): boolean {
  return /weighs|centimetres tall/.test(line);
}

function firstCard(cards: KidCard[], kind: KidCardKind): KidCard | undefined {
  return cards.find((card) => card.kind === kind);
}

export function Studio({ cards }: { cards: KidCard[] }) {
  const factsCards = cards.filter((card) => card.kind === "meet");
  const guessCards = cards.filter((card) => card.kind === "guess");
  const factPool = factPoolFromCards(cards);
  const [randomCard, setRandomCard] = useState(() => randomPokedexCard(factPool, mulberry32(20261018)));
  const [view, setView] = useState<"cards" | "catalogue">("cards");
  const [kind, setKind] = useState<KidCardKind>("meet");
  const [factsId, setFactsId] = useState(RANDOM_POKEDEX_ID);
  const [guessId, setGuessId] = useState(firstCard(cards, "guess")?.id ?? "");
  const [chapterKey, setChapterKey] = useState(randomCard.chapters[0]?.key ?? "start");
  const [query, setQuery] = useState("");
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
  const clipRef = useRef<HTMLAudioElement | null>(null);

  const cardId = kind === "meet" ? factsId : guessId;
  const card =
    cardId === RANDOM_POKEDEX_ID
      ? randomCard
      : (cards.find((item) => item.id === cardId) ?? cards.find((item) => item.kind === kind));
  const randomFacts = card?.id === RANDOM_POKEDEX_ID;
  const chapter =
    card?.chapters.find((item) => item.key === chapterKey) ??
    (card ? playableChapters(card)[0] : undefined);
  const rangeCards = kind === "meet" ? [randomCard, ...factsCards] : guessCards;
  const listed = (card ? playableChapters(card) : []).filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    if (card?.kind === "guess") return item.overlay.includes(needle);
    return item.title.toLowerCase().includes(needle) || item.overlay === needle;
  });

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
      clipRef.current?.pause();
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  function stopClip() {
    clipRef.current?.pause();
    clipRef.current = null;
  }

  function chooseCard(next: KidCard) {
    stopSpeaking();
    stopClip();
    setSpeaking(false);
    setRevealed(false);
    setQuery("");
    setKind(next.kind);
    if (next.kind === "meet") setFactsId(next.id);
    else setGuessId(next.id);
    setChapterKey(playableChapters(next)[0]?.key ?? "start");
    setJob(null);
  }

  function showKind(nextKind: KidCardKind) {
    stopSpeaking();
    stopClip();
    setSpeaking(false);
    setRevealed(false);
    setView("cards");
    setKind(nextKind);
    const id = nextKind === "meet" ? factsId : guessId;
    const next =
      id === RANDOM_POKEDEX_ID
        ? randomCard
        : (cards.find((item) => item.id === id) ?? firstCard(cards, nextKind));
    if (!next) return;
    if (!next.chapters.some((item) => item.key === chapterKey && item.key !== "start")) {
      setChapterKey(playableChapters(next)[0]?.key ?? "start");
    }
  }

  function shufflePokedex() {
    const next = randomPokedexCard(factPool);
    stopSpeaking();
    stopClip();
    setSpeaking(false);
    setRevealed(false);
    setQuery("");
    setKind("meet");
    setView("cards");
    setFactsId(RANDOM_POKEDEX_ID);
    setRandomCard(next);
    setChapterKey(next.chapters[0]?.key ?? "start");
    setJob(null);
  }

  function chooseChapter(key: string) {
    stopSpeaking();
    stopClip();
    setSpeaking(false);
    setRevealed(false);
    setChapterKey(key);
  }

  function hear(texts: string[]) {
    if (speaking) {
      stopSpeaking();
      stopClip();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speakTexts(texts, () => setSpeaking(false));
  }

  function hearFact(src: string, texts: string[]) {
    if (speaking) {
      stopSpeaking();
      stopClip();
      setSpeaking(false);
      return;
    }
    const audio = new Audio(src);
    clipRef.current = audio;
    setSpeaking(true);
    let fellBack = false;
    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      clipRef.current = null;
      speakTexts(texts, () => setSpeaking(false));
    };
    audio.onended = () => setSpeaking(false);
    audio.onerror = fallback;
    void audio.play().catch(fallback);
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
    setJob({ status: "sending", detail: `Sending ${card.rangeLabel} to Yoto…` });
    try {
      setJob({ status: "sending", detail: "Uploading the 16×16 pictures for this card…" });
      const previous = savedCards()[card.id];
      const savedId = replace && previous ? previous : undefined;
      const pixels = await uploadPixels(card);
      const upload = randomFacts
        ? pokedexUpload(card, pixels, savedId)
        : {
            voiceId,
            content: buildKidCard(applyUploadedPixels(card, pixels), savedId),
          };
      const response = await yotoFetch("/api/yoto/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upload),
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
        detail: `${card.rangeLabel} is in your Yoto library.`,
      });
      toast.success(`${card.libraryTitle} is ready to link to its own blank card.`);
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
  const guessing = card?.kind === "guess";
  const visibleTracks =
    guessing && !revealed ? chapter?.tracks.slice(0, 1) : chapter?.tracks;
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
              {view === "catalogue"
                ? "Reference catalogue"
                : guessing
                  ? "Guess Who"
                  : "Pokémon facts"}
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#5c5348]">
              {view === "catalogue"
                ? "Every species from Kanto to Paldea. The Pokédex line is from the games, with the type, size, abilities, evolution, and stats."
                : guessing
                  ? "Three clues. Guess the Pokémon. Then hear if you were right."
                  : randomFacts
                    ? "One hundred Pokémon, drawn at random. Lily reads each track."
                    : "The name, then the Pokédex line, then the weight and the height."}
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
          <button
            type="button"
            role="tab"
            aria-selected={view === "catalogue"}
            onClick={() => {
              stopSpeaking();
              stopClip();
              setSpeaking(false);
              setView("catalogue");
            }}
            className={`h-10 rounded-full px-4 text-sm font-medium ${
              view === "catalogue" ? "bg-[#1c1916] text-[#f4efe6]" : "bg-white text-[#1c1916]"
            }`}
          >
            Catalogue
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards" && kind === "meet"}
            onClick={() => showKind("meet")}
            className={`h-10 rounded-full px-4 text-sm font-medium ${
              view === "cards" && kind === "meet"
                ? "bg-[#1c1916] text-[#f4efe6]"
                : "bg-white text-[#1c1916]"
            }`}
          >
            Facts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards" && kind === "guess"}
            onClick={() => showKind("guess")}
            className={`h-10 rounded-full px-4 text-sm font-medium ${
              view === "cards" && kind === "guess"
                ? "bg-[#1c1916] text-[#f4efe6]"
                : "bg-white text-[#1c1916]"
            }`}
          >
            Guess Who
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {view === "catalogue" ? (
          <Catalogue />
        ) : card && chapter ? (
          <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm leading-6 text-[#5c5348]">
                  {randomFacts ? (
                    <>
                      This playlist is the{" "}
                      <span className="font-medium text-[#1c1916]">100 Pokémon on this page</span>.
                      Shuffle draws a new hundred. Send uses this list, not a new draw. Lily records
                      each track as an MP3. One card.
                    </>
                  ) : (
                    <>
                      This playlist is{" "}
                      <span className="font-medium text-[#1c1916]">{card.rangeLabel}</span>. Link it
                      to its own blank card. Guess Who is {guessCards.length} cards.
                    </>
                  )}
                </p>
                {randomFacts ? (
                  <Button type="button" variant="outline" className="h-10 px-4" onClick={shufflePokedex}>
                    Shuffle
                  </Button>
                ) : null}
              </div>
              <div
                className="mt-3 flex gap-2 overflow-x-auto pb-1"
                role="listbox"
                aria-label={guessing ? "Guess Who playlists" : "Facts playlists"}
              >
                {rangeCards.map((item) => {
                  const selected = item.id === card.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => chooseCard(item)}
                      className={`h-10 shrink-0 rounded-full px-3 text-sm font-medium ${
                        selected ? "bg-[#1c1916] text-[#f4efe6]" : "bg-white text-[#1c1916]"
                      }`}
                    >
                      {item.rangeLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid content-start gap-2 self-start">
              <label className="grid gap-1 text-sm" htmlFor="picker">
                {guessing ? "Riddle on this card" : "Pokémon on this card"}
                <input
                  id="picker"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={guessing ? "Number" : "Name or number"}
                  className="h-10 rounded-lg border border-[#1c1916]/15 bg-white px-2"
                />
              </label>
              <select
                aria-label={guessing ? "Choose a riddle" : "Choose a Pokémon"}
                className="h-11 rounded-lg border border-[#1c1916]/15 bg-white px-2 md:hidden"
                value={String(chapter.dexId ?? chapter.key)}
                onChange={(event) => {
                  const next = playableChapters(card).find(
                    (item) => String(item.dexId ?? item.key) === event.target.value,
                  );
                  if (next) chooseChapter(next.key);
                }}
              >
                {playableChapters(card).map((item) => (
                  <option key={item.key} value={String(item.dexId ?? item.key)}>
                    {guessing ? `Riddle ${item.overlay}` : `${item.overlay}. ${item.title}`}
                  </option>
                ))}
              </select>
              <nav
                aria-label={guessing ? "Riddles" : "Pokémon"}
                className="grid max-h-[40dvh] content-start grid-cols-3 gap-2 overflow-y-auto md:max-h-[70dvh] md:grid-cols-1"
              >
                {listed.map((item) => {
                  const selected = item.key === chapter.key;
                  const label = guessing ? `Riddle ${item.overlay}` : item.title;
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
            </div>

            <div className="min-w-0">
              <article className="rounded-2xl bg-white px-5 py-6 sm:px-8 sm:py-8">
                <p className="text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">
                  {guessing
                    ? revealed
                      ? "Answer"
                      : "Three clues"
                    : `Number ${chapter.overlay}`}
                </p>
                <div className="mt-3 flex items-end gap-4">
                  {chapter.sprite && (!guessing || revealed) ? (
                    <img
                      src={chapter.sprite}
                      alt={guessing ? "" : chapter.title}
                      width={96}
                      height={96}
                      className="h-24 w-24 shrink-0 [image-rendering:pixelated]"
                    />
                  ) : null}
                  <h2 className="font-display text-4xl leading-tight sm:text-5xl">
                    {guessing && !revealed ? `Riddle ${chapter.overlay}` : chapter.title}
                  </h2>
                </div>
                <div className="mt-6 max-w-prose space-y-3 text-base leading-7 text-[#2a241c]">
                  {visibleTracks?.map((track) =>
                    entryLines(track.text, chapter.title).map((line) =>
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
                {chapter.clip ? (
                  <p className="mt-4 text-xs leading-5 text-[#8d8272]">
                    Hear plays the cry in the browser for this Pokémon. The Yoto card speaks the words only.
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-2">
                  {guessing ? (
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
                      onClick={() =>
                        chapter.clip
                          ? hearFact(
                              chapter.clip,
                              chapter.tracks.map((track) => trackSpeech(track)),
                            )
                          : hear(chapter.tracks.map((track) => trackSpeech(track)))
                      }
                    >
                      {speaking ? "Stop" : "Hear the entry"}
                    </Button>
                  )}
                </div>
              </article>

              <details className="mt-4 rounded-2xl border border-[#1c1916]/10 bg-white px-5 py-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Put {card.rangeLabel} on a Yoto card
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#5c5348]">
                  {card.childDoes}{" "}
                  {randomFacts
                    ? "Send uploads the 16×16 picture for each of these 100 Pokémon. Yoto records Lily’s voice as an MP3 for each track. The how-to is in the playlist description and at the start of the first track."
                    : `This send is only ${card.rangeLabel}. Then you link that playlist to its own blank card.`}
                </p>
                {randomFacts ? (
                  <p className="mt-3 text-sm leading-6">
                    Voice: <span className="font-medium">Lily</span>
                    <span className="mt-1 block text-xs leading-5 text-[#5c5348]">
                      British woman. Yoto Labs turns the script into an MP3 with her voice.
                    </span>
                  </p>
                ) : (
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
                )}
                {previousId ? (
                  <label className="mt-3 flex items-start gap-2 text-sm leading-5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={replace}
                      onChange={(event) => setReplace(event.target.checked)}
                    />
                    Replace the {card.rangeLabel} playlist already in your library.
                  </label>
                ) : null}
                <Button
                  type="button"
                  className="mt-4 h-11 px-4"
                  disabled={sending || !ready}
                  onClick={() => void send()}
                >
                  {sending ? "Recording…" : randomFacts ? "Send these 100 to Yoto" : `Send ${card.rangeLabel} to Yoto`}
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
                    <li>Hand that card to your child. Send the next playlist to a different blank card.</li>
                  </ol>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-[#5c5348]">
                    {randomFacts
                      ? "These 100 Pokémon go on one card, in Lily’s voice, each with its 16×16 picture. The numbered Facts ranges are there if you want a fixed stretch of the dex instead."
                      : `${card.rangeLabel} links to its own card. Guess Who needs ${guessCards.length} blank cards.`}
                  </p>
                )}
              </details>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs leading-5 text-[#8d8272] sm:px-6">
        Unofficial fan catalogue and cards. Not made by Nintendo, Game Freak, Creatures, or Yoto.
        Pokémon names and the Pokédex lines are from the games. Champdex notes are written for this app.
      </footer>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
