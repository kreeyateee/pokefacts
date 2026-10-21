"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";
import { Catalogue } from "@/components/catalogue";
import { PlaybackPanel } from "@/components/playback-panel";
import { SendBanner, toastSendAllReady, toastSendReady, toastSendStarted } from "@/components/send-banner";
import { SetupGuide } from "@/components/setup-guide";
import { CardOptionsDialog } from "@/components/card-options-dialog";
import { ConnectDialog } from "@/components/connect-dialog";
import { MusicPanel } from "@/components/music-panel";
import { MysterySilhouette } from "@/components/mystery-silhouette";
import { StickerStudio } from "@/components/sticker-studio";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_COLLECTION,
  isCollectionKind,
  pageHeading,
  playlistNote,
  primaryTabFor,
  type CollectionKind,
  type PrimaryTabId,
} from "@/lib/app-nav";
import {
  applySpeciesSpeech,
  bulkProgressLabel,
  chapterPictureId,
  factPoolFromCards,
  factsBulkPlaylists,
  factsPlaylistUpload,
  formPlaylist,
  formPlaylists,
  formPlaylistUpload,
  guessPoolFromCards,
  isFormPlaylistKind,
  isSpeciesPlaylistKind,
  speciesPlaylists,
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
  type FormPlaylistKind,
  type KidCard,
  type KidCardKind,
} from "@/lib/kid-cards";
import { artworkSrc as artworkApi } from "@/lib/artwork-path";
import { artworkSrc } from "@/lib/page-artwork";
import { riddleParts } from "@/lib/dex-facts";
import { pronounce } from "@/lib/pronounce";
import { spokenDexLine, statusWithDexNote, WIKI_DEX_NOTE } from "@/lib/spoken-wiki";
import { selectionUpload } from "@/lib/selection-playlist";
import { DONATE_URL, SOURCE_URL } from "@/lib/site";
import { defaultPlayback, readPlayback, type PlaybackSettings } from "@/lib/playback-settings";
import { demoHearBody, factTrackBody, readVoiceId, writeVoiceId } from "@/lib/voice-choice";
import {
  asSendFailure,
  isRateLimited,
  looksLikeGateway,
  SendFailure,
  statusErrorText,
  validYotoCardId,
} from "@/lib/yoto-error";
import { isPiperVoice } from "@/lib/piper-voice";
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
  cardId?: string;
  result?: { cardId?: string; contentId?: string; title?: string; card?: { cardId?: string } };
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
  const pictures = card.chapters.filter((chapter) => {
    const id = chapterPictureId(chapter);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const media: Record<number, string> = {};
  let finished = 0;
  await mapPool(pictures, async (chapter) => {
    const id = chapterPictureId(chapter);
    if (!id) return;
    media[id] = await uploadIcon(id);
    finished += 1;
    onProgress?.(finished, pictures.length);
  });
  return media;
}

function nameOnlySpeech(name: string, speech: string): boolean {
  const clean = speech.replace(/\s+/g, " ").trim();
  const title = name.replace(/\s+/g, " ").trim();
  return !clean || clean === title || clean === `${title}.`;
}

function chapterDexText(chapter: { title: string; tracks: Array<{ text?: string }> }): string {
  const raw = chapter.tracks[0]?.text ?? "";
  const body = raw.startsWith(POKEDEX_HOWTO) ? raw.slice(POKEDEX_HOWTO.length) : raw;
  const text = body.replace(/\s+/g, " ").trim();
  return nameOnlySpeech(chapter.title, text) ? "" : text;
}

function playlistDexNote(card: { chapters: Array<{ articleNotice?: string }> }): string {
  return card.chapters.some((chapter) => chapter.articleNotice) ? WIKI_DEX_NOTE : "";
}

async function speciesSpeech(id: number, name: string): Promise<{ speech: string; notice: string }> {
  try {
    const response = await fetch(`/api/catalogue/${id}/biology`);
    const payload = (await response.json()) as { speech?: string; notice?: string };
    const speech = payload.speech?.replace(/\s+/g, " ").trim() ?? "";
    const notice = payload.notice?.replace(/\s+/g, " ").trim() ?? "";
    if (!nameOnlySpeech(name, speech)) return { speech, notice };
  } catch {
    // The chapter still has the catalogue line. A name alone is not the track.
  }
  return { speech: "", notice: WIKI_DEX_NOTE };
}

async function speechesFor(
  card: KidCard,
  onProgress?: (done: number, total: number, notice: string) => void,
): Promise<{ speech: Record<number, string>; notice: string }> {
  const ids: number[] = [];
  const names = new Map<number, string>();
  for (const chapter of card.chapters) {
    if (!chapter.dexId || names.has(chapter.dexId)) continue;
    names.set(chapter.dexId, chapter.title);
    ids.push(chapter.dexId);
  }
  const map: Record<number, string> = {};
  let notice = "";
  let finished = 0;
  await mapPool(ids, async (id) => {
    if (!id) return;
    const reading = await speciesSpeech(id, names.get(id) ?? "This Pokémon");
    if (reading.speech) map[id] = reading.speech;
    if (reading.notice) notice = reading.notice;
    finished += 1;
    onProgress?.(finished, ids.length, notice);
  });
  return { speech: map, notice };
}

type FormReading = {
  speech: string;
  url: string;
  status: "ready" | "missing" | "unavailable";
  notice: string;
};

async function formReading(formId: number): Promise<FormReading> {
  try {
    const response = await fetch(`/api/forms/${formId}`);
    const payload = (await response.json()) as {
      speech?: string;
      name?: string;
      speciesId?: number;
      notice?: string;
      article?: { url?: string; status?: string };
    };
    const status = payload.article?.status;
    const safe = status === "ready" || status === "missing" || status === "unavailable" ? status : "unavailable";
    const name = payload.name?.replace(/\s+/g, " ").trim() ?? "";
    let speech = payload.speech?.replace(/\s+/g, " ").trim() ?? "";
    let notice = payload.notice?.replace(/\s+/g, " ").trim() ?? "";
    if (nameOnlySpeech(name, speech) && payload.speciesId) {
      try {
        const entryResponse = await fetch(`/api/catalogue/${payload.speciesId}`);
        const entryPayload = (await entryResponse.json()) as { entry?: { info?: string } };
        const info = entryPayload.entry?.info?.replace(/\s+/g, " ").trim() ?? "";
        if (info) {
          speech = spokenDexLine(name || "This Pokémon", info);
          notice = notice || WIKI_DEX_NOTE;
        }
      } catch {
        notice = notice || WIKI_DEX_NOTE;
      }
    }
    return {
      speech,
      url: payload.article?.url ?? "",
      status: safe,
      notice,
    };
  } catch {
    return { speech: "", url: "", status: "unavailable", notice: WIKI_DEX_NOTE };
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
        articleNotice: reading.notice || undefined,
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
      <a className="underline" href={url} target="_blank" rel="noreferrer">
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

function RiddleReading({ text }: { text: string }) {
  const parts = riddleParts(text);
  return (
    <>
      <ol className="grid gap-2">
        {parts.clues.map((clue, index) => (
          <li key={`${index}-${clue.slice(0, 24)}`} className="pk-clue">
            <span className="pk-clue-num">{index + 1}</span>
            <span>{clue}</span>
          </li>
        ))}
      </ol>
      {parts.countdown ? <p className="pk-countdown">{parts.countdown}</p> : null}
    </>
  );
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

/** Species number on the page. A repeated form keeps a unique Yoto overlay such as 678b. */
function chapterNumber(item: { overlay: string; dexId?: number }): string {
  return item.dexId ? String(item.dexId) : item.overlay;
}

/** Species art is the fallback for a missing species file. A form picture never swaps to the base species. */
function pictureFallback(item: { formId?: number; dexId?: number; sprite?: string }): string | undefined {
  if (item.formId || !item.dexId || !item.sprite) return undefined;
  const species = artworkSrc(item.dexId);
  return item.sprite !== species ? species : undefined;
}

function hideBrokenPicture(event: { currentTarget: HTMLImageElement }): void {
  const image = event.currentTarget;
  const fallback = image.dataset.fallback;
  if (fallback && image.dataset.tried !== "1" && image.getAttribute("src") !== fallback) {
    image.dataset.tried = "1";
    image.src = fallback;
    return;
  }
  image.style.display = "none";
}

function revealChoice(nav: HTMLElement) {
  const selected = nav.querySelector<HTMLElement>('[aria-current="true"]');
  if (!selected) return;
  const navRect = nav.getBoundingClientRect();
  const itemRect = selected.getBoundingClientRect();
  const vertical = window.matchMedia("(min-width: 768px)").matches;
  if (vertical) {
    if (itemRect.top >= navRect.top && itemRect.bottom <= navRect.bottom) return;
    nav.scrollTop += itemRect.top - navRect.top - (nav.clientHeight - selected.clientHeight) / 2;
    return;
  }
  if (itemRect.left >= navRect.left && itemRect.right <= navRect.right) return;
  nav.scrollLeft += itemRect.left - navRect.left - (nav.clientWidth - selected.clientWidth) / 2;
}

type PlaylistMap = Record<FormPlaylistKind | "legendary" | "mythical", KidCard[]>;

function readsSpeciesBiology(kind: KidCardKind): boolean {
  return kind === "meet" || kind === "legendary" || kind === "mythical";
}

function activePlaylist(lists: PlaylistMap, kind: keyof PlaylistMap, id: string): KidCard | undefined {
  return lists[kind].find((item) => item.id === id) ?? lists[kind][0];
}

export function Studio({
  cards,
  mega = formPlaylist("mega", []),
  gmax = formPlaylist("gmax", []),
  alola = formPlaylists("alola", []),
  hisui = formPlaylists("hisui", []),
  legendary = speciesPlaylists("legendary", []),
  mythical = speciesPlaylists("mythical", []),
}: {
  cards: KidCard[];
  mega?: KidCard;
  gmax?: KidCard;
  alola?: KidCard[];
  hisui?: KidCard[];
  legendary?: KidCard[];
  mythical?: KidCard[];
}) {
  const factsCards = cards.filter((card) => card.kind === "meet");
  const factPool = factPoolFromCards(cards);
  const guessPool = guessPoolFromCards(cards);
  const factsPlaylists = factsBulkPlaylists(cards);
  const [randomCard, setRandomCard] = useState(() => randomPokedexCard(factPool, mulberry32(20261018)));
  const [guessCard, setGuessCard] = useState(() => randomGuessCard(guessPool, mulberry32(20261018)));
  const initialPlaylists: PlaylistMap = {
    mega: [mega],
    gmax: [gmax],
    alola,
    hisui,
    legendary,
    mythical,
  };
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const playlistsRef = useRef(initialPlaylists);
  const formLoad = useRef<Partial<Record<FormPlaylistKind, Promise<void>>>>({});
  const [playlistId, setPlaylistId] = useState<Record<keyof PlaylistMap, string>>({
    mega: mega.id,
    gmax: gmax.id,
    alola: alola[0]?.id ?? "alolan-forms",
    hisui: hisui[0]?.id ?? "hisuian-forms",
    legendary: legendary[0]?.id ?? "legendary",
    mythical: mythical[0]?.id ?? "mythical",
  });
  const [factSpeech, setFactSpeech] = useState<{ id: number; speech: string; url: string; notice: string } | null>(
    null,
  );
  const [view, setView] = useState<"cards" | "catalogue" | "setup" | "music">("cards");
  const [playback, setPlayback] = useState<PlaybackSettings>(defaultPlayback);
  const [kind, setKind] = useState<KidCardKind>("meet");
  const [collectionKind, setCollectionKind] = useState<CollectionKind>(DEFAULT_COLLECTION);
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
  const [stickersOpen, setStickersOpen] = useState(false);
  const [cardPrompt, setCardPrompt] = useState<{ confirmLabel: string; newTitle: string } | null>(null);
  const pendingCardAction = useRef<(() => void | Promise<void>) | null>(null);
  const [ready, setReady] = useState(false);
  const choiceListRef = useRef<HTMLElement | null>(null);
  const clipRef = useRef<HTMLAudioElement | null>(null);
  const clipUrl = useRef<string | null>(null);
  const hearAbort = useRef<AbortController | null>(null);
  const speakingRef = useRef(false);
  const sendingRef = useRef(false);

  const cardId = kind === "meet" ? factsId : guessId;
  const playlistCard =
    isFormPlaylistKind(kind) || isSpeciesPlaylistKind(kind)
      ? activePlaylist(playlists, kind, playlistId[kind])
      : undefined;
  const card =
    playlistCard ??
    (cardId === RANDOM_POKEDEX_ID
      ? randomCard
      : cardId === RANDOM_GUESS_ID
        ? guessCard
        : (cards.find((item) => item.id === cardId) ?? cards.find((item) => item.kind === kind)));
  const randomFacts = card?.id === RANDOM_POKEDEX_ID;
  const randomGuess = card?.id === RANDOM_GUESS_ID;
  const chapter =
    card?.chapters.find((item) => item.key === chapterKey) ??
    (card ? playableChapters(card)[0] : undefined);
  const rangeCards =
    isFormPlaylistKind(kind) || isSpeciesPlaylistKind(kind)
      ? playlists[kind]
      : kind === "meet"
        ? [randomCard, ...factsCards]
        : [guessCard];
  const listed = (card ? playableChapters(card) : []).filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    if (card?.kind === "guess") return item.overlay.includes(needle);
    const number = chapterNumber(item);
    return (
      item.title.toLowerCase().includes(needle) ||
      number === needle ||
      item.overlay.toLowerCase() === needle
    );
  });

  useEffect(() => {
    let cancelled = false;
    setVoiceId(readVoiceId(localStorage));
    setPlayback(readPlayback(localStorage));
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

  const factFallback = chapter ? chapterDexText(chapter) : "";

  useEffect(() => {
    if (!readsSpeciesBiology(kind) || !chapter?.dexId) return;
    const id = chapter.dexId;
    const name = chapter.title;
    const fallback = factFallback;
    const controller = new AbortController();
    void fetch(`/api/catalogue/${id}/biology`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          speech?: string;
          notice?: string;
          biology?: { url?: string };
        };
        if (controller.signal.aborted) return;
        const speech = payload.speech?.replace(/\s+/g, " ").trim() ?? "";
        const notice = payload.notice?.replace(/\s+/g, " ").trim() ?? "";
        const failed = nameOnlySpeech(name, speech);
        setFactSpeech({
          id,
          speech: failed ? fallback || `${name}.` : speech,
          url: failed ? "" : (payload.biology?.url ?? ""),
          notice: failed ? notice || WIKI_DEX_NOTE : notice,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setFactSpeech({
          id,
          speech: fallback || `${name}.`,
          url: "",
          notice: WIKI_DEX_NOTE,
        });
      });
    return () => controller.abort();
  }, [kind, chapter?.dexId, chapter?.title, factFallback]);

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
    if (isCollectionKind(next.kind)) setCollectionKind(next.kind);
    if (next.kind === "meet") setFactsId(next.id);
    else if (next.kind === "guess") setGuessId(next.id);
    else if (isFormPlaylistKind(next.kind) || isSpeciesPlaylistKind(next.kind)) {
      const playlistKind = next.kind;
      setPlaylistId((current) => ({ ...current, [playlistKind]: next.id }));
    }
    setChapterKey(playableChapters(next)[0]?.key ?? "start");
  }

  function rememberFormLists(nextKind: FormPlaylistKind, next: KidCard[]) {
    const updated = { ...playlistsRef.current, [nextKind]: next };
    playlistsRef.current = updated;
    setPlaylists(updated);
  }

  function ensureFormProse(
    nextKind: FormPlaylistKind,
    onProgress?: (detail: string) => void,
  ): Promise<void> {
    const existing = formLoad.current[nextKind];
    if (existing) return existing;
    const job = (async () => {
      const source = playlistsRef.current[nextKind];
      let current = source;
      const pending = current.flatMap((card) => card.chapters.filter((chapter) => chapter.formId && !chapter.articleStatus));
      let finished = 0;
      const label = current.find((card) => card.chapters.length > 0)?.title ?? "Forms";
      const readings = await mapPool(pending, async (chapter) => {
        const reading = chapter.formId ? await formReading(chapter.formId) : null;
        finished += 1;
        onProgress?.(
          statusWithDexNote(`${label}, description ${finished} of ${pending.length}`, reading?.notice ?? ""),
        );
        return { formId: chapter.formId, reading };
      });
      for (const item of readings) {
        const formId = item.formId;
        const reading = item.reading;
        if (!formId || !reading) continue;
        current = current.map((card) =>
          card.chapters.some((chapter) => chapter.formId === formId)
            ? withFormReading(card, formId, reading)
            : card,
        );
      }
      if (readings.length > 0) rememberFormLists(nextKind, current);
    })();
    formLoad.current[nextKind] = job;
    return job;
  }

  function showKind(nextKind: KidCardKind) {
    stopDemo();
    setRevealed(false);
    if (view !== "cards" || nextKind !== kind) {
      setQuery("");
    }
    setView("cards");
    setKind(nextKind);
    if (isCollectionKind(nextKind)) setCollectionKind(nextKind);
    if (isFormPlaylistKind(nextKind) || isSpeciesPlaylistKind(nextKind)) {
      const next = activePlaylist(playlistsRef.current, nextKind, playlistId[nextKind]);
      setChapterKey(next ? (playableChapters(next)[0]?.key ?? "start") : "start");
      if (isFormPlaylistKind(nextKind)) void ensureFormProse(nextKind);
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


  function choosePrimary(id: PrimaryTabId) {
    if (id === "facts") {
      showKind("meet");
      return;
    }
    if (id === "guess") {
      showKind("guess");
      return;
    }
    if (id === "collections") {
      showKind(isCollectionKind(kind) ? kind : collectionKind);
      return;
    }
    stopDemo();
    setView(id);
  }

  function goHome() {
    showKind("meet");
  }

  function chooseHelp() {
    if (view === "setup") {
      showKind("meet");
      return;
    }
    stopDemo();
    setView("setup");
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
  }

  function chooseChapter(key: string) {
    stopDemo();
    setRevealed(false);
    setChapterKey(key);
  }

  useEffect(() => {
    const nav = choiceListRef.current;
    if (!nav) return;
    revealChoice(nav);
  }, [chapter?.key, card?.id, query, kind, view]);

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
        body: JSON.stringify(demoHearBody({ text: script, voiceId, dexId, title, mix: playback })),
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

  function markSending(next: boolean) {
    sendingRef.current = next;
    setSending(next);
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

  function scratchCardId(job: {
    cardId?: string;
    result?: { cardId?: string; contentId?: string; card?: { cardId?: string } };
  }): string | undefined {
    const id = job.result?.cardId || job.result?.contentId || job.result?.card?.cardId || job.cardId;
    return id && /^[\w-]{4,80}$/.test(id) ? id : undefined;
  }

  async function discardScratch(cardIds: string[]) {
    try {
      await yotoFetch("/api/yoto/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discardCardIds: cardIds, sweepScratch: true }),
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
                mix: playback,
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
            const cardId = scratchCardId(finished);
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
      await discardScratch([...scratch]);
    }
  }

  async function sendPrepared(playlist: KidCard, upload: PlaylistUpload, headline?: string) {
    const libraryTitle = upload.content.title || playlist.libraryTitle;
    const audio = await renderPlaylist(playlist, upload, libraryTitle);
    const prepared = applyFinishedAudio(upload, audio);
    if (prepared.create) delete prepared.content.cardId;
    return postPlaylist(playlist, prepared, headline ?? libraryTitle);
  }

  function askCardOptions(confirmLabel: string, newTitle: string, run: () => void | Promise<void>) {
    pendingCardAction.current = run;
    setCardPrompt({ confirmLabel, newTitle });
  }

  function confirmCardOptions() {
    const run = pendingCardAction.current;
    pendingCardAction.current = null;
    setCardPrompt(null);
    if (run) void run();
  }

  async function sendSelection(playlist: KidCard): Promise<void> {
    if (sendingRef.current) {
      throw new Error("Another playlist is still recording in the background.");
    }
    if (!(await connectedSession())) {
      throw new Error("Connect Yoto before building a playlist.");
    }
    const dexNote = playlistDexNote(playlist);
    markSending(true);
    toastSendStarted(playlist.libraryTitle);
    setJob({
      status: "sending",
      detail: statusWithDexNote(`Sending ${playlist.libraryTitle} to Yoto…`, dexNote),
    });
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
        detail: statusWithDexNote(
          chosenId
            ? `${updatedTitle ?? "The playlist"} was updated.`
            : `${playlist.libraryTitle} is in your Yoto library.`,
          dexNote,
        ),
        done: tracks,
        total: tracks,
      });
      toastSendReady(chosenId ? (updatedTitle ?? "The playlist") : playlist.libraryTitle, Boolean(chosenId));
      void loadLibrary();
    } catch (error) {
      const failure = asSendFailure(error, "The recording stopped.");
      reportFailure(failure.message);
      throw failure;
    } finally {
      markSending(false);
    }
  }

  async function send() {
    if (!card || sendingRef.current) return;
    if (!(await connectedSession())) return;
    markSending(true);
    setBulkActive(false);
    toastSendStarted(card.libraryTitle);
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
      const formKind = isFormPlaylistKind(card.kind);
      let dexNote = "";
      let spokenCard = card;
      if (!formKind && card.kind !== "guess") {
        const readings = await speechesFor(card, (done, total, notice) => {
          if (notice) dexNote = notice;
          setJob({
            status: "sending",
            detail: statusWithDexNote(`${card.libraryTitle}, description ${done} of ${total}`, notice),
            done,
            total,
          });
        });
        if (readings.notice) dexNote = readings.notice;
        spokenCard = applySpeciesSpeech(card, readings.speech);
      }
      if (isFormPlaylistKind(card.kind)) {
        await ensureFormProse(card.kind, (detail) => {
          if (detail.includes(WIKI_DEX_NOTE)) dexNote = WIKI_DEX_NOTE;
          setJob({ status: "sending", detail });
        });
      }
      const readyForm = isFormPlaylistKind(card.kind)
        ? (activePlaylist(playlistsRef.current, card.kind, card.id) ?? spokenCard)
        : spokenCard;
      if (!dexNote) dexNote = playlistDexNote(readyForm);
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
        detail: statusWithDexNote(
          chosenId
            ? `${updatedTitle ?? "The playlist"} was updated.`
            : `${card.rangeLabel} is in your Yoto library.`,
          dexNote,
        ),
        done: tracks,
        total: tracks,
      });
      toastSendReady(chosenId ? (updatedTitle ?? "The playlist") : card.libraryTitle, Boolean(chosenId));
      void loadLibrary();
    } catch (error) {
      const failure = asSendFailure(error, "The recording stopped.");
      reportFailure(failure.message);
    } finally {
      markSending(false);
    }
  }

  async function sendAllFacts() {
    if (sendingRef.current) return;
    if (!(await connectedSession())) return;
    const playlists = factsPlaylists;
    markSending(true);
    setBulkActive(true);
    toastSendStarted("All Pokefacts playlists");
    try {
      for (const playlist of playlists) forgetCard(playlist.id);
      const createdTitles: string[] = [];
      let dexNote = "";
      for (let index = 0; index < playlists.length; index += 1) {
        const playlist = playlists[index];
        if (!playlist) continue;
        const headline = bulkProgressLabel(index + 1, playlists.length);
        setJob({ status: "sending", detail: headline, done: index, total: playlists.length });
        try {
          const readings = await speechesFor(playlist, (done, total, notice) => {
            if (notice) dexNote = notice;
            setJob({
              status: "sending",
              detail: statusWithDexNote(`${playlist.libraryTitle}, description ${done} of ${total}`, notice),
              done,
              total,
            });
          });
          if (readings.notice) dexNote = readings.notice;
          const spoken = applySpeciesSpeech(playlist, readings.speech);
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
        detail: statusWithDexNote(
          `All ${playlists.length} Pokefacts playlists are in your Yoto library.`,
          dexNote,
        ),
        done: playlists.length,
        total: playlists.length,
      });
      toastSendAllReady(playlists.length);
    } catch (error) {
      const failure = asSendFailure(error, "The recording stopped.");
      reportFailure(failure.message);
    } finally {
      markSending(false);
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
  const formMode = card ? isFormPlaylistKind(card.kind) : false;
  const speciesSet = card ? isSpeciesPlaylistKind(card.kind) : false;
  const splitSet = (formMode || speciesSet) && rangeCards.length > 1;
  const factReading =
    readsSpeciesBiology(kind) && chapter?.dexId && factSpeech?.id === chapter.dexId ? factSpeech : null;
  const visibleTracks =
    guessing && !revealed ? chapter?.tracks.slice(0, 1) : chapter?.tracks;
  const source = visibleTracks?.find((track) => track.source)?.source;
  const mysteryId = guessing && !revealed ? chapter?.dexId : undefined;
  const portrait = mysteryId
    ? artworkSrc(mysteryId)
    : guessing && chapter?.dexId
      ? `/pixels/${chapter.dexId}.png`
      : guessing
        ? undefined
        : chapter?.sprite;

  const heading = pageHeading({
    view,
    kind,
    libraryTitle: card?.libraryTitle,
    randomFacts,
  });
  const thisPlaylist = card
    ? playlistNote({
        randomGuess,
        randomFacts,
        splitSet,
        formMode,
        speciesSet,
        rangeLabel: card.rangeLabel,
        libraryTitle: card.libraryTitle,
        blurb: card.blurb,
      })
    : "";

  return (
    <div className={job ? "pk-page pk-page-docked" : "pk-page"}>
      <AppHeader
        title={heading.title}
        blurb={heading.blurb}
        helpOpen={view === "setup"}
        session={session}
        onHome={goHome}
        onHelp={chooseHelp}
        onConnect={() => setConnectOpen(true)}
        onDisconnect={disconnect}
      />
      <AppNav
        selected={primaryTabFor(view, kind)}
        collection={isCollectionKind(kind) ? kind : collectionKind}
        onPrimary={choosePrimary}
        onCollection={showKind}
      />
      {view !== "setup" ? (
        <div className="mx-auto w-full min-w-0 max-w-5xl px-4 sm:px-6">
          <PlaybackPanel
            settings={playback}
            onChange={setPlayback}
            voiceId={voiceId}
            onVoiceId={(id) => setVoiceId(writeVoiceId(localStorage, id))}
          />
        </div>
      ) : null}

      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:px-6">
        <div key={view === "cards" ? `${view}-${kind}` : view} className="pk-view">
        {view === "setup" ? (
          <SetupGuide onConnect={() => setConnectOpen(true)} onHome={goHome} />
        ) : view === "catalogue" ? (
          <Catalogue
            sending={sending}
            onSendSelection={sendSelection}
            onPrepareSend={(confirmLabel, newTitle, run) => askCardOptions(confirmLabel, newTitle, run)}
            onBuildStart={() => {
              if (!sendingRef.current) setJob(null);
            }}
            playlists={library}
            playlistTarget={targetPlaylist}
            onPlaylistTarget={setTargetPlaylist}
            voiceId={voiceId}
            onVoiceId={(id) => setVoiceId(writeVoiceId(localStorage, id))}
            units={playback.units}
            job={job}
          />
        ) : view === "music" ? (
          <MusicPanel connected={Boolean(session)} onConnect={() => setConnectOpen(true)} voiceId={voiceId} />
        ) : card && chapter ? (
          <div className="grid min-w-0 gap-6 md:grid-cols-[17.5rem_minmax(0,1fr)]">
            <section className="order-1 min-w-0 md:col-span-2" aria-labelledby="playlist-heading">
              <h2 id="playlist-heading" className="pk-section-title">
                This playlist
              </h2>
              <div
                className="pk-scroll mt-2 flex gap-2 overflow-x-auto pb-1"
                role="listbox"
                aria-label={
                  guessing
                    ? "Who's That Pokémon playlists"
                    : formMode || speciesSet
                      ? `${card.title} playlists`
                      : "Facts playlists"
                }
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
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-sm leading-6 text-muted-foreground">{thisPlaylist}</p>
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
            </section>

            <div className="order-3 grid min-w-0 content-start gap-2 self-start md:order-2">
              <h2 className="pk-section-title">{guessing ? "Riddles" : "On this card"}</h2>
              <label className="grid gap-1 text-sm" htmlFor="picker">
                {guessing ? "Find a riddle" : "Find a Pokémon"}
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
                value={listed.some((item) => item.key === chapter.key) ? chapter.key : ""}
                onChange={(event) => {
                  const next = listed.find((item) => item.key === event.target.value);
                  if (next) chooseChapter(next.key);
                }}
              >
                {listed.length === 0 ? <option value="">Nothing matches</option> : null}
                {listed.some((item) => item.key === chapter.key) ? null : listed.length > 0 ? (
                  <option value="">Choose a match</option>
                ) : null}
                {listed.map((item) => (
                  <option key={item.key} value={item.key}>
                    {guessing ? `Riddle ${chapterNumber(item)}` : `${chapterNumber(item)}. ${item.title}`}
                  </option>
                ))}
              </select>
              <nav
                ref={choiceListRef}
                aria-label={guessing ? "Riddles" : "Pokémon"}
                className="pk-scroll flex gap-2 overflow-x-auto pb-1 md:grid md:max-h-[70dvh] md:content-start md:grid-cols-1 md:overflow-x-hidden md:overflow-y-auto"
              >
                {listed.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-muted-foreground">Nothing matches that search.</p>
                ) : null}
                {listed.map((item) => {
                  const selected = item.key === chapter.key;
                  const label = guessing ? `Riddle ${chapterNumber(item)}` : item.title;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => chooseChapter(item.key)}
                      aria-current={selected ? "true" : undefined}
                      className="pk-choice flex w-44 shrink-0 items-center gap-2 px-2.5 py-2 text-left text-sm md:w-auto md:shrink"
                    >
                      {!guessing && item.sprite ? (
                        <img
                          src={item.sprite}
                          alt=""
                          width={44}
                          height={44}
                          data-fallback={pictureFallback(item)}
                          onError={hideBrokenPicture}
                          className="pk-artwork-thumb"
                        />
                      ) : null}
                      <span className="min-w-0">{label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <article className="order-2 min-w-0 pk-card pk-dex px-4 py-6 sm:px-8 sm:py-8 md:order-3">
                <div key={chapter.key} className="pk-swap">
                <p className="pk-kicker">
                  {guessing
                    ? revealed
                      ? "Answer"
                      : "Clues"
                    : `Number ${chapterNumber(chapter)}`}
                </p>
                <div className="pk-hero">
                  {portrait && mysteryId ? (
                    <div className="pk-silhouette">
                      <MysterySilhouette src={portrait} fallback={artworkApi("species", mysteryId)} />
                    </div>
                  ) : portrait ? (
                    <img
                      src={portrait}
                      alt={chapter.title}
                      width={guessing ? 96 : 176}
                      height={guessing ? 96 : 176}
                      data-fallback={pictureFallback({
                        formId: chapter.formId,
                        dexId: chapter.dexId,
                        sprite: portrait,
                      })}
                      onError={hideBrokenPicture}
                      className={guessing ? "pk-sprite" : "pk-art"}
                    />
                  ) : null}
                  <h2 className="font-display text-4xl leading-tight sm:text-5xl">
                    {guessing && !revealed ? `Riddle ${chapter.overlay}` : chapter.title}
                  </h2>
                </div>
                <div className="mt-6 max-w-prose space-y-3 text-base leading-7">
                  {readsSpeciesBiology(kind) && chapter.dexId ? (
                    factReading ? (
                      <>
                        {factReading.notice ? (
                          <p className="text-sm text-muted-foreground" role="status">
                            {factReading.notice}
                          </p>
                        ) : null}
                        <p>{factReading.speech}</p>
                      </>
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
                      <>
                        {chapter.articleNotice ? (
                          <p className="text-sm text-muted-foreground" role="status">
                            {chapter.articleNotice}
                          </p>
                        ) : null}
                        <p>{formSpokenText(chapter)}</p>
                      </>
                    )
                  ) : guessing && !revealed ? (
                    <>
                      <p className="pk-howto">
                        Colour and type, two Pokédex lines, then the size. Shout the name before the count ends.
                      </p>
                      <RiddleReading text={visibleTracks?.[0]?.text ?? ""} />
                    </>
                  ) : guessing ? (
                    entryLines(chapter.tracks[1]?.text ?? "", chapter.title).map((line) => (
                      <p key={`${chapter.key}-answer-${line}`}>{line}</p>
                    ))
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
                {readsSpeciesBiology(kind) && factReading?.url && !factReading.notice ? (
                  <WikiCredit url={factReading.url} />
                ) : null}
                {formMode &&
                chapter.articleUrl &&
                chapter.articleStatus &&
                !chapter.articleNotice &&
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
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
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
                          if (formMode && chapter.formId && isFormPlaylistKind(card.kind)) {
                            if (!chapter.articleStatus) {
                              await ensureFormProse(card.kind);
                            }
                            const fresh = playlistsRef.current[card.kind]
                              .flatMap((item) => item.chapters)
                              .find((item) => item.key === chapter.key);
                            line = fresh?.tracks[0] ? trackSpeech(fresh.tracks[0]) : "";
                            dexId = fresh?.tracks[0]?.lead === "cry" ? fresh.dexId : undefined;
                          } else if (chapter.dexId && readsSpeciesBiology(kind)) {
                            const prefix = chapter.tracks[0]?.text.startsWith(POKEDEX_HOWTO) ? POKEDEX_HOWTO : "";
                            const shown =
                              factReading && !nameOnlySpeech(chapter.title, factReading.speech)
                                ? factReading.speech
                                : (await speciesSpeech(chapter.dexId, chapter.title)).speech;
                            const speech = shown || chapterDexText(chapter) || `${chapter.title}.`;
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
            <section className="order-4 min-w-0 pk-card px-5 py-4 md:col-span-2" aria-labelledby="yoto-send-heading">
              <h3 id="yoto-send-heading" className="font-display text-2xl">
                Make this card
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Send opens the voice and playlist choices first. Hear a sample there, then confirm. Recording
                continues in the background — a cheer pops up when it is ready, with a Buy me a coffee link. On
                the player: {card.childDoes} In the Yoto app, look for{" "}
                <span className="font-bold text-ink">{card.libraryTitle}</span>.
                {randomGuess
                  ? " Send uploads a shadow of each 16×16 pixel for the clue, then the real pixel for the answer."
                  : formMode
                    ? " The picture on the card is the species 16×16 pixel."
                    : speciesSet
                      ? " The Yoto icon is the 16×16 pixel."
                      : ""}
              </p>
              <label className="mt-3 grid gap-1 text-sm" htmlFor="yoto-playlist">
                Where it goes
                <select
                  id="yoto-playlist"
                  aria-label="Yoto playlist"
                  className="pk-field"
                  value={targetPlaylist}
                  onChange={(event) => setTargetPlaylist(event.target.value)}
                >
                  <option value="">Make a new playlist</option>
                  {library.map((item) => (
                    <option key={item.cardId} value={item.cardId}>
                      Add to {item.title}
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
                    ? "Adds these tracks at the end. Tracks already on that playlist stay."
                    : `Makes a new playlist named ${card.libraryTitle}. Playlists you already have stay as they are.`}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-11 px-4"
                  disabled={sending || !ready}
                  onClick={() =>
                    askCardOptions(
                      randomGuess
                        ? "Send these 50 riddles"
                        : randomFacts
                          ? "Send these 100"
                          : `Send ${card.rangeLabel}`,
                      card.libraryTitle,
                      () => send(),
                    )
                  }
                >
                  {sending && !bulkActive
                    ? "Recording in the background…"
                    : randomGuess
                      ? "Send these 50 riddles"
                      : randomFacts
                        ? "Send these 100"
                        : `Send ${card.rangeLabel}`}
                </Button>
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setStickersOpen(true)}>
                  Print stickers
                </Button>
                {kind === "meet" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-4"
                    disabled={sending || !ready}
                    onClick={() =>
                      askCardOptions(
                        `Send all ${factsPlaylists.length} playlists`,
                        "Pokefacts 1",
                        () => sendAllFacts(),
                      )
                    }
                  >
                    {sending && bulkActive
                      ? "Recording in the background…"
                      : `Send all ${factsPlaylists.length} playlists`}
                  </Button>
                ) : null}
              </div>
              {kind === "meet" ? (
                <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
                  Send all records every Pokefacts playlist, so all 1,025 Pokémon are covered. Each playlist stays at
                  100 tracks or fewer.
                </p>
              ) : null}
              <div className="mt-4">
                <p className="text-sm font-bold">
                  {job?.status === "completed" ? "Ready to link" : "After it finishes"}
                </p>
                <ol className="mt-2 grid list-decimal gap-2 pl-4 text-sm leading-6">
                  <li>Open the Yoto app and go to Make Your Own.</li>
                  <li>
                    Find <span className="font-bold">{card.libraryTitle}</span>.
                  </li>
                  <li>Choose Link to a card.</li>
                  <li>Hold a blank Make Your Own card to the player.</li>
                  <li>The next playlist needs a different blank card.</li>
                </ol>
              </div>
            </section>
          </div>
        ) : null}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs leading-5 font-bold text-ink sm:px-6">
        Unofficial fan catalogue and cards. Not made by Nintendo, Game Freak, Creatures, or Yoto.
        Pokémon names and the Pokédex lines are from the games. The short notes are written for this app.{" "}
        <a className="underline decoration-poke-red decoration-2" href={DONATE_URL} target="_blank" rel="noreferrer">
          Buy me a coffee
        </a>
        {" · "}
        <a className="underline decoration-poke-red decoration-2" href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        .
      </footer>

      <SendBanner job={job} onDismiss={() => setJob(null)} />
      {stickersOpen && card ? (
        <StickerStudio key={card.id} card={card} cards={rangeCards} onClose={() => setStickersOpen(false)} />
      ) : null}
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <CardOptionsDialog
        open={Boolean(cardPrompt)}
        onOpenChange={(open) => {
          if (!open) {
            pendingCardAction.current = null;
            setCardPrompt(null);
          }
        }}
        confirmLabel={cardPrompt?.confirmLabel ?? "Send"}
        onConfirm={confirmCardOptions}
        voiceId={voiceId}
        onVoiceId={(id) => setVoiceId(writeVoiceId(localStorage, id))}
        playback={playback}
        onPlayback={setPlayback}
        targetPlaylist={targetPlaylist}
        onTargetPlaylist={setTargetPlaylist}
        library={library}
        newTitle={cardPrompt?.newTitle ?? card?.libraryTitle ?? "Pokefacts"}
      />
    </div>
  );
}
