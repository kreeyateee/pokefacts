import { artworkSrc as formArtworkSrc } from "@/lib/artwork-path";
import { artworkSrc } from "@/lib/page-artwork";
import type { BiologyBlock } from "@/lib/catalogue-types";
import { dexBlurb, guessSpoken, pickDexEntry, type MonSheet } from "@/lib/dex-facts";
import { pronounce } from "@/lib/pronounce";
import { spokenWiki } from "@/lib/spoken-wiki";
import { chosenVoice, isPiperVoice } from "@/lib/piper-voice";
import type { StoryBed } from "@/lib/story/story-sound";
import type { TrackPart } from "@/lib/story/story-voices";
import { iconForType, YOTO_ICONS } from "@/lib/yoto-icons";

/** Lily, the British woman. Yoto Labs records her MP3 from the spoken script. */
export const LILY_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku";

/** The Pokedex playlist the parent sends: 100 tracks, no extra intro. */
const POKEDEX_PLAYLIST_SIZE = 100;

export const RANDOM_POKEDEX_ID = "meet-random";

/** One Guess Who playlist: 50 riddles, two tracks each, no separate intro. */
const GUESS_RIDDLE_COUNT = 50;

export const RANDOM_GUESS_ID = "guess-random";

export type KidTrack = {
  key: string;
  title: string;
  /** Official wording, shown on the page. */
  text: string;
  /** Same words with names respelled for the narrator. */
  spoken: string;
  /** Pixel shown on the player while this part plays. */
  icon: string;
  /** ElevenLabs voice Yoto uses when it records this track as an MP3. */
  voiceId?: string;
  overlay: string;
  /** Game the Pokédex line comes from, when this track is an entry. */
  source?: string;
  /** Play the Pokémon cry before this script. The how-to intro leaves this off. */
  lead?: "cry";
  /** An adventure track with characters or sounds: each line in its own voice, recorded as one track. */
  parts?: TrackPart[];
  /** Ambience and music under an adventure track. */
  bed?: StoryBed;
};

export type KidChapter = {
  key: string;
  title: string;
  /** Number or word in the corner of the picture. */
  overlay: string;
  /** What a child sees while choosing. */
  picture: string;
  /** Parent preview, not shown on the player. */
  mark: string;
  icon: string;
  /** National dex number, when this chapter is one Pokémon. The cry uses this id. */
  dexId?: number;
  /** PokéAPI form id. Form tracks use this picture, not the species icon. */
  formId?: number;
  /** Bulbapedia article for the on-page credit. Not spoken. */
  articleUrl?: string;
  /** Set once that form's article has been read. */
  articleStatus?: "ready" | "missing" | "unavailable";
  /** Shown when the Pokédex line replaced a Bulbapedia read that did not finish. Not spoken. */
  articleNotice?: string;
  /** Sprite shown on the page. */
  sprite?: string;
  /** Merged cry and reading, when that file has been recorded. */
  clip?: string;
  tracks: KidTrack[];
};

export type KidCardKind =
  | "meet"
  | "guess"
  | "mega"
  | "gmax"
  | "alola"
  | "hisui"
  | "legendary"
  | "mythical"
  | "starter"
  | "story";

export type FormPlaylistKind = "mega" | "gmax" | "alola" | "hisui";

type SpeciesPlaylistKind = "legendary" | "mythical" | "starter";

export function isFormPlaylistKind(kind: string): kind is FormPlaylistKind {
  return kind === "mega" || kind === "gmax" || kind === "alola" || kind === "hisui";
}

export function isSpeciesPlaylistKind(kind: string): kind is SpeciesPlaylistKind {
  return kind === "legendary" || kind === "mythical" || kind === "starter";
}

export type KidCard = {
  /** `meet-1` … `meet-11`, or `guess-1` … `guess-21`. */
  id: string;
  kind: KidCardKind;
  title: string;
  /** On-page label, such as "Pokefacts 1 (1-99)". The Yoto title is libraryTitle. */
  rangeLabel: string;
  libraryTitle: string;
  recommended?: boolean;
  blurb: string;
  childDoes: string;
  chapters: KidChapter[];
};

/** Yoto Make Your Own playlists hold 100 tracks on one card. */
export const YOTO_TRACK_LIMIT = 100;

