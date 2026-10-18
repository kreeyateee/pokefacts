import { dexBlurb, pickDexEntry, threeClues, type MonSheet } from "@/lib/dex-facts";
import { pronounce } from "@/lib/pronounce";
import type { YotoContent } from "@/lib/yoto-card";
import { iconForType, YOTO_ICONS } from "@/lib/yoto-icons";

/** Lily, the British woman. Yoto Labs records her MP3 from the spoken script. */
export const LILY_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku";

/** The Pokedex playlist the parent sends: 100 tracks, no extra intro. */
export const POKEDEX_PLAYLIST_SIZE = 100;

export const RANDOM_POKEDEX_ID = "meet-random";

/** One Guess Who playlist: 50 riddles, two tracks each, no separate intro. */
export const GUESS_RIDDLE_COUNT = 50;

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
  /** National dex number, when this chapter is one Pokémon. */
  dexId?: number;
  /** Sprite shown on the page. */
  sprite?: string;
  /** Merged cry and reading, when that file has been recorded. */
  clip?: string;
  tracks: KidTrack[];
};

export type KidCardKind = "meet" | "guess";

export type KidCard = {
  /** `meet-1` … `meet-11`, or `guess-1` … `guess-21`. */
  id: string;
  kind: KidCardKind;
  title: string;
  /** On-page label, such as "Pokefacts 1 · 1-99". The Yoto title is libraryTitle. */
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
export const FACTS_PER_CARD = YOTO_TRACK_LIMIT - 1;

/** One intro track plus two tracks per riddle leaves room for 49 riddles. */
export const RIDDLES_PER_CARD = Math.floor((YOTO_TRACK_LIMIT - 1) / 2);

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
  const readable = text.replace(/\s+/g, " ").trim();
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

/** On-page label. The middle dot stays here; the Yoto title is `pokefactsTitle`. */
export function rangeLabel(kind: KidCardKind, first: number, last: number, index = 1): string {
  const span = first === last ? String(first) : `${first}-${last}`;
  if (kind === "meet") return `${pokefactsTitle(index)} · ${span}`;
  return `Guess Who ${span}`;
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
      sprite: `/sprites/${sheet.id}.png`,
      clip: CRY_CLIPS.has(sheet.id) ? `/facts/${sheet.id}.mp3` : undefined,
      dexId: sheet.id,
    },
  );
}

function riddleChapter(sheet: MonSheet): KidChapter {
  const number = String(sheet.id);
  const entry = pickDexEntry(sheet.entries);
  const clues = threeClues(sheet.name, sheet.entries, sheet);
  const answerIcon = typeIcon(sheet.types);
  const dexLine = entry.text ? ` ${entry.text}` : "";
  return picture(
    sheet.slug,
    sheet.name,
    number,
    "a detective",
    "?",
    I.detective,
    [
      talk(
        "clues",
        "Three clues",
        `Number ${number}. Three clues. ${clues.join(" ")} Shout your guess. One. Two. Three.`,
        I.detective,
        "?",
        undefined,
        "cry",
      ),
      talk(
        "answer",
        "The answer",
        `It is ${sheet.name}.${dexLine} The picture changes to this Pokémon now. Turn to another number for a new riddle.`,
        answerIcon,
        "Yes",
        entry.version || undefined,
        "cry",
      ),
    ],
    { sprite: `/sprites/${sheet.id}.png`, dexId: sheet.id },
  );
}

