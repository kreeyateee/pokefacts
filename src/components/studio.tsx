"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Catalogue } from "@/components/catalogue";
import { StatusBar } from "@/components/status-bar";
import { ConnectDialog } from "@/components/connect-dialog";
import { Button } from "@/components/ui/button";
import {
  applySpeciesSpeech,
  bulkProgressLabel,
  factPoolFromCards,
  factsBulkPlaylists,
  factsPlaylistUpload,
  formPlaylist,
  formPlaylistUpload,
  guessPoolFromCards,
  guessUpload,
  mulberry32,
  countSpokenTracks,
  LILY_VOICE_ID,
  pokedexUpload,
  POKEDEX_HOWTO,
  RANDOM_GUESS_ID,
  RANDOM_POKEDEX_ID,
  randomGuessCard,
  randomPokedexCard,
  trackSpeech,
  YOTO_TRACK_LIMIT,
  type KidCard,
  type KidCardKind,
} from "@/lib/kid-cards";
import { pronounce } from "@/lib/pronounce";
import { selectionUpload } from "@/lib/selection-playlist";
import { APP_NAME, DONATE_URL, SOURCE_URL } from "@/lib/site";
import { demoHearBody, factTrackBody, readVoiceId, writeVoiceId } from "@/lib/voice-choice";
import {
  asSendFailure,
  isRateLimited,
  looksLikeGateway,
  SendFailure,
  statusErrorText,
  validYotoCardId,
} from "@/lib/yoto-error";
import { isPiperVoice, PICKER_VOICES } from "@/lib/piper-voice";
import {
  afterRejectedPlaylist,
  applyFinishedAudio,
  bulkFailureText,
  factsBulkUpload,
  finishedPlaylistId,
  freeSlotMessage,
  libraryPlaylists,
  mapPool,
  renderJobs,
  uploadForPlaylist,
  type FinishedAudio,
  type PlaylistUpload,
} from "@/lib/yoto-send";
import {
  CARD_KEY,
  clearSavedLoginForScopeGap,
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
  done?: number;
  total?: number;
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readApi(response: Response, fallback: string): Promise<unknown> {
  const payload = await readBody(response);
  if (!response.ok || looksLikeGateway(response.status, payload)) {
    throw new SendFailure(
      statusErrorText(response.status, payload, fallback),
      looksLikeGateway(response.status, payload),
    );
  }
  return payload;
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
  const fallback = "Yoto did not take the 16×16 picture.";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await yotoFetch(`/api/yoto/icon?id=${id}${shadowQuery}`, { method: "POST" });
    const payload = await readBody(response);
    if (isRateLimited(response.status, payload) && attempt < 3) {
      await delay(Math.min(8_000, 800 * (attempt + 1)));
      continue;
    }
    if (!response.ok || looksLikeGateway(response.status, payload)) {
      throw new SendFailure(
        statusErrorText(response.status, payload, fallback),
        looksLikeGateway(response.status, payload),
      );
    }
    const mediaId = (payload as { mediaId?: string } | null)?.mediaId;
    if (!mediaId) throw new SendFailure(fallback, false);
    return mediaId;
  }
  throw new SendFailure(fallback, false);
}