/** One intro track plus one fact leaves room for 99 Pokémon. */
const FACTS_PER_CARD = YOTO_TRACK_LIMIT - 1;

/** One intro track plus two tracks per riddle leaves room for 49 riddles. */
const RIDDLES_PER_CARD = Math.floor((YOTO_TRACK_LIMIT - 1) / 2);

const I = YOTO_ICONS;

/** Browser Hear clips already recorded for the first nine. Yoto still speaks text. */
const CRY_CLIPS = new Set([1, 4, 7, 25, 39, 94, 133, 143, 321]);

function talk(
  key: string,
  title: string,
  text: string,
  icon: string,
  overlay: string,
  source?: string,
  lead?: "cry",
): KidTrack {
  const readable = text.replace(/[^\S\n]+/g, " ").replace(/ *\n+ */g, "\n").trim();
  return {
    key,
    title,
    text: readable,
    spoken: pronounce(readable),
    icon,
    overlay,
    source,
    lead,
  };
}

function picture(
  key: string,
  title: string,
  overlay: string,
  pictureLabel: string,
  mark: string,
  icon: string,
  tracks: KidTrack[],
  extras?: { sprite?: string; clip?: string; dexId?: number },
): KidChapter {
  return {
    key,
    title,
    overlay,
    picture: pictureLabel,
    mark,
    icon,
    tracks,
    sprite: extras?.sprite,
    clip: extras?.clip,
    dexId: extras?.dexId,
  };
}

export function trackSpeech(track: KidTrack): string {
  return track.spoken;
}

