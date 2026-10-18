"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Catalogue } from "@/components/catalogue";
import { ConnectDialog } from "@/components/connect-dialog";
import { Button } from "@/components/ui/button";
import {
  bulkProgressLabel,
  chaptersForCries,
  factPoolFromCards,
  factsBulkPlaylists,
  factsPlaylistUpload,
  guessPoolFromCards,
  guessUpload,
  mulberry32,
  pokedexUpload,
  RANDOM_GUESS_ID,
  RANDOM_POKEDEX_ID,
  randomGuessCard,
  randomPokedexCard,
  trackSpeech,
  type KidCard,
  type KidCardKind,
} from "@/lib/kid-cards";
import { speakTexts, stopSpeaking } from "@/lib/speak";
import { savedCardIsGone, validYotoCardId, yotoErrorText } from "@/lib/yoto-error";
import { afterRejectedPlaylist, bulkFailureText, factsBulkUpload } from "@/lib/yoto-send";
import {
  CARD_KEY,
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

function forgetCard(id: string) {
  const next = savedCards();
  delete next[id];
  localStorage.setItem(SAVED_CARDS, JSON.stringify(next));
  localStorage.removeItem(CARD_KEY);
}

function savedPlaylistId(playlistId: string, replace: boolean): string | undefined {
  if (!replace) return undefined;
  const previous = savedCards()[playlistId];
  const usable = validYotoCardId(previous);
  if (previous && !usable) forgetCard(playlistId);
  return usable;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
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

async function uploadIcon(id: number, shadow = false): Promise<string> {
  const shadowQuery = shadow ? "&shadow=1" : "";
  const response = await yotoFetch(`/api/yoto/icon?id=${id}${shadowQuery}`, { method: "POST" });
    const payload = (await readBody(response)) as { mediaId?: string };
    if (!response.ok || !payload?.mediaId) {
      throw new Error(yotoErrorText(payload, "Yoto did not take the 16×16 picture."));
    }
    return payload.mediaId;
}

async function uploadPixels(card: KidCard): Promise<Record<number, string>> {
  const media: Record<number, string> = {};
  for (const chapter of card.chapters) {
    if (!chapter.dexId) continue;
    media[chapter.dexId] = await uploadIcon(chapter.dexId);
  }
  return media;
}

async function uploadGuessIcons(card: KidCard): Promise<{
  real: Record<number, string>;
  shadow: Record<number, string>;
}> {
  const real: Record<number, string> = {};
  const shadow: Record<number, string> = {};
  for (const chapter of card.chapters) {
    if (!chapter.dexId) continue;
    real[chapter.dexId] = await uploadIcon(chapter.dexId);
    shadow[chapter.dexId] = await uploadIcon(chapter.dexId, true);
  }
  return { real, shadow };
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
  const factPool = factPoolFromCards(cards);
  const guessPool = guessPoolFromCards(cards);
  const factsPlaylists = factsBulkPlaylists(cards);
  const [randomCard, setRandomCard] = useState(() => randomPokedexCard(factPool, mulberry32(20261018)));
  const [guessCard, setGuessCard] = useState(() => randomGuessCard(guessPool, mulberry32(20261018)));
  const [view, setView] = useState<"cards" | "catalogue">("cards");
  const [kind, setKind] = useState<KidCardKind>("meet");
  const [factsId, setFactsId] = useState(RANDOM_POKEDEX_ID);
  const [guessId, setGuessId] = useState(RANDOM_GUESS_ID);
  const [chapterKey, setChapterKey] = useState(randomCard.chapters[0]?.key ?? "start");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [session, setSession] = useState<YotoSession | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [replace, setReplace] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [bulkActive, setBulkActive] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [linked, setLinked] = useState<SavedCards>({});
  const [ready, setReady] = useState(false);
  const clipRef = useRef<HTMLAudioElement | null>(null);

  const cardId = kind === "meet" ? factsId : guessId;
  const card =
    cardId === RANDOM_POKEDEX_ID
      ? randomCard
      : cardId === RANDOM_GUESS_ID
        ? guessCard
        : (cards.find((item) => item.id === cardId) ?? cards.find((item) => item.kind === kind));
  const randomFacts = card?.id === RANDOM_POKEDEX_ID;
  const randomGuess = card?.id === RANDOM_GUESS_ID;
  const chapter =
    card?.chapters.find((item) => item.key === chapterKey) ??
    (card ? playableChapters(card)[0] : undefined);
  const rangeCards = kind === "meet" ? [randomCard, ...factsCards] : [guessCard];
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
        : id === RANDOM_GUESS_ID
          ? guessCard
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

  function shuffleGuess() {
    const next = randomGuessCard(guessPool);
    stopSpeaking();
    stopClip();
    setSpeaking(false);
    setRevealed(false);
    setQuery("");
    setKind("guess");
    setView("cards");
    setGuessId(RANDOM_GUESS_ID);
    setGuessCard(next);
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

  function hearCryThenSpeech(dexId: number, texts: string[]) {
    const audio = new Audio(`/api/cry/${dexId}`);
    clipRef.current = audio;
    setSpeaking(true);
    let movedOn = false;
    const speak = () => {
      if (movedOn) return;
      movedOn = true;
      clipRef.current = null;
      speakTexts(texts, () => setSpeaking(false));
    };
    audio.onended = speak;
    audio.onerror = speak;
    void audio.play().catch(speak);
  }

  function hearFact(src: string, texts: string[], dexId?: number) {
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
      if (dexId) hearCryThenSpeech(dexId, texts);
      else speakTexts(texts, () => setSpeaking(false));
    };
    audio.onended = () => setSpeaking(false);
    audio.onerror = fallback;
    void audio.play().catch(fallback);
  }

  function hearEntry(texts: string[], dexId?: number) {
    if (speaking) {
      stopSpeaking();
      stopClip();
      setSpeaking(false);
      return;
    }
    if (dexId) hearCryThenSpeech(dexId, texts);
    else hear(texts);
  }

  function revealAnswer() {
    if (!chapter) return;
    setRevealed(true);
    const answer = chapter.tracks[1] ? trackSpeech(chapter.tracks[1]) : undefined;
    if (!answer) return;
    stopSpeaking();
    stopClip();
    if (chapter.dexId) hearCryThenSpeech(chapter.dexId, [answer]);
    else {
      setSpeaking(true);
      speakTexts([answer], () => setSpeaking(false));
    }
  }

  function anotherRiddle() {
    if (!card) return;
    const rounds = playableChapters(card);
    const index = rounds.findIndex((item) => item.key === chapter?.key);
    const next = rounds[(index + 1) % rounds.length];
    if (next) chooseChapter(next.key);
  }

  async function connectedSession() {
    const live = (await ensureSession()) ?? session;
    if (!live) {
      setConnectOpen(true);
      toast("Connect Yoto first. Your child will not need this page.");
      return null;
    }
    setSession(live);
    return live;
  }

  async function postPlaylist(
    playlist: KidCard,
    upload: { voiceId: string; create?: boolean; content: { cardId?: string } },
    headline?: string,
  ): Promise<string | undefined> {
    let attempt = upload;
    let retried = false;
    for (;;) {
      const response = await yotoFetch("/api/yoto/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      });
      const payload = await readBody(response);
      if (!response.ok) {
        const decision = afterRejectedPlaylist({
          playlistId: playlist.id,
          upload: attempt,
          status: response.status,
          body: payload,
          store: savedCards(),
          retried,
        });
        localStorage.setItem(SAVED_CARDS, JSON.stringify(decision.store));
        if (decision.action === "retry-create" || decision.store[playlist.id] === undefined) {
          localStorage.removeItem(CARD_KEY);
        }
        setLinked(savedCards());
        if (decision.action === "retry-create") {
          retried = true;
          setReplace(false);
          attempt = decision.upload;
          continue;
        }
        throw new Error(decision.message);
      }
      const created = jobOf(payload);
      if (!created?.jobId) {
        throw new Error("Yoto did not start a recording job.");
      }
      const finished = await pollJob(created.jobId, headline);
      const newId = validYotoCardId(finished.result?.cardId) ?? validYotoCardId(attempt.content.cardId);
      if (newId) {
        rememberCard(playlist.id, newId);
        setLinked(savedCards());
      }
      return newId;
    }
  }

  async function addCries(cardId: string, playlist: KidCard, headline?: string) {
    const species = chaptersForCries(playlist);
    for (let index = 0; index < species.length; index += 1) {
      const chapter = species[index];
      if (!chapter?.dexId) continue;
      const progress = `Adding the cry, ${index + 1} of ${species.length}.`;
      setJob({
        status: "processing",
        detail: headline ? `${headline}. ${progress}` : progress,
      });
      const response = await yotoFetch("/api/yoto/cries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          chapterKey: chapter.key,
          dexId: chapter.dexId,
        }),
      });
      const payload = await readBody(response);
      if (!response.ok) {
        if (response.status === 400 || savedCardIsGone(response.status, payload)) {
          forgetCard(playlist.id);
          setLinked(savedCards());
          setReplace(false);
        }
        throw new Error(yotoErrorText(payload, `The cry for number ${chapter.dexId} did not upload.`));
      }
    }
  }

  async function send() {
    if (!card) return;
    if (!(await connectedSession())) return;
    setSending(true);
    setBulkActive(false);
    setJob({ status: "sending", detail: `Sending ${card.rangeLabel} to Yoto…` });
    try {
      setJob({ status: "sending", detail: "Uploading the 16×16 pictures for this card…" });
      const savedId = savedPlaylistId(card.id, replace);
      const upload = randomGuess
        ? await (async () => {
            const icons = await uploadGuessIcons(card);
            return guessUpload(card, icons.real, icons.shadow, savedId);
          })()
        : randomFacts
          ? pokedexUpload(card, await uploadPixels(card), savedId)
          : factsPlaylistUpload(card, await uploadPixels(card), savedId);
      const recordedId = await postPlaylist(card, upload);
      if (chaptersForCries(card).length > 0) {
        if (!recordedId) throw new Error("Yoto recorded Lily but did not return the card.");
        await addCries(recordedId, card);
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

  async function sendAllFacts() {
    if (!(await connectedSession())) return;
    const playlists = factsPlaylists;
    setSending(true);
    setBulkActive(true);
    try {
      setReplace(false);
      for (const playlist of playlists) forgetCard(playlist.id);
      setLinked(savedCards());
      const createdTitles: string[] = [];
      for (let index = 0; index < playlists.length; index += 1) {
        const playlist = playlists[index];
        if (!playlist) continue;
        const headline = bulkProgressLabel(index + 1, playlists.length);
        setJob({ status: "sending", detail: headline });
        try {
          const pixels = await uploadPixels(playlist);
          const recordedId = await postPlaylist(playlist, factsBulkUpload(playlist, pixels), headline);
          if (!recordedId) throw new Error("Yoto recorded Lily but did not return the card.");
          await addCries(recordedId, playlist, headline);
          createdTitles.push(playlist.libraryTitle);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "The recording stopped.";
          throw new Error(
            bulkFailureText({
              headline,
              rangeLabel: playlist.rangeLabel,
              reason,
              createdTitles,
            }),
          );
        }
      }
      setJob({
        status: "completed",
        detail: `All ${playlists.length} Pokefacts playlists are in your Yoto library.`,
      });
      toast.success(`All ${playlists.length} Pokefacts playlists are ready to link.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The recording stopped.";
      setJob({ status: "failed", detail });
      toast.error(detail);
    } finally {
      setSending(false);
      setBulkActive(false);
    }
  }

  async function pollJob(id: string, headline?: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const response = await yotoFetch(`/api/yoto/job/${id}`);
      const payload = await readBody(response);
      if (!response.ok) {
        throw new Error(yotoErrorText(payload, "Could not check the recording."));
      }
      const current = jobOf(payload);
      if (!current) throw new Error("Yoto sent back a recording Yoto could not read.");
      const progress =
        progressLabel(current.progress) ??
        (current.status === "queued"
          ? "Waiting for a voice…"
          : "Yoto is recording the pictures…");
      setJob({
        status: current.status ?? "processing",
        detail: headline ? `${headline}. ${progress}` : progress,
      });
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
  const portrait =
    guessing && chapter?.dexId
      ? revealed
        ? `/pixels/${chapter.dexId}.png`
        : `/pixels/${chapter.dexId}-shadow.png`
      : guessing
        ? undefined
        : chapter?.sprite;

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
                  ? "Fifty riddles, drawn at random. You hear the cry, then the clues. The picture stays a shadow until the answer."
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
                  {randomGuess ? (
                    <>
                      This playlist is the{" "}
                      <span className="font-medium text-[#1c1916]">50 riddles on this page</span>.
                      Shuffle draws a new fifty. Send uses this list, not a new draw. Each clue is a
                      shadow of the 16×16 pixel. The answer track is the real pixel.
                    </>
                  ) : randomFacts ? (
                    <>
                      This smaller playlist is the{" "}
                      <span className="font-medium text-[#1c1916]">100 Pokémon on this page</span>.
                      Shuffle draws a new hundred. Send uses this list, not a new draw.
                    </>
                  ) : (
                    <>
                      This playlist is{" "}
                      <span className="font-medium text-[#1c1916]">{card.rangeLabel}</span>. It is one
                      part of the full Pokefacts set.
                    </>
                  )}
                </p>
                {randomFacts ? (
                  <Button type="button" variant="outline" className="h-10 px-4" onClick={shufflePokedex}>
                    Shuffle
                  </Button>
                ) : null}
                {randomGuess ? (
                  <Button type="button" variant="outline" className="h-10 px-4" onClick={shuffleGuess}>
                    Shuffle
                  </Button>
                ) : null}
              </div>
              {kind === "meet" ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    className="h-11 px-4"
                    disabled={sending || !ready}
                    onClick={() => void sendAllFacts()}
                  >
                    {sending && bulkActive
                      ? "Recording…"
                      : `Send all ${factsPlaylists.length} Pokefacts playlists`}
                  </Button>
                  <p className="max-w-xl text-sm leading-6 text-[#5c5348]">
                    Sends every Pokefacts playlist, one after another, so all 1,025 Pokémon are covered.
                    Each playlist stays at 100 tracks or fewer. Lily reads every track.
                  </p>
                </div>
              ) : null}
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
                  {portrait ? (
                    <img
                      src={portrait}
                      alt={guessing && !revealed ? "" : chapter.title}
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
                {chapter.dexId ? (
                  <p className="mt-4 text-xs leading-5 text-[#8d8272]">
                    {guessing
                      ? "Hear plays the cry, then the words. The clue never says the name. The answer does. The Yoto card plays that same order."
                      : "Hear plays the cry, then the reading. The Yoto card plays that same order."}
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
                          if (track) hearEntry([trackSpeech(track)], chapter.dexId);
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
                      onClick={() => {
                        const texts = chapter.tracks.map((track) => trackSpeech(track));
                        if (speaking) {
                          stopSpeaking();
                          stopClip();
                          setSpeaking(false);
                          return;
                        }
                        if (chapter.clip) hearFact(chapter.clip, texts, chapter.dexId);
                        else if (chapter.dexId) hearCryThenSpeech(chapter.dexId, texts);
                        else hear(texts);
                      }}
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
                  {randomGuess
                    ? "Send uploads a shadow of each 16×16 pixel for the clue, then the real pixel for the answer. Yoto records Lily, then Champdex puts the cry in front of the clue and again in front of the answer."
                    : randomFacts
                      ? "Send records Lily, then puts that Pokémon’s cry in front of her voice and uploads the merged MP3. The how-to is in the playlist description and at the start of the first track."
                      : `This send is only ${card.rangeLabel}. Each fact is the cry, then Lily. The button above sends every Pokefacts playlist, one after another.`}
                </p>
                <p className="mt-3 text-sm leading-6">
                  Voice: <span className="font-medium">Lily</span>
                  <span className="mt-1 block text-xs leading-5 text-[#5c5348]">
                    British woman. Yoto Labs turns the script into an MP3 with her voice.
                  </span>
                </p>
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
                  {sending && !bulkActive
                    ? "Recording…"
                    : randomGuess
                      ? "Send these 50 riddles to Yoto"
                      : randomFacts
                        ? "Send these 100 to Yoto"
                        : `Send ${card.rangeLabel} to Yoto`}
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
                    {randomGuess
                      ? "These 50 riddles go on one card. Each track is the cry, then Lily. The clue never says the name. The answer does. The clue icon is the shadow. The answer icon is the real 16×16 pixel."
                      : randomFacts
                        ? "These 100 Pokémon go on one card, in Lily’s voice, each with its 16×16 picture. Send all Pokefacts playlists when you want every species."
                        : `${card.rangeLabel} links to its own card. Send all Pokefacts playlists to cover every species, one card at a time.`}
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