async function uploadPixels(
  card: KidCard,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<number, string>> {
  const seen = new Set<number>();
  const species = card.chapters.filter((chapter) => {
    if (!chapter.dexId || seen.has(chapter.dexId)) return false;
    seen.add(chapter.dexId);
    return true;
  });
  const media: Record<number, string> = {};
  let finished = 0;
  await mapPool(species, async (chapter) => {
    const id = chapter.dexId;
    if (!id) return;
    media[id] = await uploadIcon(id);
    finished += 1;
    onProgress?.(finished, species.length);
  });
  return media;
}

async function speciesSpeech(id: number, name: string): Promise<string> {
  try {
    const response = await fetch(`/api/catalogue/${id}/biology`);
    const payload = (await response.json()) as { speech?: string };
    const speech = payload.speech?.replace(/\s+/g, " ").trim();
    if (speech) return speech;
  } catch {
    // The name is still safe to say. Weight and height stay off the track.
  }
  return `${name}.`;
}

async function speechesFor(
  card: KidCard,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<number, string>> {
  const ids: number[] = [];
  const names = new Map<number, string>();
  for (const chapter of card.chapters) {
    if (!chapter.dexId || names.has(chapter.dexId)) continue;
    names.set(chapter.dexId, chapter.title);
    ids.push(chapter.dexId);
  }
  const map: Record<number, string> = {};
  let finished = 0;
  await mapPool(ids, async (id) => {
    if (!id) return;
    map[id] = await speciesSpeech(id, names.get(id) ?? "This Pokémon");
    finished += 1;
    onProgress?.(finished, ids.length);
  });
  return map;
}

type FormReading = {
  speech: string;
  url: string;
  status: "ready" | "missing" | "unavailable";
};

async function formReading(formId: number): Promise<FormReading> {
  try {
    const response = await fetch(`/api/forms/${formId}`);
    const payload = (await response.json()) as {
      speech?: string;
      article?: { url?: string; status?: string };
    };
    const status = payload.article?.status;
    const safe = status === "ready" || status === "missing" || status === "unavailable" ? status : "unavailable";
    return {
      speech: payload.speech?.replace(/\s+/g, " ").trim() ?? "",
      url: payload.article?.url ?? "",
      status: safe,
    };
  } catch {
    return { speech: "", url: "", status: "unavailable" };
  }
}

function formSpokenText(chapter: { title: string; tracks: Array<{ text?: string }> }): string {
  return chapter.tracks[0]?.text?.replace(/\s+/g, " ").trim() ?? "";
}

/** A name, or "it can Mega Evolve", is not the description Lily should read. */
function formSpeechIsNameOnly(title: string, text: string): boolean {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean === title || clean === `${title}.`) return true;
  return /^(?:it )?can mega evolve\b/i.test(clean) || /^(?:it )?can gigantamax\b/i.test(clean);
}

function withFormReading(card: KidCard, formId: number, reading: FormReading): KidCard {
  return {
    ...card,
    chapters: card.chapters.map((chapter) => {
      if (chapter.formId !== formId) return chapter;
      const text = reading.speech || chapter.tracks[0]?.text || chapter.title;
      return {
        ...chapter,
        articleUrl: reading.url || chapter.articleUrl,
        articleStatus: reading.status,
        tracks: chapter.tracks.map((track) => ({
          ...track,
          text,
          spoken: pronounce(text),
        })),
      };
    }),
  };
}

function WikiCredit({ url }: { url: string }) {
  if (!url) return null;
  return (
    <p className="pk-quiet mt-4 text-xs leading-5">
      From{" "}
      <a className="underline" href={url} rel="noreferrer">
        Bulbapedia
      </a>
      . This description is used under CC BY-NC-SA 2.5.
    </p>
  );
}

async function uploadGuessIcons(card: KidCard): Promise<{
  real: Record<number, string>;
  shadow: Record<number, string>;
}> {
  const real: Record<number, string> = {};
  const shadow: Record<number, string> = {};
  await mapPool(
    card.chapters.filter((chapter) => chapter.dexId),
    async (chapter) => {
      const id = chapter.dexId;
      if (!id) return;
      real[id] = await uploadIcon(id);
      shadow[id] = await uploadIcon(id, true);
    },
  );
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

export function Studio({
  cards,
  mega = formPlaylist("mega", []),
  gmax = formPlaylist("gmax", []),
}: {
  cards: KidCard[];
  mega?: KidCard;
  gmax?: KidCard;
}) {
  const factsCards = cards.filter((card) => card.kind === "meet");
  const factPool = factPoolFromCards(cards);
  const guessPool = guessPoolFromCards(cards);
  const factsPlaylists = factsBulkPlaylists(cards);
  const [randomCard, setRandomCard] = useState(() => randomPokedexCard(factPool, mulberry32(20261018)));
  const [guessCard, setGuessCard] = useState(() => randomGuessCard(guessPool, mulberry32(20261018)));
  const [megaCard, setMegaCard] = useState(mega);
  const [gmaxCard, setGmaxCard] = useState(gmax);
  const megaRef = useRef(mega);
  const gmaxRef = useRef(gmax);
  const formLoad = useRef<Partial<Record<"mega" | "gmax", Promise<void>>>>({});
  const [factSpeech, setFactSpeech] = useState<{ id: number; speech: string; url: string } | null>(null);
  const [view, setView] = useState<"cards" | "catalogue">("cards");
  const [kind, setKind] = useState<KidCardKind>("meet");
  const [factsId, setFactsId] = useState(RANDOM_POKEDEX_ID);
  const [guessId, setGuessId] = useState(RANDOM_GUESS_ID);
  const [chapterKey, setChapterKey] = useState(randomCard.chapters[0]?.key ?? "start");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [session, setSession] = useState<YotoSession | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [voiceId, setVoiceId] = useState(LILY_VOICE_ID);
  const [library, setLibrary] = useState<Array<{ cardId: string; title: string }>>([]);
  const [libraryNote, setLibraryNote] = useState("");
  const [targetPlaylist, setTargetPlaylist] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [hearError, setHearError] = useState("");
  const [sending, setSending] = useState(false);
  const [bulkActive, setBulkActive] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [ready, setReady] = useState(false);
  const clipRef = useRef<HTMLAudioElement | null>(null);
  const clipUrl = useRef<string | null>(null);
  const hearAbort = useRef<AbortController | null>(null);
  const speakingRef = useRef(false);

  const cardId = kind === "meet" ? factsId : guessId;
  const card =
    kind === "mega"
      ? megaCard
      : kind === "gmax"
        ? gmaxCard
        : cardId === RANDOM_POKEDEX_ID
          ? randomCard
          : cardId === RANDOM_GUESS_ID
            ? guessCard
            : (cards.find((item) => item.id === cardId) ?? cards.find((item) => item.kind === kind));
  const randomFacts = card?.id === RANDOM_POKEDEX_ID;
  const randomGuess = card?.id === RANDOM_GUESS_ID;
  const chapter =
    card?.chapters.find((item) => item.key === chapterKey) ??
    (card ? playableChapters(card)[0] : undefined);
  const rangeCards =
    kind === "mega" ? [megaCard] : kind === "gmax" ? [gmaxCard] : kind === "meet" ? [randomCard, ...factsCards] : [guessCard];
  const listed = (card ? playableChapters(card) : []).filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    if (card?.kind === "guess") return item.overlay.includes(needle);
    return item.title.toLowerCase().includes(needle) || item.overlay === needle;
  });

  useEffect(() => {
    let cancelled = false;
    setVoiceId(readVoiceId(localStorage));
    void ensureSession().then((next) => {
      if (cancelled) return;
      setSession(next);
      setReady(true);
      if (next) void loadLibrary();
    });
    return () => {
      cancelled = true;
      stopDemo();
    };
  }, []);

  useEffect(() => {
    if (kind !== "meet" || !chapter?.dexId) return;
    const id = chapter.dexId;
    const name = chapter.title;
    const controller = new AbortController();
    void fetch(`/api/catalogue/${id}/biology`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { speech?: string; biology?: { url?: string } };
        if (controller.signal.aborted) return;
        setFactSpeech({
          id,
          speech: payload.speech?.replace(/\s+/g, " ").trim() || `${name}.`,
          url: payload.biology?.url ?? "",
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFactSpeech({ id, speech: `${name}.`, url: "" });
      });
    return () => controller.abort();
  }, [kind, chapter?.dexId, chapter?.title]);

  function stopClip() {
    const audio = clipRef.current;
    if (audio) audio.pause();
    if (clipUrl.current) {
      URL.revokeObjectURL(clipUrl.current);
      clipUrl.current = null;
    }
  }

  function stopDemo() {
    hearAbort.current?.abort();
    hearAbort.current = null;
    speakingRef.current = false;
    stopClip();
    setSpeaking(false);
  }

  function chooseCard(next: KidCard) {
    stopDemo();
    setRevealed(false);
    setQuery("");
    setKind(next.kind);
    if (next.kind === "meet") setFactsId(next.id);
    else if (next.kind === "guess") setGuessId(next.id);
    setChapterKey(playableChapters(next)[0]?.key ?? "start");
    setJob(null);
  }

  function rememberForm(nextKind: "mega" | "gmax", next: KidCard) {
    if (nextKind === "mega") {
      megaRef.current = next;
      setMegaCard(next);
    } else {
      gmaxRef.current = next;
      setGmaxCard(next);
    }
  }

  function ensureFormProse(
    nextKind: "mega" | "gmax",
    onProgress?: (detail: string) => void,
  ): Promise<void> {
    const existing = formLoad.current[nextKind];
    if (existing) return existing;
    const job = (async () => {
      const source = nextKind === "mega" ? megaRef.current : gmaxRef.current;
      let current = source;
      const pending = current.chapters.filter((chapter) => chapter.formId && !chapter.articleStatus);
      let finished = 0;
      const readings = await mapPool(pending, async (chapter) => {
        const reading = chapter.formId ? await formReading(chapter.formId) : null;
        finished += 1;
        onProgress?.(`${current.libraryTitle}, description ${finished} of ${pending.length}`);
        return { formId: chapter.formId, reading };
      });
      for (const item of readings) {
        if (!item.formId || !item.reading) continue;
        current = withFormReading(current, item.formId, item.reading);
      }
      if (readings.length > 0) rememberForm(nextKind, current);
    })();
    formLoad.current[nextKind] = job;
    return job;
  }

  function showKind(nextKind: KidCardKind) {
    stopDemo();
    setRevealed(false);
    setView("cards");
    setKind(nextKind);
    if (nextKind === "mega" || nextKind === "gmax") {
      const next = nextKind === "mega" ? megaRef.current : gmaxRef.current;
      setChapterKey(playableChapters(next)[0]?.key ?? "start");
      setJob(null);
      void ensureFormProse(nextKind);
      return;
    }
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
    stopDemo();
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
    stopDemo();
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
    stopDemo();
    setRevealed(false);
    setChapterKey(key);
  }

  async function requestDemo(text: string, title: string, dexId?: number) {
    const script = text.replace(/\s+/g, " ").trim();
    if (!script) {
      speakingRef.current = false;
      setSpeaking(false);
      setHearError("This entry has nothing to read.");
      return;
    }
    const controller = new AbortController();
    hearAbort.current = controller;
    try {
      const piper = isPiperVoice(voiceId);
      if (!piper && !(await connectedSession())) {
        if (controller.signal.aborted) return;
        speakingRef.current = false;
        setSpeaking(false);
        setHearError("Connect Yoto to hear this entry.");
        return;
      }
      if (controller.signal.aborted) return;
      const response = await (piper ? fetch : yotoFetch)("/api/yoto/hear", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoHearBody({ text: script, voiceId, dexId, title })),
      });
      if (controller.signal.aborted) return;
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("audio")) {
        const payload = await readBody(response);
        const message = statusErrorText(response.status, payload, "Could not record this entry.");
        const reconnect = clearSavedLoginForScopeGap(message);
        if (reconnect) {
          setSession(null);
          setConnectOpen(true);
        }
        speakingRef.current = false;
        setSpeaking(false);
        setHearError(reconnect ?? message);
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
      clipUrl.current = url;
      const audio = clipRef.current;
      if (!audio) throw new Error("Could not play this entry.");
      audio.src = url;
      audio.onended = () => {
        speakingRef.current = false;
        setSpeaking(false);
      };
      audio.onerror = () => {
        speakingRef.current = false;
        setSpeaking(false);
        setHearError("Could not play this entry.");
      };
      try {
        await audio.play();
      } catch {
        speakingRef.current = false;
        setSpeaking(false);
        setHearError("Press play on the recording.");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      speakingRef.current = false;
      setSpeaking(false);
      const failure = asSendFailure(error, "Could not record this entry.");
      const reconnect = clearSavedLoginForScopeGap(failure.message);
      if (reconnect) {
        setSession(null);
        setConnectOpen(true);
      }
      setHearError(reconnect ?? failure.message);
    }
  }

  async function hearScript(load: () => Promise<{ text: string; title: string; dexId?: number } | null>) {
    if (speakingRef.current) {
      stopDemo();
      return;
    }
    speakingRef.current = true;
    setSpeaking(true);
    setHearError("");
    try {
      const ready = await load();
      if (!speakingRef.current) return;
      if (!ready?.text.trim()) {
        speakingRef.current = false;
        setSpeaking(false);
        setHearError("This entry has nothing to read.");
        return;
      }
      await requestDemo(ready.text, ready.title, ready.dexId);
    } catch (error) {
      if (!speakingRef.current) return;
      speakingRef.current = false;
      setSpeaking(false);
      setHearError(asSendFailure(error, "Could not record this entry.").message);
    }
  }

  function revealAnswer() {
    if (!chapter) return;
    setRevealed(true);
    const answer = chapter.tracks[1];
    if (!answer) return;
    void hearScript(async () => ({
      text: trackSpeech(answer),
      title: answer.title,
      dexId: answer.lead === "cry" ? chapter.dexId : undefined,
    }));
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

  async function loadLibrary() {
    try {
      const response = await yotoFetch("/api/yoto/mine");
      const payload = await readBody(response);
      if (!response.ok || looksLikeGateway(response.status, payload)) {
        const message = statusErrorText(response.status, payload, "Could not load your Yoto playlists.");
        const reconnect = clearSavedLoginForScopeGap(message);
        if (reconnect) {
          setSession(null);
          setConnectOpen(true);
        }
        setLibrary([]);
        setLibraryNote(reconnect ?? message);
        return;
      }
      const playlists = libraryPlaylists(payload);
      setLibrary(playlists);
      setLibraryNote("");
      setTargetPlaylist((current) => (current && playlists.some((item) => item.cardId === current) ? current : ""));
    } catch (error) {
      const failure = asSendFailure(error, "Could not load your Yoto playlists.");
      setLibrary([]);
      setLibraryNote(failure.message);
    }
  }

  function reportFailure(message: string) {
    const reconnect = clearSavedLoginForScopeGap(message);
    const detail = reconnect ?? message;
    if (reconnect) {
      setSession(null);
      setConnectOpen(true);
    }
    setJob({ status: "failed", detail });
    toast.error(detail);
  }

  async function pollJob(id: string, headline?: string, mark?: { done: number; total: number }) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await delay(attempt < 8 ? 400 : 1000);
      const response = await yotoFetch(`/api/yoto/job/${id}`);
      const payload = await readBody(response);
      if (isRateLimited(response.status, payload)) {
        await delay(Math.min(8_000, 1_000 * (attempt + 1)));
        continue;
      }
      if (!response.ok || looksLikeGateway(response.status, payload)) {
        throw new SendFailure(
          statusErrorText(response.status, payload, "Could not check the recording."),
          looksLikeGateway(response.status, payload),
        );
      }
      const current = jobOf(payload);
      if (!current) throw new SendFailure("Yoto sent back a recording Yoto could not read.", false);
      const progress =
        progressLabel(current.progress) ??
        (current.status === "queued" ? "Waiting for a voice…" : "Yoto is recording this line…");
      setJob({
        status: current.status ?? "processing",
        detail: headline ? `${headline}. ${progress}` : progress,
        done: mark?.done,
        total: mark?.total,
      });
      if (current.status === "completed") return current;
      if (current.status === "failed") {
        const reason = current.error || "Yoto could not finish the recording.";
        throw new SendFailure(statusErrorText(0, reason, reason), looksLikeGateway(0, reason));
      }
    }
    throw new SendFailure("Yoto is still recording. Check Make Your Own in the Yoto app in a minute.", false);
  }

  async function postPlaylist(
    playlist: KidCard,
    upload: PlaylistUpload,
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
      if (!response.ok || looksLikeGateway(response.status, payload)) {
        const gateway = looksLikeGateway(response.status, payload);
        if (!gateway && !attempt.append) {
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
          if (decision.action === "retry-create") {
            retried = true;
            attempt = decision.upload;
            continue;
          }
          throw new SendFailure(decision.message, false);
        }
        throw new SendFailure(statusErrorText(response.status, payload, "Yoto did not accept this card."), gateway);
      }
      const created = jobOf(payload);
      if (created?.status === "completed") {
        const newId = finishedPlaylistId({
          status: created.status,
          cardId: created.result?.cardId,
          create: attempt.create,
        });
        if (!newId) throw new SendFailure("Yoto did not return the new playlist.", false);
        rememberCard(playlist.id, newId);
        return newId;
      }
      if (!created?.jobId) {
        throw new SendFailure("Yoto did not start a recording job.", false);
      }
      const finished = await pollJob(created.jobId, headline);
      const newId = finishedPlaylistId({
        status: finished.status,
        cardId: finished.result?.cardId,
        fallback: attempt.content.cardId,
        create: attempt.create,
      });
      if (!newId) throw new SendFailure("Yoto did not return the new playlist.", false);
      rememberCard(playlist.id, newId);
      return newId;
    }
  }

  async function discardScratch(cardId: string) {
    try {
      await yotoFetch("/api/yoto/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discardCardId: cardId }),
      });
    } catch {
      // A leftover scratch card is not the playlist.
    }
  }

  async function renderOneTrack(
    job: { text: string; title: string; dexId?: number; name?: string; progress: string },
    scratch: Set<string>,
    mark: { done: number; total: number },
  ): Promise<FinishedAudio> {
    let speechJobId: string | undefined;
    let speechCardId: string | undefined;
    let uploadId: string | undefined;
    let last = new SendFailure("This track did not finish.", false);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        for (let step = 0; step < 40; step += 1) {
          setJob({ status: "sending", detail: job.progress, done: mark.done, total: mark.total });
          const response = await yotoFetch("/api/yoto/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              factTrackBody({
                text: job.text,
                title: job.title,
                dexId: job.dexId,
                name: job.name,
                voiceId,
                speechJobId,
                speechCardId,
                uploadId,
              }),
            ),
          });
          const body = await readBody(response);
          if (isRateLimited(response.status, body)) {
            await delay(Math.min(8_000, 700 * (step + 1)));
            continue;
          }
          if (!response.ok || looksLikeGateway(response.status, body)) {
            throw new SendFailure(
              statusErrorText(response.status, body, "This track did not record."),
              looksLikeGateway(response.status, body),
            );
          }
          const payload = body as {
            phase?: string;
            speechJobId?: string;
            uploadId?: string;
            trackUrl?: string;
            duration?: number;
            fileSize?: number;
            format?: string;
            channels?: string;
          };
          if (payload.phase === "ready" && payload.trackUrl?.startsWith("yoto:#")) {
            return payload as FinishedAudio;
          }
          if (payload.phase === "speech" && payload.speechJobId) {
            speechJobId = payload.speechJobId;
            const finished = await pollJob(payload.speechJobId, job.progress, mark);
            const cardId = finished.result?.cardId;
            if (!cardId) throw new SendFailure("The voice did not return a recording.", false);
            speechCardId = cardId;
            scratch.add(cardId);
            uploadId = undefined;
            continue;
          }
          if (payload.phase === "upload" && payload.uploadId) {
            uploadId = payload.uploadId;
            speechJobId = undefined;
            await delay(300);
            continue;
          }
          throw new SendFailure("This track did not finish.", false);
        }
        throw new SendFailure("This track is still recording. Retry.", false);
      } catch (error) {
        last = asSendFailure(error, "This track did not finish.");
        if (!isRateLimited(0, last.message) && /could not record|did not start|does not look right/i.test(last.message)) {
          speechJobId = undefined;
          uploadId = undefined;
        }
        await delay(isRateLimited(0, last.message) ? Math.min(8_000, 1_000 * (attempt + 1)) : 600);
      }
    }
    throw last;
  }

  async function renderPlaylist(playlist: KidCard, upload: PlaylistUpload, libraryTitle: string) {
    const jobs = renderJobs(libraryTitle, playlist, upload);
    const audio: Record<string, FinishedAudio> = {};
    const scratch = new Set<string>();
    const mark = { done: 0, total: jobs.length };
    try {
      await mapPool(jobs, async (job) => {
        audio[job.key] = await renderOneTrack(job, scratch, mark);
        mark.done += 1;
        setJob({
          status: "sending",
          detail: `${libraryTitle}, ${mark.done} of ${mark.total}`,
          done: mark.done,
          total: mark.total,
        });
      });
      return audio;
    } finally {
      await mapPool([...scratch], (cardId) => discardScratch(cardId));
    }
  }

  async function sendPrepared(playlist: KidCard, upload: PlaylistUpload, headline?: string) {
    const libraryTitle = upload.content.title || playlist.libraryTitle;
    const audio = await renderPlaylist(playlist, upload, libraryTitle);
    const prepared = applyFinishedAudio(upload, audio);
    if (prepared.create) delete prepared.content.cardId;
    return postPlaylist(playlist, prepared, headline ?? libraryTitle);
  }

  async function sendSelection(playlist: KidCard): Promise<void> {
    if (!(await connectedSession())) {
      throw new Error("Connect Yoto before building a playlist.");
    }
    setSending(true);
    setJob({ status: "sending", detail: `Sending ${playlist.libraryTitle} to Yoto…` });
    try {
      const chosenId = validYotoCardId(targetPlaylist);
      if (chosenId) {
        const response = await yotoFetch(`/api/yoto/card?id=${encodeURIComponent(chosenId)}`);
        const summary = (await readApi(response, "Could not read that playlist.")) as { tracks?: number };
        const adding = countSpokenTracks(playlist.chapters);
        const free = YOTO_TRACK_LIMIT - (summary.tracks ?? 0);
        if (adding > free) throw new SendFailure(freeSlotMessage(free, adding), false);
      }
      const icons = playlist.kind === "guess" ? await uploadGuessIcons(playlist) : null;
      const pixels = icons ? icons.real : await uploadPixels(playlist);
      const prepared = selectionUpload(playlist, pixels, {
        title: playlist.libraryTitle,
        shadowById: icons?.shadow,
        voiceId,
      });
      const upload = uploadForPlaylist(prepared, chosenId);
      await sendPrepared(playlist, upload, playlist.libraryTitle);
      const updatedTitle = library.find((item) => item.cardId === chosenId)?.title;
      const tracks = countSpokenTracks(playlist.chapters);
      setJob({
        status: "completed",
        detail: chosenId
          ? `${updatedTitle ?? "The playlist"} was updated.`
          : `${playlist.libraryTitle} is in your Yoto library.`,
        done: tracks,
        total: tracks,
      });
      toast.success(
        chosenId
          ? `${updatedTitle ?? "The playlist"} was updated.`
          : `${playlist.libraryTitle} is ready to link to its own blank card.`,
      );
      void loadLibrary();
    } catch (error) {
      const failure = asSendFailure(error, "The recording stopped.");
      reportFailure(failure.message);
      throw failure;
    } finally {
      setSending(false);
    }
  }

  async function send() {
    if (!card) return;
    if (!(await connectedSession())) return;
    setSending(true);
    setBulkActive(false);
    setJob({ status: "sending", detail: `Sending ${card.rangeLabel} to Yoto…` });
    try {
      const chosenId = validYotoCardId(targetPlaylist);
      if (chosenId) {
        const response = await yotoFetch(`/api/yoto/card?id=${encodeURIComponent(chosenId)}`);
        const summary = (await readApi(response, "Could not read that playlist.")) as { tracks?: number };
        const adding = countSpokenTracks(card.chapters);
        const free = YOTO_TRACK_LIMIT - (summary.tracks ?? 0);
        if (adding > free) throw new SendFailure(freeSlotMessage(free, adding), false);
      }
      const formKind = card.kind === "mega" || card.kind === "gmax";
      const spokenCard = formKind
        ? card
        : card.kind === "guess"
          ? card
          : applySpeciesSpeech(
              card,
              await speechesFor(card, (done, total) => {
                setJob({
                  status: "sending",
                  detail: `${card.libraryTitle}, description ${done} of ${total}`,
                  done,
                  total,
                });
              }),
            );
      if (card.kind === "mega" || card.kind === "gmax") {
        await ensureFormProse(card.kind, (detail) => {
          setJob({ status: "sending", detail });
        });
      }
      const readyForm = card.kind === "mega" ? megaRef.current : card.kind === "gmax" ? gmaxRef.current : spokenCard;
      const base = randomGuess
        ? await (async () => {
            const icons = await uploadGuessIcons(card);
            return guessUpload(card, icons.real, icons.shadow, undefined, voiceId);
          })()
        : formKind
          ? formPlaylistUpload(readyForm, await uploadPixels(readyForm), undefined, voiceId)
          : randomFacts
            ? pokedexUpload(spokenCard, await uploadPixels(spokenCard), undefined, voiceId)
            : factsPlaylistUpload(spokenCard, await uploadPixels(spokenCard), undefined, voiceId);
      const upload = uploadForPlaylist({ ...base, voiceId }, chosenId);
      await sendPrepared(card, upload, card.libraryTitle);
      const updatedTitle = library.find((item) => item.cardId === chosenId)?.title;
      const tracks = countSpokenTracks(card.chapters);
      setJob({
        status: "completed",
        detail: chosenId
          ? `${updatedTitle ?? "The playlist"} was updated.`
          : `${card.rangeLabel} is in your Yoto library.`,
        done: tracks,
        total: tracks,
      });
      toast.success(
        chosenId
          ? `${updatedTitle ?? "The playlist"} was updated.`
          : `${card.libraryTitle} is ready to link to its own blank card.`,
      );
      void loadLibrary();
    } catch (error) {
      const failure = asSendFailure(error, "The recording stopped.");
      reportFailure(failure.message);
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
      for (const playlist of playlists) forgetCard(playlist.id);
      const createdTitles: string[] = [];
      for (let index = 0; index < playlists.length; index += 1) {
        const playlist = playlists[index];
        if (!playlist) continue;
        const headline = bulkProgressLabel(index + 1, playlists.length);
        setJob({ status: "sending", detail: headline, done: index, total: playlists.length });
        try {
          const spoken = applySpeciesSpeech(
            playlist,
            await speechesFor(playlist, (done, total) => {
              setJob({
                status: "sending",
                detail: `${playlist.libraryTitle}, description ${done} of ${total}`,
                done,
                total,
              });
            }),
          );
          const pixels = await uploadPixels(spoken, (done, total) => {
            setJob({
              status: "sending",
              detail: `${playlist.libraryTitle}, picture ${done} of ${total}`,
              done,
              total,
            });
          });
          const upload = factsBulkUpload(spoken, pixels, voiceId);
          delete upload.content.cardId;
          await sendPrepared(playlist, upload, headline);
          createdTitles.push(playlist.libraryTitle);
        } catch (error) {
          const failure = asSendFailure(error, "The recording stopped.");
          throw new SendFailure(
            bulkFailureText({
              headline,
              rangeLabel: playlist.rangeLabel,
              reason: failure.message,
              createdTitles,
              playlistIndex: index + 1,
              gateway: failure.gateway,
            }),
            failure.gateway,
          );
        }
      }
      setJob({
        status: "completed",
        detail: `All ${playlists.length} Pokefacts playlists are in your Yoto library.`,
        done: playlists.length,
        total: playlists.length,
      });
      toast.success(`All ${playlists.length} Pokefacts playlists are ready to link.`);
    } catch (error) {
      const failure = asSendFailure(error, "The recording stopped.");
      reportFailure(failure.message);
    } finally {
      setSending(false);
      setBulkActive(false);
    }
  }

  function disconnect() {
    writeSession(null);
    setSession(null);
    setLibrary([]);
    setLibraryNote("");
    setTargetPlaylist("");
    toast("Disconnected. Cards already in your library stay there.");
  }

  const guessing = card?.kind === "guess";
  const formMode = card?.kind === "mega" || card?.kind === "gmax";
  const factReading =
    kind === "meet" && chapter?.dexId && factSpeech?.id === chapter.dexId ? factSpeech : null;
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
    <div className="pk-page">
      <header className="mx-auto w-full max-w-5xl px-4 pt-6 pb-2 sm:px-6">
        <div className="pk-banner">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <a className="pk-wordmark" href={DONATE_URL} target="_blank" rel="noreferrer">
              <span className="pk-ball" aria-hidden="true" />
              <span>
                <span className="pk-wordmark-name">{APP_NAME}</span>
                <span className="pk-wordmark-coffee">Buy me a coffee</span>
              </span>
            </a>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <a className="pk-banner-btn" href={SOURCE_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
              {session ? (
                <button type="button" className="pk-banner-btn" onClick={disconnect}>
                  {session.name ? `Yoto · ${session.name}` : "Yoto connected"}
                </button>
              ) : (
                <button type="button" className="pk-banner-btn" onClick={() => setConnectOpen(true)}>
                  Put this on a Yoto card
                </button>
              )}
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {view === "catalogue"
              ? "Reference catalogue"
              : guessing
                ? "Guess Who"
                : formMode
                  ? card?.libraryTitle
                  : "Pokémon facts"}
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-white/90">
            {view === "catalogue"
              ? "Every species from Kanto to Paldea. The Pokédex line is from the games, with the type, size, abilities, evolution, and stats."
              : guessing
                ? "Fifty riddles, drawn at random. You hear the cry, then the clues. The picture stays a shadow until the answer."
                : formMode
                  ? "The cry, then the selected voice reads that form."
                  : randomFacts
                    ? "One hundred Pokémon, drawn at random. You hear the cry, then the selected voice reads the name and a short description."
                    : "The cry, then the name, then a short description."}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Play mode">
          <button
            type="button"
            role="tab"
            aria-selected={view === "catalogue"}
            onClick={() => {
              stopDemo();
              setView("catalogue");
            }}
            className="pk-tab"
          >
            Catalogue
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards" && kind === "meet"}
            onClick={() => showKind("meet")}
            className="pk-tab"
          >
            Facts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards" && kind === "guess"}
            onClick={() => showKind("guess")}
            className="pk-tab"
          >
            Guess Who
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards" && kind === "mega"}
            onClick={() => showKind("mega")}
            className="pk-tab"
          >
            Mega Evolutions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards" && kind === "gmax"}
            onClick={() => showKind("gmax")}
            className="pk-tab"
          >
            Gigantamax
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {view === "catalogue" ? (
          <Catalogue
            onSendSelection={sendSelection}
            onBuildStart={() => setJob(null)}
            playlists={library}
            playlistTarget={targetPlaylist}
            onPlaylistTarget={setTargetPlaylist}
            voiceId={voiceId}
            onVoiceId={(id) => setVoiceId(writeVoiceId(localStorage, id))}
            job={job}
          />
        ) : card && chapter ? (
          <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  {randomGuess ? (
                    <>
                      This playlist is the{" "}
                      <span className="font-bold text-ink">50 riddles on this page</span>.
                      Shuffle draws a new fifty. Send uses this list, not a new draw. Each clue is a
                      shadow of the 16×16 pixel. The answer track is the real pixel.
                    </>
                  ) : randomFacts ? (
                    <>
                      This smaller playlist is the{" "}
                      <span className="font-bold text-ink">100 Pokémon on this page</span>.
                      Shuffle draws a new hundred. Send uses this list, not a new draw.
                    </>
                  ) : formMode ? (
                    <>
                      This playlist is{" "}
                      <span className="font-bold text-ink">{card.libraryTitle}</span>. One
                      track for each form. The picture is that species&apos; 16×16 pixel.
                    </>
                  ) : (
                    <>
                      This playlist is{" "}
                      <span className="font-bold text-ink">{card.rangeLabel}</span>. It is one
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
                  <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    Sends every Pokefacts playlist, one after another, so all 1,025 Pokémon are covered.
                    Each playlist stays at 100 tracks or fewer. The voice you pick reads every track.
                  </p>
                </div>
              ) : null}
              {job ? (
                <StatusBar
                  label={job.detail}
                  done={job.done}
                  total={job.total}
                  failed={job.status === "failed"}
                />
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
                      className="pk-pill shrink-0"
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
                  className="pk-field"
                />
              </label>
              <select
                aria-label={guessing ? "Choose a riddle" : "Choose a Pokémon"}
                className="pk-field md:hidden"
                value={chapter.key}
                onChange={(event) => {
                  const next = playableChapters(card).find((item) => item.key === event.target.value);
                  if (next) chooseChapter(next.key);
                }}
              >
                {playableChapters(card).map((item) => (
                  <option key={item.key} value={item.key}>
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
                      className="pk-choice px-2.5 py-2.5 text-sm"
                    >
                      {label}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="min-w-0">
              <article className="pk-card pk-dex px-5 py-6 sm:px-8 sm:py-8">
                <p className="pk-kicker">
                  {guessing
                    ? revealed
                      ? "Answer"
                      : "Clues"
                    : `Number ${chapter.overlay}`}
                </p>
                <div className="mt-3 flex items-end gap-4">
                  {portrait ? (
                    <img
                      src={portrait}
                      alt={guessing && !revealed ? "" : chapter.title}
                      width={96}
                      height={96}
                      className="pk-sprite"
                    />
                  ) : null}
                  <h2 className="font-display text-4xl leading-tight sm:text-5xl">
                    {guessing && !revealed ? `Riddle ${chapter.overlay}` : chapter.title}
                  </h2>
                </div>
                <div className="mt-6 max-w-prose space-y-3 text-base leading-7">
                  {kind === "meet" && chapter.dexId ? (
                    factReading ? (
                      <p>{factReading.speech}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Opening the description…</p>
                    )
                  ) : formMode ? (
                    !chapter.articleStatus ? (
                      <p className="text-sm text-muted-foreground">Opening the form description…</p>
                    ) : formSpeechIsNameOnly(chapter.title, formSpokenText(chapter)) ? (
                      <p className="text-sm text-muted-foreground">
                        No separate description was found. The selected voice says the name.
                      </p>
                    ) : (
                      <p>{formSpokenText(chapter)}</p>
                    )
                  ) : (
                    visibleTracks?.map((track) =>
                      entryLines(track.text, chapter.title).map((line) =>
                        isMeasure(line) ? (
                          <p
                            key={`${track.key}-${line}`}
                            className="pk-measure px-4 py-3"
                          >
                            {line}
                          </p>
                        ) : (
                          <p key={`${track.key}-${line}`}>{line}</p>
                        ),
                      ),
                    )
                  )}
                </div>
                {kind === "meet" && factReading?.url ? <WikiCredit url={factReading.url} /> : null}
                {formMode &&
                chapter.articleUrl &&
                chapter.articleStatus &&
                !formSpeechIsNameOnly(chapter.title, formSpokenText(chapter)) ? (
                  <WikiCredit url={chapter.articleUrl} />
                ) : null}
                {source && guessing ? (
                  <p className="pk-quiet mt-4 text-xs">Pokédex, {source}</p>
                ) : null}
                {chapter.dexId ? (
                  <p className="pk-quiet mt-4 text-xs leading-5">
                    {guessing
                      ? "Hear plays the cry, then the words. The clue never says the name. The answer does. The Yoto card plays that same order."
                      : "Hear plays the cry, then the reading. The Yoto card plays that same order."}
                  </p>
                ) : null}
                <label className="mt-6 grid max-w-sm gap-1 text-sm" htmlFor="voice">
                  Voice
                  <select
                    id="voice"
                    aria-label="Voice"
                    className="pk-field"
                    value={voiceId}
                    onChange={(event) => setVoiceId(writeVoiceId(localStorage, event.target.value))}
                  >
                    {PICKER_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name} — {voice.note}
                      </option>
                    ))}
                  </select>
                  {isPiperVoice(voiceId) ? (
                    <p className="mt-2 text-xs leading-5 pk-quiet">
                      Cori, British. Piper reads on this computer, so Hear works before you connect Yoto. Send still
                      needs a Yoto login.
                    </p>
                  ) : null}
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  {guessing ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 px-4"
                        onClick={() => {
                          const track = revealed ? chapter.tracks[1] : chapter.tracks[0];
                          if (!track) return;
                          void hearScript(async () => ({
                            text: trackSpeech(track),
                            title: track.title,
                            dexId: track.lead === "cry" ? chapter.dexId : undefined,
                          }));
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
                        void hearScript(async () => {
                          let line = "";
                          let dexId = chapter.dexId;
                          if (formMode && chapter.formId) {
                            if (!chapter.articleStatus) {
                              await ensureFormProse(card.kind === "gmax" ? "gmax" : "mega");
                            }
                            const fresh = (card.kind === "gmax" ? gmaxRef : megaRef).current.chapters.find(
                              (item) => item.key === chapter.key,
                            );
                            line = fresh?.tracks[0] ? trackSpeech(fresh.tracks[0]) : "";
                            dexId = fresh?.tracks[0]?.lead === "cry" ? fresh.dexId : undefined;
                          } else if (chapter.dexId && kind === "meet") {
                            const prefix = chapter.tracks[0]?.text.startsWith(POKEDEX_HOWTO) ? POKEDEX_HOWTO : "";
                            const speech =
                              factReading?.speech ?? (await speciesSpeech(chapter.dexId, chapter.title));
                            line = pronounce(`${prefix}${speech}`.replace(/\s+/g, " ").trim());
                            dexId = chapter.tracks.some((track) => track.lead === "cry") ? chapter.dexId : undefined;
                          } else {
                            line = chapter.tracks.map((track) => trackSpeech(track)).join(" ");
                            dexId = chapter.tracks.some((track) => track.lead === "cry") ? chapter.dexId : undefined;
                          }
                          if (!line) return null;
                          return { text: line, title: chapter.title, dexId };
                        });
                      }}
                    >
                      {speaking ? "Stop" : "Hear the entry"}
                    </Button>
                  )}
                </div>
                {hearError ? (
                  <p className="mt-3 text-sm leading-6 pk-danger" role="alert">
                    {hearError}
                  </p>
                ) : null}
                <audio ref={clipRef} controls className="mt-4 w-full max-w-md" preload="none" />
              </article>

              <details className="pk-card mt-4 px-5 py-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Put {card.rangeLabel} on a Yoto card
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {card.childDoes}{" "}
                  {randomGuess
                    ? "Send uploads a shadow of each 16×16 pixel for the clue, then the real pixel for the answer. The selected voice is recorded locally, the cry is mixed in front of the clue and again in front of the answer, and that file is what gets uploaded."
                    : formMode
                      ? "Send records the selected voice locally, mixes that Pokémon’s cry in front, then uploads that one file. The picture is the species 16×16 pixel. The credit stays on this page."
                      : randomFacts
                        ? "Send records the selected voice locally, mixes that Pokémon’s cry in front, then uploads the merged MP3. The how-to is in the playlist description and at the start of the first track."
                        : `This send is only ${card.rangeLabel}. Each fact is the cry, then the selected voice. The button above sends every Pokefacts playlist, one after another.`}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {isPiperVoice(voiceId)
                    ? "Send uses Piper on this computer. The cry is mixed in front, then that MP3 is uploaded."
                    : "Send uses the voice selected above. Yoto Labs turns the script into an MP3 in that voice."}
                </p>
                <label className="mt-3 grid gap-1 text-sm" htmlFor="yoto-playlist">
                  Add to a Yoto playlist
                  <select
                    id="yoto-playlist"
                    aria-label="Yoto playlist"
                    className="pk-field"
                    value={targetPlaylist}
                    onChange={(event) => setTargetPlaylist(event.target.value)}
                  >
                    <option value="">New playlist</option>
                    {library.map((item) => (
                      <option key={item.cardId} value={item.cardId}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                {libraryNote ? (
                  <p className="mt-2 text-sm leading-5 pk-danger" role="status">
                    {libraryNote}
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {targetPlaylist
                      ? "Send adds these tracks onto that playlist. Tracks already on it stay."
                      : "New playlist creates a card and does not replace one you already have."}
                  </p>
                )}
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
                  <StatusBar
                    label={job.detail}
                    done={job.done}
                    total={job.total}
                    failed={job.status === "failed"}
                  />
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
                  <p className="pk-quiet mt-3 text-xs leading-5">
                    {randomGuess
                      ? "These 50 riddles go on one card. Each track is the cry, then the selected voice. The clue never says the name. The answer does. The clue icon is the shadow. The answer icon is the real 16×16 pixel."
                      : formMode
                        ? `${card.libraryTitle} goes on one card. Each track is the cry, then the selected voice, with the species 16×16 pixel.`
                        : randomFacts
                          ? "These 100 Pokémon go on one card, in the selected voice, each with its 16×16 picture. Send all Pokefacts playlists when you want every species."
                          : `${card.rangeLabel} links to its own card. Send all Pokefacts playlists to cover every species, one card at a time.`}
                  </p>
                )}
              </details>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs leading-5 font-bold text-ink sm:px-6">
        Unofficial fan catalogue and cards. Not made by Nintendo, Game Freak, Creatures, or Yoto.
        Pokémon names and the Pokédex lines are from the games. The short notes are written for this app.{" "}
        <a className="underline decoration-poke-red decoration-2" href={DONATE_URL} target="_blank" rel="noreferrer">
          Buy me a coffee
        </a>{" "}
        if you want to support it.
      </footer>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