export function countSpokenTracks(chapters: Array<{ tracks?: unknown[] }>): number {
  return chapters.reduce((sum, chapter) => {
    const tracks = chapter.tracks;
    return sum + (Array.isArray(tracks) ? tracks.length : 0);
  }, 0);
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

/** Yoto playlist name. Plain ASCII, no en dash. */
export function pokefactsTitle(index: number): string {
  return `Pokefacts ${index}`;
}

/** Bulk-send status. Index is 1-based, so the first card is "Recording Pokefacts 1 of 11". */
export function bulkProgressLabel(index: number, total: number): string {
  return `Recording ${pokefactsTitle(index)} of ${total}`;
}

/** On-page label. ASCII parentheses; the Yoto title is `pokefactsTitle`. */
export function rangeLabel(kind: KidCardKind, first: number, last: number, index = 1): string {
  if (kind === "mega") return "Mega Evolutions";
  if (kind === "gmax") return "Gigantamax";
  if (kind === "alola") return "Alolan forms";
  if (kind === "hisui") return "Hisuian forms";
  if (kind === "legendary") return "Legendary Pokémon";
  if (kind === "mythical") return "Mythical Pokémon";
  if (kind === "starter") return "Starter Pokémon";
  const span = first === last ? String(first) : `${first}-${last}`;
  if (kind === "meet") return `${pokefactsTitle(index)} (${span})`;
  return `Who's That Pokémon ${span}`;
}

/** One cry-or-speech line while a playlist is recording. */
export function trackProgressLabel(libraryTitle: string, index: number, total: number): string {
  return `${libraryTitle}, track ${index} of ${total}`;
}

function typeIcon(types: string[]): string {
  const icon = iconForType(types[0]?.toLowerCase());
  return icon === I.detective ? I.star : icon;
}

function factChapter(sheet: MonSheet): KidChapter {
  const number = String(sheet.id);
  const entry = pickDexEntry(sheet.entries);
  const icon = typeIcon(sheet.types);
  return picture(
    sheet.slug,
    sheet.name,
    number,
    "this Pokémon",
    number,
    icon,
    [
      talk(
        "entry",
        sheet.name,
        dexBlurb(sheet, number),
        icon,
        number,
        entry.version || undefined,
        "cry",
      ),
    ],
    {
      sprite: artworkSrc(sheet.id),
      clip: CRY_CLIPS.has(sheet.id) ? `/facts/${sheet.id}.mp3` : undefined,
      dexId: sheet.id,
    },
  );
}

function riddleChapter(sheet: MonSheet): KidChapter {
  const number = String(sheet.id);
  const script = guessSpoken(sheet);
  const answerIcon = typeIcon(sheet.types);
  return picture(
    sheet.slug,
    sheet.name,
    number,
    "a detective",
    "?",
    I.detective,
    [
      talk("clues", "Clues", script.clue, I.detective, "?", undefined, "cry"),
      talk("answer", "The answer", script.answer, answerIcon, "Yes", undefined, "cry"),
    ],
    { sprite: `/sprites/${sheet.id}.png`, dexId: sheet.id },
  );
}

function intro(kind: KidCardKind, index: number, first: number, last: number, firstName: string): KidChapter {
  const span = first === last ? String(first) : `${first}-${last}`;
  const text =
    kind === "meet"
      ? `Pokefacts ${index}. Turn the wheel until you see a picture, then press play. You hear the cry, then the name. Number ${first} is ${firstName}.`
      : `Who's That Pokémon, numbers ${span}. Turn the wheel until you see a dark picture, then press play. You hear the colour and the type, two Pokédex lines, and how big it is. Say the name before the count ends. The next track says the answer.`;
  return picture("start", "Start here", "Go", "a star", "★", I.star, [
    talk("how", kind === "meet" ? "How to play" : "How to play Who's That Pokémon", text, I.star, "Go"),
  ]);
}

function buildGroup(sheets: MonSheet[], kind: KidCardKind, size: number): KidCard[] {
  return chunk(sheets, size).map((group, index) => {
    const firstSheet = group[0];
    const lastSheet = group[group.length - 1];
    const first = firstSheet?.id ?? 0;
    const last = lastSheet?.id ?? first;
    const playlistIndex = index + 1;
    const label = rangeLabel(kind, first, last, playlistIndex);
    const chapters = [
      intro(kind, playlistIndex, first, last, firstSheet?.name ?? "this Pokémon"),
      ...group.map((sheet) => (kind === "meet" ? factChapter(sheet) : riddleChapter(sheet))),
    ];
    return {
      id: `${kind}-${playlistIndex}`,
      kind,
      title: kind === "meet" ? "Pokefacts" : "Who's That Pokémon",
      rangeLabel: label,
      libraryTitle: kind === "meet" ? pokefactsTitle(playlistIndex) : "Who's That Pokémon",
      recommended: kind === "meet" && index === 0,
      blurb:
        kind === "meet"
          ? "The cry, then the name, then a short description."
          : "Three short clues. Call the name before the count ends.",
      childDoes:
        kind === "meet"
          ? "Turn the wheel until you see a picture, then press play. You hear the cry, then the name."
          : "Turn the wheel until you see a dark picture, then press play. Three short clues. The next track says the name.",
      chapters,
    };
  });
}

export function kidCardsFromDex(sheets: MonSheet[]): KidCard[] {
  const ordered = [...sheets].sort((a, b) => a.id - b.id);
  return [
    ...buildGroup(ordered, "meet", FACTS_PER_CARD),
    ...buildGroup(ordered, "guess", RIDDLES_PER_CARD),
  ];
}

/** What a button press or the end of a track does on an interactive card. */
export type YotoTrackEvent =
  | { cmd: "goto"; params: { chapterKey: string; trackKey: string } }
  | { cmd: "stop" }
  | { cmd: "repeat" };

/** Lhb and Rhb are the left-hand and right-hand buttons on the player. */
export type YotoTrackEvents = {
  onLhb?: YotoTrackEvent;
  onRhb?: YotoTrackEvent;
  onEnd?: YotoTrackEvent;
};

export const YOTO_EVENT_NAMES = ["onLhb", "onRhb", "onEnd"] as const;

/** Playback settings Yoto's own story converter uses, so the buttons pick a path. */
export type YotoInteractiveConfig = {
  autoadvance: "none";
  disableTrackNav: boolean;
  disableChapterNav: boolean;
  /** Seconds before a card starts again from the beginning instead of resuming. */
  resumeTimeout: number;
};

export type YotoEditSettings = {
  autoOverlayLabels: "chapters";
  editKeys: boolean;
  interactiveContent: boolean;
};

/** The playlist body Yoto takes for a spoken Make Your Own card. */
export type YotoContent = {
  title: string;
  cardId?: string;
  content: {
    /** Set on a choose-your-own-adventure card. Tracks then carry button events. */
    playbackType?: "interactive";
    config?: YotoInteractiveConfig;
    editSettings?: YotoEditSettings;
    chapters: Array<{
      key: string;
      title: string;
      overlayLabel: string;
      display: { icon16x16: string };
      tracks: Array<{
        key: string;
        title: string;
        trackUrl: string;
        /** Spoken script, or a finished `yoto:#` recording. */
        type: "elevenlabs" | "audio";
        /** ElevenLabs voice. Lily is pFZP5JQG7iQjIQuC4Bku. Omitted once the track is audio. */
        voiceId?: string;
        overlayLabel: string;
        display: { icon16x16: string };
        duration?: number;
        fileSize?: number;
        format?: string;
        channels?: string | number;
        events?: YotoTrackEvents;
      }>;
    }>;
  };
  metadata: {
    title: string;
    description: string;
  };
};

export function buildKidCard(card: KidCard, cardId?: string): YotoContent {
  const content: YotoContent = {
    title: card.libraryTitle,
    content: {
      chapters: card.chapters.map((chapter) => ({
        key: chapter.key,
        title:
          card.kind === "guess" && chapter.key !== "start"
            ? `Riddle ${chapter.overlay}`
            : chapter.title,
        overlayLabel: chapter.overlay,
        display: { icon16x16: chapter.icon },
        tracks: chapter.tracks.map((track) => ({
          key: `${chapter.key}-${track.key}`,
          title: track.title,
          trackUrl: trackSpeech(track),
          type: "elevenlabs" as const,
          ...(track.voiceId ? { voiceId: track.voiceId } : {}),
          overlayLabel: track.overlay,
          display: { icon16x16: track.icon },
        })),
      })),
    },
    metadata: {
      title: card.libraryTitle,
      description: `${card.libraryTitle}. ${card.blurb} Written for ages 8 to 12. Link this playlist to its own Make Your Own card. One card holds ${YOTO_TRACK_LIMIT} tracks.`,
    },
  };
  if (cardId) content.cardId = cardId;
  return content;
}

/** Deterministic draw so the server render and the browser agree. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawSample<T>(items: readonly T[], size: number, random: () => number = Math.random): T[] {
  const copy = items.slice();
  const count = Math.min(size, copy.length);
  for (let index = 0; index < count; index += 1) {
    const swap = index + Math.floor(random() * (copy.length - index));
    const current = copy[index];
    copy[index] = copy[swap] as T;
    copy[swap] = current as T;
  }
  return copy.slice(0, count);
}

export function factPoolFromCards(cards: KidCard[]): KidChapter[] {
  return cards
    .filter((card) => card.kind === "meet")
    .flatMap((card) => card.chapters.filter((chapter) => chapter.dexId));
}

export const POKEDEX_HOWTO =
  "One hundred Pokémon, drawn at random. Turn the wheel until you see a picture, then press play. ";

/**
 * One playlist of 100 Pokémon. The how-to sits on the first track so the
 * card stays at 100 tracks. Pass the same chapters back to send them.
 */
export function randomPokedexCard(
  pool: KidChapter[],
  random: () => number = Math.random,
): KidCard {
  const drawn = drawSample(
    pool.filter((chapter) => chapter.dexId),
    POKEDEX_PLAYLIST_SIZE,
    random,
  );
  const chapters = drawn.map((chapter, index) => {
    const tracks = chapter.tracks.map((track, trackIndex) => {
      const text = index === 0 && trackIndex === 0 ? `${POKEDEX_HOWTO}${track.text}` : track.text;
      return {
        ...track,
        text,
        spoken: pronounce(text),
        voiceId: LILY_VOICE_ID,
      };
    });
    return {
      ...chapter,
      sprite: chapter.dexId ? artworkSrc(chapter.dexId) : chapter.sprite,
      tracks,
    };
  });
  return {
    id: RANDOM_POKEDEX_ID,
    kind: "meet",
    title: "Facts",
    rangeLabel: "Random 100",
    libraryTitle: "Pokefacts random",
    recommended: true,
    blurb: "One hundred Pokémon drawn at random. Lily reads each one.",
    childDoes:
      "Turn to a picture and press play. You hear the cry, then the name, then a short description.",
    chapters,
  };
}

/** Picture key for a Yoto icon. Forms use the form id so they do not share the species pixel. */
export function chapterPictureId(chapter: { formId?: number; dexId?: number }): number | undefined {
  return chapter.formId ?? chapter.dexId;
}

/** Official artwork for the playlist cover: the first Pokémon on the card. */
export function coverArtworkId(card: KidCard): number | undefined {
  for (const chapter of card.chapters) {
    const id = chapterPictureId(chapter);
    if (id) return id;
  }
  return undefined;
}

/** Swap in the uploaded 16×16 icons. Guess Who clues keep the detective picture. */
function applyUploadedPixels(card: KidCard, mediaById: Record<number, string>): KidCard {
  return {
    ...card,
    chapters: card.chapters.map((chapter) => {
      const pictureId = chapterPictureId(chapter);
      const media = pictureId ? mediaById[pictureId] : undefined;
      if (!media) return chapter;
      const icon = `yoto:#${media}`;
      if (card.kind === "guess") {
        return {
          ...chapter,
          tracks: chapter.tracks.map((track) =>
            track.key === "answer" ? { ...track, icon } : track,
          ),
        };
      }
      return {
        ...chapter,
        icon,
        tracks: chapter.tracks.map((track) => ({ ...track, icon })),
      };
    }),
  };
}

/** The body the Facts page sends. Icons are the pixels just uploaded. */
export function pokedexUpload(
  card: KidCard,
  mediaById: Record<number, string>,
  cardId?: string,
  voiceId: string = LILY_VOICE_ID,
) {
  const spoken = chosenVoice(voiceId);
  const content = buildKidCard(applyUploadedPixels(withVoice(card, spoken), mediaById), cardId);
  if (card.id === RANDOM_POKEDEX_ID) {
    content.metadata.description =
      "Pokefacts random. One hundred Pokemon drawn at random. Turn the wheel until you see a picture, then press play. You hear its cry, then Lily reads the name and a short description. Written for ages 8 to 12. Link this playlist to its own card.";
  }
  return { voiceId: spoken, content };
}

/** The numbered Facts playlists that together cover every national species. */
export function factsBulkPlaylists(cards: KidCard[]): KidCard[] {
  return cards.filter((card) => card.kind === "meet" && card.id !== RANDOM_POKEDEX_ID);
}

function withVoice(card: KidCard, voiceId: string): KidCard {
  const spoken = chosenVoice(voiceId);
  return {
    ...card,
    chapters: card.chapters.map((chapter) => ({
      ...chapter,
      tracks: chapter.tracks.map((track) => ({ ...track, voiceId: spoken })),
    })),
  };
}

/** One Facts playlist in the full-dex send. Icons are the real pixels. */
export function factsPlaylistUpload(
  card: KidCard,
  mediaById: Record<number, string>,
  cardId?: string,
  voiceId: string = LILY_VOICE_ID,
) {
  const spoken = chosenVoice(voiceId);
  const playlistIndex = Number(/^meet-(\d+)$/.exec(card.id)?.[1]);
  const title =
    Number.isInteger(playlistIndex) && playlistIndex >= 1
      ? pokefactsTitle(playlistIndex)
      : card.libraryTitle;
  const usable = cardId && /^[A-Za-z0-9]{5}$/.test(cardId) ? cardId : undefined;
  const content = buildKidCard(applyUploadedPixels(withVoice(card, spoken), mediaById), usable);
  content.metadata.title = title;
  content.title = title;
  content.metadata.description = `${title}. You hear the cry, then Lily reads the name and a short description. Written for ages 8 to 12. Link this playlist to its own card.`;
  return { voiceId: spoken, content };
}

export function guessPoolFromCards(cards: KidCard[]): KidChapter[] {
  return cards
    .filter((card) => card.kind === "guess")
    .flatMap((card) => card.chapters.filter((chapter) => chapter.dexId));
}

export function shadowPixelPath(id: number): string {
  return `/pixels/${id}-shadow.png`;
}

/**
 * One playlist of 50 riddles. Two tracks each fills the 100-track card.
 * Each clue is the number, the colour and type, two Pokédex lines, the size, and the count.
 */
export function randomGuessCard(
  pool: KidChapter[],
  random: () => number = Math.random,
  favourites: readonly number[] = [],
): KidCard {
  // The child's favourites are always among the riddles, mixed in at random places.
  const playable = pool.filter((chapter) => chapter.dexId);
  const chosen = favourites.flatMap((id) => playable.find((chapter) => chapter.dexId === id) ?? []);
  const others = drawSample(
    playable.filter((chapter) => !favourites.includes(chapter.dexId as number)),
    GUESS_RIDDLE_COUNT - chosen.length,
    random,
  );
  const drawn = drawSample([...chosen, ...others], GUESS_RIDDLE_COUNT, random);
  const chapters = drawn.map((chapter) => {
    const dexId = chapter.dexId as number;
    const shadow = shadowPixelPath(dexId);
    const real = `/pixels/${dexId}.png`;
    const tracks = chapter.tracks.map((track, trackIndex) => {
      const clue = track.key === "clues" || trackIndex === 0;
      return {
        ...track,
        voiceId: LILY_VOICE_ID,
        icon: clue ? shadow : real,
      };
    });
    return {
      ...chapter,
      picture: "a shadow",
      icon: shadow,
      sprite: shadow,
      tracks,
    };
  });
  return {
    id: RANDOM_GUESS_ID,
    kind: "guess",
    title: "Who's That Pokémon",
    rangeLabel: "Random 50",
    libraryTitle: "Who's That Pokémon",
    blurb: "Fifty riddles drawn at random. The cry, then the clue. The cry again, then the answer.",
    childDoes:
      "Pick a dark picture and press play. You hear the cry, then the colour and type, two Pokédex lines, and how big it is. The answer plays the cry again, then the name.",
    chapters,
  };
}

/**
 * Clue track and chapter icon are the shadow upload.
 * The answer track switches to the real 16×16 pixel.
 */
export function guessUpload(
  card: KidCard,
  realById: Record<number, string>,
  shadowById: Record<number, string>,
  cardId?: string,
  voiceId: string = LILY_VOICE_ID,
) {
  const spoken = chosenVoice(voiceId);
  const prepared: KidCard = {
    ...card,
    chapters: withVoice(card, spoken).chapters.map((chapter) => {
      const id = chapter.dexId;
      // A form riddle answers with the form's own pixel. Its clue keeps the species shadow.
      const pictureId = chapterPictureId(chapter);
      const shadowMedia = id ? shadowById[id] : undefined;
      const realMedia = pictureId ? realById[pictureId] : undefined;
      if (!shadowMedia && !realMedia) return chapter;
      const shadow = shadowMedia ? `yoto:#${shadowMedia}` : chapter.icon;
      const real = realMedia ? `yoto:#${realMedia}` : shadow;
      return {
        ...chapter,
        icon: shadow,
        tracks: chapter.tracks.map((track, trackIndex) => {
          const clue = track.key === "clues" || trackIndex === 0;
          return { ...track, voiceId: spoken, icon: clue ? shadow : real };
        }),
      };
    }),
  };
  const content = buildKidCard(prepared, cardId);
  content.metadata.title = "Who's That Pokémon";
  content.title = "Who's That Pokémon";
  content.metadata.description =
    "Who's That Pokémon. Fifty riddles drawn at random. Each track starts with the cry, then Lily. The clue never says the name. The answer says the name. The clue icon is a dark shadow on white. The answer icon is the real pixel on white. Written for ages 8 to 12. Link this playlist to its own card.";
  return { voiceId: spoken, content };
}

/** Chapters whose tracks lead with the cry. Facts and Guess Who both qualify. The intro does not. */
export function chaptersForCries(card: KidCard): Array<{ key: string; dexId: number }> {
  return card.chapters.flatMap((chapter) => {
    if (!chapter.dexId) return [];
    if (!chapter.tracks.some((track) => track.lead === "cry")) return [];
    return [{ key: chapter.key, dexId: chapter.dexId }];
  });
}

/**
 * Replace a Facts track with the species Biology speech.
 * Guess Who is left as it is. The random how-to stays on the first track.
 */
export function applySpeciesSpeech(card: KidCard, speechByDexId: Record<number, string>): KidCard {
  if (card.kind !== "meet" && !isSpeciesPlaylistKind(card.kind)) return card;
  return {
    ...card,
    chapters: card.chapters.map((chapter) => {
      if (!chapter.dexId) return chapter;
      const speech = speechByDexId[chapter.dexId]?.replace(/\s+/g, " ").trim();
      if (!speech) return chapter;
      return {
        ...chapter,
        tracks: chapter.tracks.map((track) => {
          const prefix = track.text.startsWith(POKEDEX_HOWTO) ? POKEDEX_HOWTO : "";
          const text = `${prefix}${speech}`.replace(/\s+/g, " ").trim();
          return { ...track, text, spoken: pronounce(text), source: undefined };
        }),
      };
    }),
  };
}

type FormPlaylistEntry = {
  formId: number;
  speciesId: number;
  speciesName: string;
  formName: string;
  blocks?: BiologyBlock[];
  url?: string;
};

/** One form per species, then the extra forms. Used once a list passes the track cap. */
function rankForms<T extends { speciesId: number }>(forms: readonly T[]): T[] {
  const seen = new Set<number>();
  const primary: T[] = [];
  const extra: T[] = [];
  for (const form of forms) {
    if (seen.has(form.speciesId)) extra.push(form);
    else {
      seen.add(form.speciesId);
      primary.push(form);
    }
  }
  return [...primary, ...extra];
}

/** Every species first, then extra forms, stopping at the 100-track card. */
function fitFormTracks<T extends { speciesId: number }>(forms: readonly T[], limit = YOTO_TRACK_LIMIT): T[] {
  if (forms.length <= limit) return forms.slice();
  return rankForms(forms).slice(0, limit);
}

const MEGA_PLAYLIST_ID = "mega-evolutions";
const GMAX_PLAYLIST_ID = "gigantamax";
const ALOLA_PLAYLIST_ID = "alolan-forms";
const HISUI_PLAYLIST_ID = "hisuian-forms";
const LEGENDARY_PLAYLIST_ID = "legendary";
const MYTHICAL_PLAYLIST_ID = "mythical";
const STARTER_PLAYLIST_ID = "starters";

const FORM_PLAYLIST_META: Record<FormPlaylistKind, { title: string; id: string }> = {
  mega: { title: "Mega Evolutions", id: MEGA_PLAYLIST_ID },
  gmax: { title: "Gigantamax", id: GMAX_PLAYLIST_ID },
  alola: { title: "Alolan forms", id: ALOLA_PLAYLIST_ID },
  hisui: { title: "Hisuian forms", id: HISUI_PLAYLIST_ID },
};

const SPECIES_PLAYLIST_META: Record<SpeciesPlaylistKind, { title: string; id: string }> = {
  legendary: { title: "Legendary Pokémon", id: LEGENDARY_PLAYLIST_ID },
  mythical: { title: "Mythical Pokémon", id: MYTHICAL_PLAYLIST_ID },
  starter: { title: "Starter Pokémon", id: STARTER_PLAYLIST_ID },
};

const FORM_CHILD_DOES =
  "Turn to a picture and press play. You hear the cry, then the name, then the description.";
const SPECIES_CHILD_DOES =
  "Turn to a picture and press play. You hear the cry, then the name, then a short description.";

function splitPlaylistCopy(title: string, index: number, total: number, first: number, last: number, baseId: string) {
  if (total <= 1) {
    return { id: baseId, rangeLabel: title, libraryTitle: title, splitBlurb: "" };
  }
  const span = first === last ? String(first) : `${first}-${last}`;
  return {
    id: `${baseId}-${index}`,
    rangeLabel: `${title} ${index} (${span})`,
    libraryTitle: `${title} ${index}`,
    splitBlurb: `Yoto holds ${YOTO_TRACK_LIMIT} tracks, so ${title} are split into ${total} playlists.`,
  };
}

function formChapter(form: FormPlaylistEntry, used: Set<string>): KidChapter {
  const text = spokenWiki(form.formName, form.blocks ?? []);
  const icon = formArtworkSrc("form", form.formId);
  let overlay = String(form.speciesId);
  while (used.has(overlay)) overlay = `${overlay}b`;
  used.add(overlay);
  const chapter = picture(
    `form-${form.formId}`,
    form.formName,
    overlay,
    "this Pokémon",
    overlay,
    icon,
    [talk("entry", form.formName, text, icon, overlay, undefined, "cry")],
    { sprite: icon, dexId: form.speciesId },
  );
  chapter.formId = form.formId;
  if (form.url) chapter.articleUrl = form.url;
  return chapter;
}

/**
 * Cry-first form playlists. A list past 100 tracks is split the way Facts is,
 * after putting one form per species first.
 */
export function formPlaylists(kind: FormPlaylistKind, forms: readonly FormPlaylistEntry[]): KidCard[] {
  const meta = FORM_PLAYLIST_META[kind];
  const ordered = forms.length <= YOTO_TRACK_LIMIT ? forms.slice() : rankForms(forms);
  const slices = ordered.length === 0 ? [[]] : chunk(ordered, YOTO_TRACK_LIMIT);
  const groups = slices.map((group) => fitFormTracks(group));
  return groups.map((group, index) => {
    const used = new Set<string>();
    const chapters = group.map((form) => formChapter(form, used));
    const first = chapters[0]?.dexId ?? 0;
    const last = chapters[chapters.length - 1]?.dexId ?? first;
    const names = splitPlaylistCopy(meta.title, index + 1, groups.length, first, last, meta.id);
    return {
      id: names.id,
      kind,
      title: meta.title,
      rangeLabel: names.rangeLabel,
      libraryTitle: names.libraryTitle,
      blurb: names.splitBlurb || "The cry, then Lily reads the form.",
      childDoes: FORM_CHILD_DOES,
      chapters,
    };
  });
}

/** The first form playlist. Mega and Gigantamax stay on one card today. */
export function formPlaylist(kind: FormPlaylistKind, forms: readonly FormPlaylistEntry[]): KidCard {
  const card = formPlaylists(kind, forms)[0];
  if (!card) throw new Error(`Missing ${kind} playlist`);
  return card;
}

/** Facts-style chapter with the species 16×16 pixel as the Yoto icon. */
function speciesPlaylistChapter(sheet: MonSheet): KidChapter {
  const chapter = factChapter(sheet);
  const icon = `/pixels/${sheet.id}.png`;
  return {
    ...chapter,
    icon,
    tracks: chapter.tracks.map((track) => ({ ...track, icon })),
  };
}

/** Cry-first species playlists. More than 100 tracks are split into further cards. */
export function speciesPlaylists(kind: SpeciesPlaylistKind, sheets: readonly MonSheet[]): KidCard[] {
  const meta = SPECIES_PLAYLIST_META[kind];
  const slices = sheets.length === 0 ? [[]] : chunk(sheets.slice(), YOTO_TRACK_LIMIT);
  return slices.map((group, index) => {
    const chapters = group.map((sheet) => speciesPlaylistChapter(sheet));
    const first = chapters[0]?.dexId ?? 0;
    const last = chapters[chapters.length - 1]?.dexId ?? first;
    const names = splitPlaylistCopy(meta.title, index + 1, slices.length, first, last, meta.id);
    return {
      id: names.id,
      kind,
      title: meta.title,
      rangeLabel: names.rangeLabel,
      libraryTitle: names.libraryTitle,
      blurb: names.splitBlurb || "The cry, then the name, then a short description.",
      childDoes: SPECIES_CHILD_DOES,
      chapters,
    };
  });
}

/** Same upload shape as Pokefacts. The Yoto title is the playlist name, with no stale card id. */
export function formPlaylistUpload(
  card: KidCard,
  mediaById: Record<number, string>,
  cardId?: string,
  voiceId: string = LILY_VOICE_ID,
) {
  const spoken = chosenVoice(voiceId);
  const title = card.libraryTitle;
  const usable = cardId && /^[A-Za-z0-9]{5}$/.test(cardId) ? cardId : undefined;
  const content = buildKidCard(applyUploadedPixels(withVoice(card, spoken), mediaById), usable);
  content.title = title;
  content.metadata.title = title;
  const reader = isPiperVoice(spoken) ? "Piper" : "Lily";
  content.metadata.description = `${title}. You hear the cry, then ${reader} reads the form. Written for ages 8 to 12. Link this playlist to its own card.`;
  if (!usable) delete content.cardId;
  return { voiceId: spoken, content };
}

/** Clue and answer playback. Both start with the cry. The clue script omits the name. */
export function guessPlayOrder(chapter: KidChapter): { clue: string[]; answer: string[] } {
  const line = (track: KidTrack | undefined) => {
    const script = track?.text ?? "";
    return track?.lead === "cry" ? ["cry", script] : [script];
  };
  return {
    clue: line(chapter.tracks[0]),
    answer: line(chapter.tracks[1]),
  };
}
