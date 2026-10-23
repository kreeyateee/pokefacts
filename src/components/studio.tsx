"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { AdventurePanel } from "@/components/adventure-panel";
import { AppHeader } from "@/components/app-header";
import { AppNav, type ShelfPicture } from "@/components/app-nav";
import { EntryCard, EntryPager } from "@/components/entry-card";
import { Catalogue } from "@/components/catalogue";
import { PlaybackPanel } from "@/components/playback-panel";
import { CoffeeNudge } from "@/components/coffee-nudge";
import { FavouritesBar, FavouritesDialog, useFavourites } from "@/components/favourites";
import { JokeBox } from "@/components/joke-box";
import { FAVOURITES_ASKED_KEY } from "@/lib/favourites";
import { playlistCoverPng } from "@/components/cover-art";
import { SendBanner, toastSendAllReady, toastSendReady, toastSendStarted } from "@/components/send-banner";
import { SetupGuide } from "@/components/setup-guide";
import { CardOptionsDialog } from "@/components/card-options-dialog";
import { ConnectDialog } from "@/components/connect-dialog";
import { MyoCardButton, MyoCardDialog, openAfterDialog, type MyoCardView } from "@/components/myo-card-dialog";
import { MusicPanel } from "@/components/music-panel";
import { MysterySilhouette } from "@/components/mystery-silhouette";
import { YotoScreen } from "@/components/yoto-screen";
import { PrintablesPanel } from "@/components/printables-panel";
import { nextFreeTitle, playlistNamed, type NameClash } from "@/lib/playlist-names";
import { StickerStudio } from "@/components/sticker-studio";
import { SupportBox } from "@/components/support-box";
import { Button } from "@/components/ui/button";
import {
  isReadyKind,
  pageHeading,
  playlistNote,
  sectionFor,
  readSavedTab,
  SAVED_TAB_KEY,
  viewForSection,
  type ReadyKind,
  type SectionId,
  type SavedTab,
  type StudioView,
} from "@/lib/app-nav";
import {
  applySpeciesSpeech,
  bulkProgressLabel,
  chapterPictureId,
  coverArtworkId,
  factPoolFromCards,
  factsBulkPlaylists,
  factsPlaylistUpload,
  formPlaylist,
  formPlaylists,
  formPlaylistUpload,
  guessPoolFromCards,
  isFormPlaylistKind,
  isSpeciesPlaylistKind,
  jokePlaylist,
  speciesPlaylists,
  guessUpload,
  mulberry32,
  countSpokenTracks,
  entrySpeech,
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
import { yotoPixelSrc } from "@/lib/yoto-screen";
import { riddleParts } from "@/lib/dex-facts";
import { pronounce } from "@/lib/pronounce";
import { spokenDexLine, statusWithDexNote, WIKI_DEX_NOTE } from "@/lib/spoken-wiki";
import { selectionUpload } from "@/lib/selection-playlist";
import { adventureCoverCard, coverUploadRequest } from "@/lib/playlist-cover";
import { stickerCard } from "@/lib/sticker-cover";
import { withoutVoiceTags } from "@/lib/voice-tags";
import { DONATE_URL, SOURCE_URL } from "@/lib/site";
import { defaultPlayback, readPlayback, type MixSettings, type PlaybackSettings } from "@/lib/playback-settings";
import {
  PENDING_SEND_KEY,
  SEND_LOCK_BEAT_MS,
  SEND_LOCK_KEY,
  finishedTrackCount,
  isSendDone,
  readPendingSend,
  sendLockFree,
  sendLockValue,
  serializePendingSend,
  startPendingSend,
  unfinishedJobs,
  withCover,
  withCurrent,
  withDexNote,
  withFailure,
  withoutFailure,
  withoutScratch,
  withPlaylistSent,
  withScratch,
  withTrackDone,
  withoutTracks,
  type PendingBulk,
  type PendingPlaylist,
  type PendingSend,
} from "@/lib/pending-send";
import { forgetMissingMedia, healingText, missingMediaError, postWithMediaHeal } from "@/lib/media-heal";
import { demoHearBody, factTrackBody, readVoiceId, writeVoiceId } from "@/lib/voice-choice";
import {
  asSendFailure,
  gatewayRetryDelay,
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
  applyPlaylistCover,
  bulkFailureText,
  factsBulkUpload,
  finishedPlaylistId,
  freeSlotMessage,
  libraryPlaylists,
  mapPool,
  renderJobs,
  retitledUpload,
  uploadForPlaylist,
  type FinishedAudio,
  type PlaylistUpload,
  type RenderJob,
} from "@/lib/yoto-send";
import { isYotoCoverUrl, yotoPlaylistUrl } from "@/lib/yoto-playlist";
import { storyCard, storyPixels } from "@/lib/story/story-card";
import { storyTrackCount } from "@/lib/story/story-check";
import { adventureSendId, pollFailureFallsBack, VOICE_FALLBACK_NOTE } from "@/lib/story/voice-fallback";
import type { StoryGraph } from "@/lib/story/story-graph";
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
  cardId?: string;
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

/** Thrown when the parent taps Cancel, so the send stops between steps. */
class SendCancelled extends Error {}

function readStoredPendingSend(): PendingSend | null {
  try {
    return readPendingSend(localStorage.getItem(PENDING_SEND_KEY), Date.now());
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Yoto's full reply goes to the console. The page shows one plain sentence. */
function logYotoReply(what: string, status: number, payload: unknown) {
  console.warn(`${what} (HTTP ${status})`, payload);
}

async function readApi(response: Response, fallback: string): Promise<unknown> {
  const payload = await readBody(response);
  if (!response.ok || looksLikeGateway(response.status, payload)) {
    logYotoReply(fallback, response.status, payload);
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

function readSessionTab(): SavedTab | null {
  try {
    return readSavedTab(sessionStorage.getItem(SAVED_TAB_KEY));
  } catch {
    return null;
  }
}

function playableChapters(card: KidCard) {
  return card.chapters.filter((chapter) => chapter.key !== "start");
}

/** One of Pokefacts' own 16×16 pictures, such as the Poké Ball. */
function uploadNamedIcon(name: string): Promise<string> {
  return uploadIconFrom(`/api/yoto/icon?name=${encodeURIComponent(name)}`);
}

function uploadIcon(id: number, shadow = false): Promise<string> {
  return uploadIconFrom(`/api/yoto/icon?id=${id}${shadow ? "&shadow=1" : ""}`);
}

async function uploadIconFrom(path: string): Promise<string> {
  const fallback = "Yoto did not take the 16×16 picture.";
  let gatewayMisses = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    let payload: unknown;
    try {
      response = await yotoFetch(path, { method: "POST" });
      payload = await readBody(response);
    } catch (error) {
      // The site restarting or the network dropping: wait it out rather than failing the send.
      const failure = asSendFailure(error, fallback);
      const wait = failure.gateway ? gatewayRetryDelay(gatewayMisses++) : null;
      if (wait === null) throw failure;
      await delay(wait);
      attempt -= 1;
      continue;
    }
    if (isRateLimited(response.status, payload) && attempt < 3) {
      await delay(Math.min(8_000, 800 * (attempt + 1)));
      continue;
    }
    if (looksLikeGateway(response.status, payload)) {
      const wait = gatewayRetryDelay(gatewayMisses++);
      if (wait !== null) {
        await delay(wait);
        attempt -= 1;
        continue;
      }
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

/**
 * The playlist's cover: the card's sticker front with the playlist's name on it, drawn in this page.
 * The bare artwork if drawing fails. A Who's That card never falls back to its first answer's artwork.
 */
async function uploadCover(current: PendingPlaylist): Promise<string | undefined> {
  try {
    const drawn = await playlistCoverPng(current).catch(() => null);
    const request = coverUploadRequest(drawn, current.coverHidden ? undefined : current.coverId);
    if (!request) return undefined;
    const response = await yotoFetch(request.path, request.init);
    const payload = await readBody(response);
    if (!response.ok) return undefined;
    const imageL = (payload as { imageL?: unknown } | null)?.imageL;
    return isYotoCoverUrl(imageL) ? imageL : undefined;
  } catch {
    return undefined;
  }
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
  return withoutVoiceTags(chapter.tracks[0]?.text ?? "").replace(/\s+/g, " ").trim();
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
      // A picked form answers with its own pixel. Forms have no shadow, so its clue uses the species shadow.
      const pictureId = chapterPictureId(chapter) ?? id;
      real[pictureId] = await uploadIcon(pictureId);
      shadow[id] = await uploadIcon(id, true);
    },
  );
  return { real, shadow };
}

function RiddleReading({ text }: { text: string }) {
  const parts = riddleParts(withoutVoiceTags(text));
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
  return withoutVoiceTags(text)
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

type PlaylistMap = Record<FormPlaylistKind | "legendary" | "mythical" | "starter" | "joke", KidCard[]>;

/** One picture for each set on the ready-made shelf. Who's That shows a shadow. */
function shelfPicturesFor(lists: PlaylistMap): Partial<Record<ReadyKind, ShelfPicture>> {
  const pictures: Partial<Record<ReadyKind, ShelfPicture>> = {
    meet: { src: artworkSrc(25), fallback: artworkApi("species", 25) },
    guess: { src: artworkSrc(133), fallback: artworkApi("species", 133), shadow: true },
  };
  for (const kind of Object.keys(lists) as Array<keyof PlaylistMap>) {
    for (const card of lists[kind]) {
      const first = playableChapters(card).find((chapter) => chapter.sprite);
      if (!first?.sprite) continue;
      pictures[kind] = { src: first.sprite, fallback: pictureFallback(first) };
      break;
    }
  }
  return pictures;
}

function readsSpeciesBiology(kind: KidCardKind): boolean {
  return kind === "meet" || isSpeciesPlaylistKind(kind);
}

/** A set whose cards are kept in the playlist map: the forms, the species sets, and the Joke Book. */
function isPlaylistMapKind(kind: KidCardKind): kind is keyof PlaylistMap {
  return kind === "joke" || isFormPlaylistKind(kind) || isSpeciesPlaylistKind(kind);
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
  starter = speciesPlaylists("starter", []),
  joke = [jokePlaylist([])],
}: {
  cards: KidCard[];
  mega?: KidCard;
  gmax?: KidCard;
  alola?: KidCard[];
  hisui?: KidCard[];
  legendary?: KidCard[];
  mythical?: KidCard[];
  starter?: KidCard[];
  joke?: KidCard[];
}) {
  const factsCards = cards.filter((card) => card.kind === "meet");
  const factPool = factPoolFromCards(cards);
  const guessPool = guessPoolFromCards(cards);
  const factsPlaylists = factsBulkPlaylists(cards);
  const [randomCard, setRandomCard] = useState(() => randomPokedexCard(factPool, mulberry32(20261018)));
  const [guessCard, setGuessCard] = useState(() => randomGuessCard(guessPool, mulberry32(20261018)));
  const [favourites, setFavourites] = useFavourites();
  const [favouritesOpen, setFavouritesOpen] = useState(false);
  const initialPlaylists: PlaylistMap = {
    mega: [mega],
    gmax: [gmax],
    alola,
    hisui,
    legendary,
    mythical,
    starter,
    joke,
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
    starter: starter[0]?.id ?? "starters",
    joke: joke[0]?.id ?? "jokes",
  });
  const [factSpeech, setFactSpeech] = useState<{ id: number; speech: string; url: string; notice: string } | null>(
    null,
  );
  const [view, setView] = useState<StudioView>("cards");
  const [playback, setPlayback] = useState<PlaybackSettings>(defaultPlayback);
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
  /** When a new playlist's name is already in the library: a numbered name, or in place of the old one. */
  const [nameClash, setNameClash] = useState<NameClash>("number");
  const [speaking, setSpeaking] = useState(false);
  const [hearError, setHearError] = useState("");
  const [sending, setSending] = useState(false);
  const [bulkActive, setBulkActive] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [cardPrompt, setCardPrompt] = useState<{ confirmLabel: string; newTitle: string } | null>(null);
  const [myoCard, setMyoCard] = useState<MyoCardView | null>(null);
  const pendingCardAction = useRef<(() => void | Promise<void>) | null>(null);
  const myoTimer = useRef<number | null>(null);
  const tabRestored = useRef(false);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const pendingRef = useRef<PendingSend | null>(null);
  const cancelRef = useRef(false);
  const lockOwner = useRef("");
  const lockBeat = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const choiceListRef = useRef<HTMLElement | null>(null);
  const clipRef = useRef<HTMLAudioElement | null>(null);
  const clipUrl = useRef<string | null>(null);
  const hearAbort = useRef<AbortController | null>(null);
  const speakingRef = useRef(false);
  const sendingRef = useRef(false);
  const voiceIdRef = useRef(voiceId);
  const targetPlaylistRef = useRef(targetPlaylist);
  const playbackRef = useRef(playback);
  voiceIdRef.current = voiceId;
  targetPlaylistRef.current = targetPlaylist;
  const nameClashRef = useRef(nameClash);
  nameClashRef.current = nameClash;
  playbackRef.current = playback;

  const cardId = kind === "meet" ? factsId : guessId;
  const playlistCard =
    isPlaylistMapKind(kind)
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
    isPlaylistMapKind(kind)
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
    const savedTab = readSessionTab();
    void ensureSession().then((next) => {
      if (cancelled) return;
      if (savedTab) restoreTab(savedTab);
      tabRestored.current = true;
      setSession(next);
      setReady(true);
      if (next) void loadLibrary();
      pickUpPendingSend(next);
    });
    return () => {
      cancelled = true;
      stopDemo();
      if (myoTimer.current) window.clearTimeout(myoTimer.current);
      if (lockBeat.current) window.clearInterval(lockBeat.current);
    };
  }, []);

  useEffect(() => {
    if (!sending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // The send stops with this page, so the next page load may pick it up straight away.
    const leave = () => releaseSendLock();
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", leave);
    };
  }, [sending]);

  useEffect(() => {
    if (!tabRestored.current) return;
    try {
      sessionStorage.setItem(SAVED_TAB_KEY, JSON.stringify({ view, kind } satisfies SavedTab));
    } catch {
      // Without sessionStorage a refresh opens Fact Cards, as before.
    }
  }, [view, kind]);

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
    if (next.kind === "meet") setFactsId(next.id);
    else if (next.kind === "guess") setGuessId(next.id);
    else if (isPlaylistMapKind(next.kind)) {
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
    if (isPlaylistMapKind(nextKind)) {
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


  function chooseSection(id: SectionId) {
    if (id === "ready") {
      // Back to the set that was open last.
      showKind(isReadyKind(kind) ? kind : "meet");
      return;
    }
    stopDemo();
    setView(viewForSection(id));
  }

  function restoreTab(saved: SavedTab) {
    if (saved.view === "cards") showKind(saved.kind);
    else if (saved.view === "setup") chooseHelp();
    else {
      // Keep the ready-made set, so Ready-made opens on it again.
      setKind(saved.kind);
      setView(saved.view);
    }
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

  // Random 100 and the random Who's That card first render from a fixed seed, so the server page
  // and the browser agree. Straight after they appear they are shuffled once more, so every visit
  // gets its own.
  const reshuffleOnArrival = useEffectEvent(() => {
    const nextFacts = randomPokedexCard(factPool);
    const nextGuess = randomGuessCard(guessPool, Math.random, favourites);
    const firstFacts = randomCard.chapters[0]?.key;
    const firstGuess = guessCard.chapters[0]?.key;
    setRandomCard(nextFacts);
    setGuessCard(nextGuess);
    setChapterKey((key) => {
      if (key === firstFacts) return nextFacts.chapters[0]?.key ?? "start";
      if (key === firstGuess) return nextGuess.chapters[0]?.key ?? "start";
      return key;
    });
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => reshuffleOnArrival());
    return () => cancelAnimationFrame(frame);
  }, []);

  // New favourites join the random Who's That card straight away.
  const favouritesKey = favourites.join(",");
  const keepFavouritesInGuess = useEffectEvent(() => {
    if (favourites.every((id) => guessCard.chapters.some((chapter) => chapter.dexId === id))) return;
    const next = randomGuessCard(guessPool, Math.random, favourites);
    const shown = guessCard.chapters.some((chapter) => chapter.key === chapterKey);
    setGuessCard(next);
    if (shown) setChapterKey(next.chapters[0]?.key ?? "start");
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => keepFavouritesInGuess());
    return () => cancelAnimationFrame(frame);
  }, [favouritesKey]);

  // Ask once, a moment after the first visit, who the child's favourite Pokémon is.
  const askFavouritesOnce = useEffectEvent(() => {
    try {
      if (favourites.length > 0 || localStorage.getItem(FAVOURITES_ASKED_KEY)) return;
      localStorage.setItem(FAVOURITES_ASKED_KEY, "1");
    } catch {
      return;
    }
    setFavouritesOpen(true);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => askFavouritesOnce(), 2500);
    return () => window.clearTimeout(timer);
  }, []);

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
    const next = randomGuessCard(guessPool, Math.random, favourites);
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
      const piper = isPiperVoice(voiceIdRef.current);
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
        body: JSON.stringify(
          demoHearBody({ text: script, voiceId: voiceIdRef.current, dexId, title, mix: playbackRef.current }),
        ),
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
      text: trackSpeech(answer, chapter),
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

  function showMyoCard(next: MyoCardView, afterDialog = false) {
    if (myoTimer.current) window.clearTimeout(myoTimer.current);
    const open = () => setMyoCard(next);
    if (afterDialog) {
      myoTimer.current = openAfterDialog(open);
      return;
    }
    open();
  }

  function noteSendStarted(title: string) {
    toastSendStarted(title);
    showMyoCard(
      {
        title,
        cardId: validYotoCardId(targetPlaylistRef.current),
        sending: true,
      },
      true,
    );
  }

  function finishMyoCard(cardId?: string) {
    setMyoCard((current) =>
      current ? { ...current, cardId: cardId ?? current.cardId, sending: false } : current,
    );
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

  function savePending(next: PendingSend | null) {
    pendingRef.current = next;
    setPendingSend(next);
    try {
      if (next) localStorage.setItem(PENDING_SEND_KEY, serializePendingSend(next));
      else localStorage.removeItem(PENDING_SEND_KEY);
    } catch {
      // Without room to save, the send still runs. It just cannot pick up after a refresh.
    }
  }

  function changePending(change: (send: PendingSend) => PendingSend) {
    if (pendingRef.current) savePending(change(pendingRef.current));
  }

  function throwIfCancelled() {
    if (cancelRef.current) throw new SendCancelled();
  }

  function holdSendLock(): boolean {
    if (!lockOwner.current) lockOwner.current = Math.random().toString(36).slice(2);
    const owner = lockOwner.current;
    try {
      if (!sendLockFree(localStorage.getItem(SEND_LOCK_KEY), owner, Date.now())) return false;
      const beat = () => localStorage.setItem(SEND_LOCK_KEY, sendLockValue(owner, Date.now()));
      beat();
      if (lockBeat.current) window.clearInterval(lockBeat.current);
      lockBeat.current = window.setInterval(() => {
        try {
          beat();
        } catch {
          // The lock only keeps a second tab from sending at the same time.
        }
      }, SEND_LOCK_BEAT_MS);
    } catch {
      // Without storage there is no second tab to share the send with.
    }
    return true;
  }

  function releaseSendLock() {
    if (lockBeat.current) window.clearInterval(lockBeat.current);
    lockBeat.current = null;
    try {
      if (sendLockFree(localStorage.getItem(SEND_LOCK_KEY), lockOwner.current, Date.now())) {
        localStorage.removeItem(SEND_LOCK_KEY);
      }
    } catch {
      // Nothing was stored.
    }
  }

  async function pollJob(id: string, headline?: string, mark?: { done: number; total: number }) {
    let gatewayMisses = 0;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await delay(attempt < 8 ? 400 : 1000);
      throwIfCancelled();
      let response: Response;
      let payload: unknown;
      try {
        response = await yotoFetch(`/api/yoto/job/${id}`);
        payload = await readBody(response);
      } catch (error) {
        // The site restarting or the network dropping: checking again is safe, so wait and ask again.
        const failure = asSendFailure(error, "Could not check the recording.");
        const wait = failure.gateway ? gatewayRetryDelay(gatewayMisses++) : null;
        if (wait === null) throw failure;
        await delay(wait);
        continue;
      }
      if (isRateLimited(response.status, payload)) {
        await delay(Math.min(8_000, 1_000 * (attempt + 1)));
        continue;
      }
      if (looksLikeGateway(response.status, payload)) {
        const wait = gatewayRetryDelay(gatewayMisses++);
        if (wait !== null) {
          await delay(wait);
          continue;
        }
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

  async function postPlaylist(playlistId: string, upload: PlaylistUpload, headline: string): Promise<string | undefined> {
    let attempt = upload;
    let retried = false;
    for (;;) {
      throwIfCancelled();
      const response = await yotoFetch("/api/yoto/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      });
      const payload = await readBody(response);
      if (!response.ok || looksLikeGateway(response.status, payload)) {
        logYotoReply("Yoto did not accept the playlist", response.status, payload);
        // Yoto lost recordings this playlist uses. sendPrepared uploads them again and posts once more.
        const lost = missingMediaError(response.status, payload);
        if (lost) throw lost;
        const gateway = looksLikeGateway(response.status, payload);
        // A rejected add or replace is reported, never quietly retried as a new playlist.
        if (!gateway && !attempt.append && !attempt.replace) {
          const decision = afterRejectedPlaylist({
            playlistId,
            upload: attempt,
            status: response.status,
            body: payload,
            store: savedCards(),
            retried,
          });
          localStorage.setItem(SAVED_CARDS, JSON.stringify(decision.store));
          if (decision.action === "retry-create" || decision.store[playlistId] === undefined) {
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
        rememberCard(playlistId, newId);
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
      rememberCard(playlistId, newId);
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
    job: RenderJob,
    voice: { voiceId: string; mix: MixSettings },
    scratch: Set<string>,
    mark: { done: number; total: number },
  ): Promise<FinishedAudio> {
    let speechJobId: string | undefined;
    let speechCardId: string | undefined;
    // On an adventure track, the line the current speech job is recording.
    let speechPart: string | undefined;
    let uploadId: string | undefined;
    let last = new SendFailure("This track did not finish.", false);
    let gatewayMisses = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // An adventure track records each of its lines in turn, two steps each, so it may need more steps.
        const steps = 40 + 3 * (job.parts?.length ?? 0);
        for (let step = 0; step < steps; step += 1) {
          throwIfCancelled();
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
                voiceId: voice.voiceId,
                speechJobId,
                speechCardId,
                speechPart,
                parts: job.parts,
                bed: job.bed,
                fallbackOnly: Boolean(pendingRef.current?.voiceFallback),
                sendId: pendingRef.current ? adventureSendId(pendingRef.current.startedAt) : undefined,
                uploadId,
                mix: voice.mix,
              }),
            ),
          });
          const body = await readBody(response);
          if (isRateLimited(response.status, body)) {
            await delay(Math.min(8_000, 700 * (step + 1)));
            continue;
          }
          if (!response.ok || looksLikeGateway(response.status, body)) {
            logYotoReply("A track did not record", response.status, body);
            throw new SendFailure(
              statusErrorText(response.status, body, "This track did not record."),
              looksLikeGateway(response.status, body),
            );
          }
          const payload = body as {
            phase?: string;
            speechJobId?: string;
            speechPart?: string;
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
          if (payload.phase === "voice-fallback") {
            // Yoto's voices turned a line away: this track and the rest of the send are read by Piper.
            switchToPiper();
            speechJobId = undefined;
            speechCardId = undefined;
            speechPart = undefined;
            continue;
          }
          if (payload.phase === "speech" && payload.speechJobId) {
            speechJobId = payload.speechJobId;
            speechPart = payload.speechPart;
            let finished: Awaited<ReturnType<typeof pollJob>>;
            try {
              finished = await pollJob(payload.speechJobId, job.progress, mark);
            } catch (error) {
              if (!job.parts || error instanceof SendCancelled) throw error;
              const failure = asSendFailure(error, "Yoto could not finish the recording.");
              if (!pollFailureFallsBack(failure)) throw failure;
              switchToPiper();
              speechJobId = undefined;
              speechCardId = undefined;
              speechPart = undefined;
              continue;
            }
            const cardId = scratchCardId(finished);
            if (!cardId) throw new SendFailure("The voice did not return a recording.", false);
            speechCardId = cardId;
            scratch.add(cardId);
            changePending((send) => withScratch(send, cardId));
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
        if (error instanceof SendCancelled) throw error;
        last = asSendFailure(error, "This track did not finish.");
        // The site restarting or a Yoto gateway blip: wait it out (about a minute) without using up a try.
        // Each step picks up where the track got to, so asking again is safe.
        const gatewayWait = last.gateway ? gatewayRetryDelay(gatewayMisses++) : null;
        if (gatewayWait !== null) {
          setJob({ status: "sending", detail: "Pokefacts is busy for a moment. Trying again…", done: mark.done, total: mark.total });
          await delay(gatewayWait);
          attempt -= 1;
          continue;
        }
        if (!isRateLimited(0, last.message) && /could not record|did not start|does not look right/i.test(last.message)) {
          speechJobId = undefined;
          speechPart = undefined;
          uploadId = undefined;
        }
        await delay(isRateLimited(0, last.message) ? Math.min(8_000, 1_000 * (attempt + 1)) : 600);
      }
    }
    throw last;
  }

  /**
   * Record the tracks still missing. Each finished track is saved, so a resumed send skips it.
   * `label` replaces each track's progress line, as when tracks Yoto lost are uploaded again.
   */
  async function renderPlaylist(current: PendingPlaylist, send: PendingSend, label?: string) {
    const audio = { ...send.audio };
    const scratch = new Set(send.scratch);
    const mark = { done: finishedTrackCount(send), total: current.jobs.length };
    const jobs = unfinishedJobs(send).map((job) => (label ? { ...job, progress: label } : job));
    try {
      await mapPool(jobs, async (job) => {
        const finished = await renderOneTrack(job, send, scratch, mark);
        audio[job.key] = finished;
        changePending((next) => withTrackDone(next, job.key, finished));
        mark.done += 1;
        setJob({
          status: "sending",
          detail: `${current.libraryTitle}, ${mark.done} of ${mark.total}`,
          done: mark.done,
          total: mark.total,
        });
      });
      return audio;
    } finally {
      const swept = [...scratch];
      await discardScratch(swept);
      changePending((next) => withoutScratch(next, swept));
    }
  }

  async function sendPrepared(current: PendingPlaylist, send: PendingSend) {
    const coverReady =
      send.cover !== undefined
        ? Promise.resolve(send.cover ?? undefined)
        : uploadCover(current).then((cover) => {
            changePending((next) => withCover(next, cover));
            return cover;
          });
    const [audio, cover] = await Promise.all([renderPlaylist(current, send), coverReady]);
    // A cached recording Yoto no longer has is forgotten, uploaded again and the playlist posted again.
    return postWithMediaHeal({
      audio,
      post: (ready) => {
        const prepared = applyPlaylistCover(applyFinishedAudio(current.upload, ready), cover);
        if (prepared.create) delete prepared.content.cardId;
        return postPlaylist(current.playlistId, prepared, current.headline);
      },
      forget: (hashes) => forgetMissingMedia(hashes, yotoFetch),
      onHeal: (keys) => {
        throwIfCancelled();
        changePending((next) => withoutTracks(next, keys));
        setJob({ status: "sending", detail: healingText(keys.length) });
      },
      redo: (keys, kept) =>
        renderPlaylist(current, { ...(pendingRef.current ?? send), audio: kept }, healingText(keys.length)),
    });
  }

  function pendingPlaylist(playlist: KidCard, upload: PlaylistUpload, headline?: string): PendingPlaylist {
    const libraryTitle = upload.content.title || playlist.libraryTitle;
    return {
      playlistId: playlist.id,
      libraryTitle,
      headline: headline ?? libraryTitle,
      rangeLabel: playlist.rangeLabel,
      coverId: coverArtworkId(playlist),
      coverHidden: playlist.kind === "guess" || undefined,
      coverCard: stickerCard(playlist),
      upload,
      jobs: renderJobs(libraryTitle, playlist, upload),
    };
  }

  async function assertRoom(cardId: string, chapters: KidCard["chapters"]) {
    const response = await yotoFetch(`/api/yoto/card?id=${encodeURIComponent(cardId)}`);
    const summary = (await readApi(response, "Could not read that playlist.")) as { tracks?: number };
    const adding = countSpokenTracks(chapters);
    const free = YOTO_TRACK_LIMIT - (summary.tracks ?? 0);
    if (adding > free) throw new SendFailure(freeSlotMessage(free, adding), false);
  }

  /** "Send all" reads and pictures each numbered playlist only when it is next. */
  async function prepareBulkPlaylist(id: string, bulk: PendingBulk, voiceId: string): Promise<PendingPlaylist> {
    const playlist = factsPlaylists.find((item) => item.id === id);
    if (!playlist) throw new SendFailure("That Pokefacts playlist is not on this page any more.", false);
    const index = bulk.total - bulk.remaining.length + 1;
    const headline = bulkProgressLabel(index, bulk.total);
    setJob({ status: "sending", detail: headline, done: index - 1, total: bulk.total });
    let dexNote = "";
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
    changePending((send) => withDexNote(send, dexNote));
    const spoken = applySpeciesSpeech(playlist, readings.speech);
    const pixels = await uploadPixels(spoken, (done, total) => {
      setJob({
        status: "sending",
        detail: `${playlist.libraryTitle}, picture ${done} of ${total}`,
        done,
        total,
      });
    });
    return pendingPlaylist(playlist, factsBulkUpload(spoken, pixels, voiceId), headline);
  }

  /** Work through the saved send until every playlist in it is in the Yoto library. */
  async function runPendingSend(): Promise<string | undefined> {
    let cardId: string | undefined;
    for (let send = pendingRef.current; send && !isSendDone(send); send = pendingRef.current) {
      const { bulk, current } = send;
      const nextId = bulk?.remaining[0];
      try {
        if (current) {
          cardId = await sendPrepared(current, send);
          changePending(withPlaylistSent);
        } else if (bulk && nextId) {
          const prepared = await prepareBulkPlaylist(nextId, bulk, send.voiceId);
          changePending((next) => withCurrent(next, prepared));
        }
      } catch (error) {
        if (!bulk || error instanceof SendCancelled) throw error;
        const failure = asSendFailure(error, "The recording stopped.");
        const index = bulk.total - bulk.remaining.length + (current ? 0 : 1);
        throw new SendFailure(
          bulkFailureText({
            headline: bulkProgressLabel(index, bulk.total),
            rangeLabel: current?.rangeLabel ?? factsPlaylists.find((item) => item.id === nextId)?.rangeLabel ?? "",
            reason: failure.message,
            createdTitles: bulk.created,
            playlistIndex: index,
            gateway: failure.gateway,
          }),
          failure.gateway,
        );
      }
    }
    return cardId;
  }

  /** From now on this send's adventure lines are read by Piper; the parent hears why at the end. */
  function switchToPiper() {
    if (pendingRef.current?.voiceFallback) return;
    changePending((send) => ({ ...send, voiceFallback: true }));
    toast("Yoto's voices are busy, so the rest of this adventure is being read by Piper.");
  }

  function finishSend(send: PendingSend, cardId: string | undefined) {
    if (send.bulk) {
      const { total, dexNote } = send.bulk;
      setJob({
        status: "completed",
        detail: statusWithDexNote(`All ${total} Pokefacts playlists are in your Yoto library.`, dexNote),
        done: total,
        total,
      });
      toastSendAllReady(total);
      finishMyoCard();
      return;
    }
    const finish = send.finish;
    const done = finish?.detail ?? `${send.title} is in your Yoto library.`;
    setJob({
      status: "completed",
      detail: send.voiceFallback ? `${done} ${VOICE_FALLBACK_NOTE}` : done,
      done: finish?.tracks,
      total: finish?.tracks,
      cardId,
    });
    toastSendReady(finish?.toastTitle ?? send.title, finish?.updated ?? false);
    finishMyoCard(cardId);
    void loadLibrary();
  }

  /**
   * Prepare a send, save it, and record it. A failure is reported on the bar and rethrown.
   * The saved send survives a refresh or a closed tab and picks up on the next visit.
   */
  async function driveSend(title: string, bulk: boolean, prepare: () => Promise<PendingSend>): Promise<void> {
    if (!holdSendLock()) {
      const message = "Another Pokefacts tab is sending to Yoto. Let it finish first.";
      toast(message);
      throw new SendFailure(message, false);
    }
    markSending(true);
    setBulkActive(bulk);
    cancelRef.current = false;
    noteSendStarted(title);
    try {
      savePending(await prepare());
      const cardId = await runPendingSend();
      const finished = pendingRef.current;
      savePending(null);
      if (finished) finishSend(finished, cardId);
    } catch (error) {
      if (error instanceof SendCancelled) {
        savePending(null);
        setJob(null);
        setMyoCard(null);
        toast("Sending stopped.");
        return;
      }
      const failure = asSendFailure(error, "The recording stopped.");
      changePending((send) => withFailure(send, failure.message));
      reportFailure(failure.message);
      throw failure;
    } finally {
      markSending(false);
      setBulkActive(false);
      releaseSendLock();
    }
  }

  /** A send saved by an earlier visit: carry on, or wait for Retry when it had failed. */
  function pickUpPendingSend(live: YotoSession | null) {
    const saved = readStoredPendingSend();
    // Another open tab may be recording it right now.
    if (!saved || !sendLockFree(localStorage.getItem(SEND_LOCK_KEY), lockOwner.current, Date.now())) return;
    savePending(saved);
    if (saved.failed) {
      setJob({ status: "failed", detail: saved.failed });
      return;
    }
    if (!live) {
      setConnectOpen(true);
      toast(`Connect Yoto to finish sending ${saved.title}.`);
      return;
    }
    resumeSend(saved);
  }

  function resumeSend(send: PendingSend) {
    const done = finishedTrackCount(send);
    const total = send.current?.jobs.length;
    void driveSend(send.title, Boolean(send.bulk), async () => {
      setJob({
        status: "sending",
        detail:
          done > 0
            ? `Picking up where it stopped. ${done} of ${total} tracks were already saved.`
            : `Picking up ${send.title} where it stopped.`,
        done,
        total,
      });
      return withoutFailure(send);
    }).catch(() => {
      // The bar already shows what went wrong.
    });
  }

  async function retrySend() {
    const send = pendingRef.current;
    if (!send || sendingRef.current) return;
    if (!(await connectedSession())) return;
    resumeSend(send);
  }

  function cancelSend() {
    cancelRef.current = true;
    setJob((current) => (current ? { ...current, detail: "Stopping after this step…" } : current));
  }

  function dismissJob() {
    setJob(null);
    if (!sendingRef.current) savePending(null);
  }

  function askCardOptions(confirmLabel: string, newTitle: string, run: () => void | Promise<void>) {
    if (sendingRef.current) return;
    setMyoCard(null);
    pendingCardAction.current = run;
    setNameClash("number");
    setCardPrompt({ confirmLabel, newTitle });
  }

  /**
   * Where a send goes: onto the playlist picked in the dialog, or a new one. A new one whose name is
   * already in the library gets the next number, or replaces the old one's tracks if the parent chose that.
   */
  function plannedTarget(title: string): { cardId?: string; mode: "append" | "replace"; title: string } {
    const chosenId = validYotoCardId(targetPlaylistRef.current);
    if (chosenId) return { cardId: chosenId, mode: "append", title };
    const clash = playlistNamed(library, title);
    if (!clash) return { mode: "append", title };
    if (nameClashRef.current === "replace") return { cardId: clash.cardId, mode: "replace", title: clash.title };
    return { mode: "append", title: nextFreeTitle(title, library.map((item) => item.title)) };
  }

  /** What the bar and the toast say once a send is in the library. */
  function finishCopy(target: ReturnType<typeof plannedTarget>, newLine: string) {
    if (target.mode === "replace") return { line: `${target.title} now has the new tracks.`, toast: target.title, updated: true };
    if (target.cardId) {
      const title = library.find((item) => item.cardId === target.cardId)?.title ?? "The playlist";
      return { line: `${title} was updated.`, toast: title, updated: true };
    }
    return { line: newLine, toast: target.title, updated: false };
  }

  function confirmCardOptions() {
    if (!session) {
      setConnectOpen(true);
      return;
    }
    const clash =
      cardPrompt && !validYotoCardId(targetPlaylistRef.current) ? playlistNamed(library, cardPrompt.newTitle) : undefined;
    if (
      clash &&
      nameClashRef.current === "replace" &&
      !window.confirm(
        `Replace everything on "${clash.title}" with these tracks? The old tracks are removed. A card linked to it keeps working and plays the new ones.`,
      )
    ) {
      return;
    }
    const run = pendingCardAction.current;
    pendingCardAction.current = null;
    setCardPrompt(null);
    if (run) void run();
  }

  function newSend(input: Omit<Parameters<typeof startPendingSend>[0], "now" | "voiceId" | "mix">): PendingSend {
    return startPendingSend({ ...input, now: Date.now(), voiceId: voiceIdRef.current, mix: playbackRef.current });
  }

  async function sendSelection(playlist: KidCard): Promise<void> {
    if (sendingRef.current) {
      throw new Error("Another playlist is still recording in the background.");
    }
    if (!(await connectedSession())) {
      throw new Error("Connect Yoto before building a playlist.");
    }
    await driveSend(playlist.libraryTitle, false, async () => {
      const dexNote = playlistDexNote(playlist);
      setJob({
        status: "sending",
        detail: statusWithDexNote(`Sending ${playlist.libraryTitle} to Yoto…`, dexNote),
      });
      const target = plannedTarget(playlist.libraryTitle);
      if (target.cardId && target.mode === "append") await assertRoom(target.cardId, playlist.chapters);
      const icons = playlist.kind === "guess" ? await uploadGuessIcons(playlist) : null;
      const pixels = icons ? icons.real : await uploadPixels(playlist);
      const prepared = selectionUpload(playlist, pixels, {
        title: target.title,
        shadowById: icons?.shadow,
        voiceId: voiceIdRef.current,
      });
      const upload = uploadForPlaylist(prepared, target.cardId, target.mode);
      const done = finishCopy(target, `${target.title} is in your Yoto library.`);
      return newSend({
        title: target.title,
        current: pendingPlaylist(playlist, upload, target.title),
        finish: {
          detail: statusWithDexNote(done.line, dexNote),
          toastTitle: done.toast,
          updated: done.updated,
          tracks: countSpokenTracks(playlist.chapters),
        },
      });
    });
  }

  async function send() {
    if (!card || sendingRef.current) return;
    if (!(await connectedSession())) return;
    try {
      await driveSend(card.libraryTitle, false, async () => {
        setJob({ status: "sending", detail: `Sending ${card.rangeLabel} to Yoto…` });
        const target = plannedTarget(card.libraryTitle);
        if (target.cardId && target.mode === "append") await assertRoom(target.cardId, card.chapters);
        const formKind = isFormPlaylistKind(card.kind);
        let dexNote = "";
        let spokenCard = card;
        // Facts and species cards read Bulbapedia's description; the Joke Book reads its jokes.
        if (!formKind && card.kind !== "guess" && card.kind !== "joke") {
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
        let base: PlaylistUpload;
        if (randomGuess) {
          const icons = await uploadGuessIcons(card);
          base = guessUpload(card, icons.real, icons.shadow, undefined, voiceIdRef.current);
        } else if (formKind) {
          base = formPlaylistUpload(readyForm, await uploadPixels(readyForm), undefined, voiceIdRef.current);
        } else if (randomFacts) {
          base = pokedexUpload(spokenCard, await uploadPixels(spokenCard), undefined, voiceIdRef.current);
        } else {
          base = factsPlaylistUpload(spokenCard, await uploadPixels(spokenCard), undefined, voiceIdRef.current);
        }
        const named = target.title === card.libraryTitle ? base : retitledUpload(base, target.title);
        const upload = uploadForPlaylist({ ...named, voiceId: voiceIdRef.current }, target.cardId, target.mode);
        const done = finishCopy(
          target,
          target.title === card.libraryTitle ? `${card.rangeLabel} is in your Yoto library.` : `${target.title} is in your Yoto library.`,
        );
        return newSend({
          title: target.title,
          current: pendingPlaylist(card, upload, target.title),
          finish: {
            detail: statusWithDexNote(done.line, dexNote),
            toastTitle: done.toast,
            updated: done.updated,
            tracks: countSpokenTracks(card.chapters),
          },
        });
      });
    } catch {
      // The bar already shows what went wrong.
    }
  }

  /** An adventure card: its pictures, then the interactive playlist. Always a new playlist, never added to one. */
  async function sendAdventure(sent: StoryGraph) {
    if (sendingRef.current) return;
    if (!(await connectedSession())) return;
    // Each send is a new adventure, so a second Safari Zone in the library becomes "Safari Zone 2".
    const story = { ...sent, title: nextFreeTitle(sent.title, library.map((item) => item.title)) };
    try {
      await driveSend(story.title, false, async () => {
        setJob({ status: "sending", detail: `Sending ${story.title} to Yoto…` });
        const pixels = storyPixels(story);
        const pictures = [
          ...pixels.real.map((id) => ({ id, shadow: false })),
          ...pixels.shadow.map((id) => ({ id, shadow: true })),
        ];
        const realById: Record<number, string> = {};
        const shadowById: Record<number, string> = {};
        const namedById: Record<string, string> = {};
        // The Poké Ball shown on catch tracks.
        for (const name of pixels.named) namedById[name] = await uploadNamedIcon(name);
        let finished = 0;
        await mapPool(pictures, async ({ id, shadow }) => {
          (shadow ? shadowById : realById)[id] = await uploadIcon(id, shadow);
          finished += 1;
          setJob({
            status: "sending",
            detail: `${story.title}, picture ${finished} of ${pictures.length}`,
            done: finished,
            total: pictures.length,
          });
        });
        const built = storyCard(story, { voiceId: voiceIdRef.current, realById, shadowById, namedById });
        return newSend({
          title: story.title,
          // The cover shows the adventure's place and the child's partner. Its other Pokémon may be secrets.
          current: {
            ...pendingPlaylist(built.card, built.upload, story.title),
            coverId: undefined,
            coverHidden: undefined,
            coverCard: adventureCoverCard(story, favourites[0]),
          },
          finish: {
            detail: `${story.title} is in your Yoto library.`,
            toastTitle: story.title,
            updated: false,
            tracks: storyTrackCount(story),
          },
        });
      });
    } catch {
      // The bar already shows what went wrong.
    }
  }

  async function sendAllFacts() {
    if (sendingRef.current) return;
    if (!(await connectedSession())) return;
    try {
      await driveSend("Pokefacts 1", true, async () => {
        for (const playlist of factsPlaylists) forgetCard(playlist.id);
        return newSend({
          title: "Pokefacts 1",
          bulk: {
            remaining: factsPlaylists.map((playlist) => playlist.id),
            created: [],
            total: factsPlaylists.length,
            dexNote: "",
          },
        });
      });
    } catch {
      // The bar already shows what went wrong.
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
      ? artworkSrc(chapter.dexId)
      : chapter?.sprite;
  const yotoIcon = chapter
    ? yotoPixelSrc({
        formId: chapter.formId,
        dexId: chapter.dexId,
        shadow: guessing && !revealed,
      })
    : undefined;

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
  const playlistHref = job?.status === "completed" ? yotoPlaylistUrl(job.cardId) : undefined;
  const shelfPictures = shelfPicturesFor(playlists);
  const playable = card ? playableChapters(card) : [];
  const place = chapter ? playable.findIndex((item) => item.key === chapter.key) : -1;
  const before = place > 0 ? playable[place - 1] : undefined;
  const after = place >= 0 ? playable[place + 1] : undefined;
  const chapterLabel = (item: { title: string; overlay: string; dexId?: number }) =>
    guessing ? `Riddle ${chapterNumber(item)}` : item.title;

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
        section={sectionFor(view)}
        kind={isReadyKind(kind) ? kind : "meet"}
        pictures={shelfPictures}
        onSection={chooseSection}
        onCategory={(nextKind) => {
          showKind(nextKind);
          // On Printables the shelf picks the set to print, and the page stays put.
          if (view === "printables") setView("printables");
        }}
      />

      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 pt-5 pb-6 sm:px-6">
        <div key={view === "cards" ? `${view}-${kind}` : view} className="pk-view">
        {view === "setup" ? (
          <SetupGuide onConnect={() => setConnectOpen(true)} onHome={goHome} />
        ) : view === "catalogue" ? (
            <Catalogue
            sending={sending}
            onSendSelection={sendSelection}
            onPrepareSend={(confirmLabel, newTitle, run) => askCardOptions(confirmLabel, newTitle, run)}
            onShowMyoCard={(title) =>
              showMyoCard({
                title,
                cardId: validYotoCardId(targetPlaylist) ?? job?.cardId,
                sending,
              })
            }
            onBuildStart={() => {
              if (!sendingRef.current) setJob(null);
            }}
            units={playback.units}
            job={job}
          />
        ) : view === "music" ? (
          <MusicPanel />
        ) : view === "printables" && card ? (
          <PrintablesPanel
            card={card}
            rangeCards={rangeCards}
            units={playback.units}
            onChooseCard={chooseCard}
            onStickers={() => setStickersOpen(true)}
            onOwnPick={() => {
              stopDemo();
              setView("catalogue");
            }}
          />
        ) : view === "adventures" ? (
          <AdventurePanel
            sending={sending}
            onSend={sendAdventure}
            voiceId={voiceId}
            connected={Boolean(session)}
            mix={playback}
          />
        ) : card && chapter ? (
          <div className="grid min-w-0 gap-5">
            <section className="pk-panel min-w-0" aria-labelledby="playlist-heading">
              <h2 id="playlist-heading" className="pk-section-title">
                {rangeCards.length > 1 ? "Pick a playlist" : "This playlist"}
              </h2>
              {rangeCards.length > 1 ? (
                <ul
                  className="pk-scroll mt-2 flex gap-2 overflow-x-auto pb-1"
                  aria-label={
                    guessing
                      ? "Who's That Pokémon Cards playlists"
                      : formMode || speciesSet
                        ? `${card.title} playlists`
                        : "Fact Cards playlists"
                  }
                >
                  {rangeCards.map((item) => (
                    <li key={item.id} className="shrink-0">
                      <button
                        type="button"
                        aria-current={item.id === card.id ? "true" : undefined}
                        onClick={() => chooseCard(item)}
                        className="pk-pill"
                      >
                        {item.rangeLabel}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-sm leading-6 text-muted-foreground">{thisPlaylist}</p>
                {randomFacts ? (
                  <Button type="button" variant="outline" className="h-11 px-4" onClick={shufflePokedex}>
                    Shuffle
                  </Button>
                ) : null}
                {randomGuess ? (
                  <Button type="button" variant="outline" className="h-11 px-4" onClick={shuffleGuess}>
                    Shuffle
                  </Button>
                ) : null}
              </div>
              {libraryNote ? (
                <p className="mt-3 text-sm leading-5 pk-danger" role="status">
                  {libraryNote}
                </p>
              ) : null}
              <div className="pk-actions mt-3">
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
                          : `Send ${card.rangeLabel} to Yoto`,
                      card.libraryTitle,
                      () => send(),
                    )
                  }
                >
                  {sending && !bulkActive ? "Recording in the background…" : "Create card"}
                </Button>
                <MyoCardButton
                  onClick={() =>
                    showMyoCard({
                      title: card.libraryTitle,
                      cardId: validYotoCardId(targetPlaylist) ?? job?.cardId,
                      sending,
                    })
                  }
                />
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setStickersOpen(true)}>
                  Stickers
                </Button>
                {kind === "meet" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-4"
                    disabled={sending || !ready}
                    onClick={() =>
                      askCardOptions(
                        `Send all ${factsPlaylists.length} playlists — ${factsPlaylists.length} blank cards`,
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
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Sends this whole list ({card.rangeLabel}), not only the Pokémon on screen. Paper stickers come after
                the playlist is in Yoto.
              </p>
              {playlistHref ? (
                <p className="mt-2 text-sm leading-6">
                  <a
                    className="font-bold text-poke-red underline decoration-2"
                    href={playlistHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open this playlist in the Yoto app
                  </a>
                </p>
              ) : null}
            </section>

            <div className="pk-browse">
              <div className="pk-browse-list grid min-w-0 content-start gap-2">
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
                  className="pk-scroll pk-choice-list hidden md:grid"
                >
                  {listed.length === 0 ? (
                    <p className="px-1 py-3 text-sm text-muted-foreground">Nothing matches that search.</p>
                  ) : null}
                  {listed.map((item) => {
                    const selected = item.key === chapter.key;
                    const thumb = !guessing ? yotoPixelSrc({ formId: item.formId, dexId: item.dexId }) : undefined;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => chooseChapter(item.key)}
                        aria-current={selected ? "true" : undefined}
                        className="pk-choice flex items-center gap-2.5 px-2.5 py-2 text-left text-sm"
                      >
                        {thumb ? (
                          <YotoScreen src={thumb} size="thumb" />
                        ) : !guessing && item.sprite ? (
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
                        <span className="min-w-0">{chapterLabel(item)}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <EntryCard
                swapKey={chapter.key}
                top={
                  playable.length > 1 ? (
                    <EntryPager
                      previous={before ? chapterLabel(before) : undefined}
                      next={after ? chapterLabel(after) : undefined}
                      position={`${place + 1} of ${playable.length}`}
                      onPrevious={() => before && chooseChapter(before.key)}
                      onNext={() => after && chooseChapter(after.key)}
                    />
                  ) : null
                }
                onSwipe={(step) => {
                  const to = step > 0 ? after : before;
                  if (to) chooseChapter(to.key);
                }}
                kicker={guessing ? (revealed ? "Answer" : "Clues") : `Number ${chapterNumber(chapter)}`}
                title={guessing && !revealed ? `Riddle ${chapter.overlay}` : chapter.title}
                picture={
                  portrait && mysteryId ? (
                    <div className="pk-silhouette pk-entry-art">
                      <MysterySilhouette src={portrait} fallback={artworkApi("species", mysteryId)} />
                    </div>
                  ) : portrait ? (
                    <img
                      src={portrait}
                      alt={chapter.title}
                      width={192}
                      height={192}
                      data-fallback={pictureFallback({
                        formId: chapter.formId,
                        dexId: chapter.dexId,
                        sprite: portrait,
                      })}
                      onError={hideBrokenPicture}
                      className="pk-entry-art pk-entry-photo"
                    />
                  ) : null
                }
                yotoSrc={yotoIcon}
              >
                <div key={chapter.key} className="pk-swap max-w-prose space-y-3 text-base leading-7">
                  {readsSpeciesBiology(kind) && chapter.dexId ? (
                    factReading ? (
                      <>
                        {factReading.notice ? (
                          <p className="text-sm text-muted-foreground" role="status">
                            {factReading.notice}
                          </p>
                        ) : null}
                        <p>{withoutVoiceTags(factReading.speech)}</p>
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
                          <p key={`${track.key}-${line}`} className="pk-measure px-4 py-3">
                            {line}
                          </p>
                        ) : (
                          <p key={`${track.key}-${line}`}>{line}</p>
                        ),
                      ),
                    )
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
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
                            text: trackSpeech(track, chapter),
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
                            line = fresh?.tracks[0] ? trackSpeech(fresh.tracks[0], fresh) : "";
                            dexId = fresh?.tracks[0]?.lead === "cry" ? fresh.dexId : undefined;
                          } else if (chapter.dexId && readsSpeciesBiology(kind)) {
                            const prefix = chapter.tracks[0]?.text.startsWith(POKEDEX_HOWTO) ? POKEDEX_HOWTO : "";
                            const shown =
                              factReading && !nameOnlySpeech(chapter.title, factReading.speech)
                                ? factReading.speech
                                : (await speciesSpeech(chapter.dexId, chapter.title)).speech;
                            const speech = shown || chapterDexText(chapter) || `${chapter.title}.`;
                            line = entrySpeech(`${prefix}${speech}`, chapter);
                            dexId = chapter.tracks.some((track) => track.lead === "cry") ? chapter.dexId : undefined;
                          } else {
                            line = chapter.tracks.map((track) => trackSpeech(track, chapter)).join(" ");
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
                {chapter.dexId ? (
                  <p className="pk-quiet mt-4 text-xs leading-5">
                    {guessing
                      ? "Hear plays the cry, then the words. The clue never says the name. The answer does. The Yoto card plays that same order."
                      : "Hear plays the cry, then the reading. The Yoto card plays that same order."}
                  </p>
                ) : null}
                {source && guessing ? <p className="pk-quiet mt-2 text-xs">Pokédex, {source}</p> : null}
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
              </EntryCard>
            </div>
          </div>
        ) : null}
        </div>
        {view !== "setup" && !cardPrompt ? <FavouritesBar ids={favourites} onEdit={() => setFavouritesOpen(true)} /> : null}
        {view !== "setup" && !cardPrompt ? <JokeBox /> : null}
        {view !== "setup" && !cardPrompt ? (
          <PlaybackPanel
            settings={playback}
            onChange={setPlayback}
            voiceId={voiceId}
            onVoiceId={(id) => setVoiceId(writeVoiceId(localStorage, id))}
          />
        ) : null}
      </main>

      <SupportBox />

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs leading-5 font-bold text-ink sm:px-6">
        Works with Yoto. An independent fan project, not made by or affiliated with Yoto, Nintendo, Game Freak, Creatures, or The Pokémon Company.
        Pokémon names and the Pokédex lines are from the games. The short notes are written for this app.{" "}
        <a className="underline decoration-poke-red decoration-2" href={DONATE_URL} target="_blank" rel="noreferrer">
          Buy me a coffee
        </a>
        {" · "}
        <button type="button" className="underline decoration-poke-red decoration-2" onClick={chooseHelp}>
          How to connect Yoto
        </button>
        {" · "}
        <a className="underline decoration-poke-red decoration-2" href="/help">
          Help page
        </a>
        {" · "}
        <a className="underline decoration-poke-red decoration-2" href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        .
      </footer>

      <CoffeeNudge />
      <SendBanner
        job={job}
        onDismiss={dismissJob}
        onCancel={sending ? cancelSend : undefined}
        onRetry={pendingSend?.failed && !sending ? () => void retrySend() : undefined}
        onPrintStickers={view === "cards" && card ? () => setStickersOpen(true) : undefined}
        onShowMyoCard={() =>
          showMyoCard({
            title: card?.libraryTitle ?? myoCard?.title ?? "this playlist",
            cardId: validYotoCardId(targetPlaylist) ?? job?.cardId ?? myoCard?.cardId,
            sending,
          })
        }
      />
      {stickersOpen && card ? (
        <StickerStudio
          key={card.id}
          card={card}
          cards={rangeCards}
          onClose={() => setStickersOpen(false)}
        />
      ) : null}
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <MyoCardDialog
        open={Boolean(myoCard)}
        onOpenChange={(open) => {
          if (!open) setMyoCard(null);
        }}
        title={myoCard?.title}
        cardId={myoCard?.cardId}
        sending={myoCard?.sending ?? sending}
      />
      <FavouritesDialog open={favouritesOpen} onOpenChange={setFavouritesOpen} ids={favourites} onIds={setFavourites} />
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
        connected={Boolean(session)}
        onConnect={() => {
          pendingCardAction.current = null;
          setCardPrompt(null);
          setConnectOpen(true);
        }}
        voiceId={voiceId}
        onVoiceId={(id) => setVoiceId(writeVoiceId(localStorage, id))}
        playback={playback}
        onPlayback={setPlayback}
        targetPlaylist={targetPlaylist}
        onTargetPlaylist={setTargetPlaylist}
        nameClash={nameClash}
        onNameClash={setNameClash}
        library={library}
        newTitle={cardPrompt?.newTitle ?? card?.libraryTitle ?? "Pokefacts"}
      />
    </div>
  );
}