function intro(kind: KidCardKind, index: number, first: number, last: number, firstName: string): KidChapter {
  const span = first === last ? String(first) : `${first}-${last}`;
  const text =
    kind === "meet"
      ? `This card is Pokefacts ${index}, numbers ${span}. Turn the wheel, or press the arrows, until you see a picture. Then press play. You will hear the cry, then the name, then the Pokédex line, then how much it weighs and how tall it is. The star is this track. Number ${first} is ${firstName}. Each playlist links to its own card.`
      : `Guess Who. Numbers ${span}. Turn the wheel, or press the arrows, until you see a number. Then press play. Three clues. Call the name before the count of three ends. The answer plays next, and the picture changes to that Pokémon. Start at number ${first}. Each playlist links to its own card.`;
  return picture("start", "Start here", "Go", "a star", "★", I.star, [
    talk("how", kind === "meet" ? "How to play" : "How to play Guess Who", text, I.star, "Go"),
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
      title: kind === "meet" ? "Pokefacts" : "Guess Who",
      rangeLabel: label,
      libraryTitle: kind === "meet" ? pokefactsTitle(playlistIndex) : "Guess Who",
      recommended: kind === "meet" && index === 0,
      blurb:
        kind === "meet"
          ? "The name, then the Pokédex line, then the weight and the height."
          : "Three clues. Call the name before the count ends.",
      childDoes:
        kind === "meet"
          ? "Turn to a picture and press play. You hear the name, then the Pokédex line, then how much it weighs and how tall it is."
          : "Pick a number and press play. Three clues, then a count of three. The answer plays next and the picture changes.",
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

const POKEDEX_HOWTO =
  "One hundred Pokémon, drawn at random. Turn the wheel, or press the arrows, until you see a picture. Then press play. ";

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
      sprite: `/pixels/${chapter.dexId}.png`,
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
      "Turn to a picture and press play. You hear the name, then the Pokédex line, then how much it weighs and how tall it is.",
    chapters,
  };
}

/** Swap in the uploaded 16×16 icons. Guess Who clues keep the detective picture. */
export function applyUploadedPixels(card: KidCard, mediaById: Record<number, string>): KidCard {
  return {
    ...card,
    chapters: card.chapters.map((chapter) => {
      const media = chapter.dexId ? mediaById[chapter.dexId] : undefined;
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

/** The body the Facts page sends. Voice is Lily. Icons are the pixels just uploaded. */
export function pokedexUpload(card: KidCard, mediaById: Record<number, string>, cardId?: string) {
  const content = buildKidCard(applyUploadedPixels(card, mediaById), cardId);
  if (card.id === RANDOM_POKEDEX_ID) {
    content.metadata.description =
      "Pokefacts random. One hundred Pokemon drawn at random. Turn the wheel until you see a picture, then press play. You hear its cry, then Lily reads the name, the dex line, the weight, and the height. Written for ages 8 to 12. Link this playlist to its own card.";
  }
  return { voiceId: LILY_VOICE_ID, content };
}

/** The numbered Facts playlists that together cover every national species. */
export function factsBulkPlaylists(cards: KidCard[]): KidCard[] {
  return cards.filter((card) => card.kind === "meet" && card.id !== RANDOM_POKEDEX_ID);
}

function withLily(card: KidCard): KidCard {
  return {
    ...card,
    chapters: card.chapters.map((chapter) => ({
      ...chapter,
      tracks: chapter.tracks.map((track) => ({ ...track, voiceId: LILY_VOICE_ID })),
    })),
  };
}

/** One Facts playlist in the full-dex send. Lily reads it. Icons are the real pixels. */
export function factsPlaylistUpload(card: KidCard, mediaById: Record<number, string>, cardId?: string) {
  const playlistIndex = Number(/^meet-(\d+)$/.exec(card.id)?.[1]);
  const title =
    Number.isInteger(playlistIndex) && playlistIndex >= 1
      ? pokefactsTitle(playlistIndex)
      : card.libraryTitle;
  const usable = cardId && /^[A-Za-z0-9]{5}$/.test(cardId) ? cardId : undefined;
  const content = buildKidCard(applyUploadedPixels(withLily(card), mediaById), usable);
  content.metadata.title = title;
  content.title = title;
  content.metadata.description = `${title}. You hear the cry, then Lily reads the name, the dex line, the weight, and the height. Written for ages 8 to 12. Link this playlist to its own card.`;
  return { voiceId: LILY_VOICE_ID, content };
}

export function guessPoolFromCards(cards: KidCard[]): KidChapter[] {
  return cards
    .filter((card) => card.kind === "guess")
    .flatMap((card) => card.chapters.filter((chapter) => chapter.dexId));
}

export function shadowPixelPath(id: number): string {
  return `/pixels/${id}-shadow.png`;
}

const GUESS_HOWTO =
  "Guess Who. Fifty riddles, drawn at random. You hear the cry, then three clues. Turn the wheel until you see a dark picture. Press play. Shout your guess before the count ends. The next track plays the cry again, then tells you the answer, and the picture changes to the real Pokémon. ";

/**
 * One playlist of 50 riddles. Two tracks each fills the 100-track card.
 * The how-to is in the description and at the start of the first clue.
 */
export function randomGuessCard(pool: KidChapter[], random: () => number = Math.random): KidCard {
  const drawn = drawSample(
    pool.filter((chapter) => chapter.dexId),
    GUESS_RIDDLE_COUNT,
    random,
  );
  const chapters = drawn.map((chapter, index) => {
    const dexId = chapter.dexId as number;
    const shadow = shadowPixelPath(dexId);
    const real = `/pixels/${dexId}.png`;
    const tracks = chapter.tracks.map((track, trackIndex) => {
      const clue = track.key === "clues" || trackIndex === 0;
      const text = index === 0 && clue ? `${GUESS_HOWTO}${track.text}` : track.text;
      return {
        ...track,
        text,
        spoken: pronounce(text),
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
    title: "Guess Who",
    rangeLabel: "Random 50",
    libraryTitle: "Guess Who",
    blurb: "Fifty riddles drawn at random. The cry, then the clue. The cry again, then the answer.",
    childDoes:
      "Pick a dark picture and press play. You hear the cry, then three clues, then a count of three. The answer plays the cry again, then the name, and the picture changes.",
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
) {
  const prepared: KidCard = {
    ...card,
    chapters: withLily(card).chapters.map((chapter) => {
      const id = chapter.dexId;
      const shadowMedia = id ? shadowById[id] : undefined;
      const realMedia = id ? realById[id] : undefined;
      if (!shadowMedia && !realMedia) return chapter;
      const shadow = shadowMedia ? `yoto:#${shadowMedia}` : chapter.icon;
      const real = realMedia ? `yoto:#${realMedia}` : shadow;
      return {
        ...chapter,
        icon: shadow,
        tracks: chapter.tracks.map((track, trackIndex) => {
          const clue = track.key === "clues" || trackIndex === 0;
          return { ...track, voiceId: LILY_VOICE_ID, icon: clue ? shadow : real };
        }),
      };
    }),
  };
  const content = buildKidCard(prepared, cardId);
  content.metadata.title = "Guess Who";
  content.title = "Guess Who";
  content.metadata.description =
    "Guess Who. Fifty riddles drawn at random. Each track starts with the cry, then Lily. The clue never says the name. The answer says the name. The clue icon is a dark shadow. The answer icon is the real pixel. Written for ages 8 to 12. Link this playlist to its own card.";
  return { voiceId: LILY_VOICE_ID, content };
}

/** Chapters whose tracks lead with the cry. Facts and Guess Who both qualify. The intro does not. */
export function chaptersForCries(card: KidCard): Array<{ key: string; dexId: number }> {
  return card.chapters.flatMap((chapter) => {
    if (!chapter.dexId) return [];
    if (!chapter.tracks.some((track) => track.lead === "cry")) return [];
    return [{ key: chapter.key, dexId: chapter.dexId }];
  });
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
