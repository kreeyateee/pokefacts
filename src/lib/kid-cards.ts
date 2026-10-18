import { dexBlurb, pickDexEntry, threeClues, type MonSheet } from "@/lib/dex-facts";
import { pronounce } from "@/lib/pronounce";
import type { YotoContent } from "@/lib/yoto-card";
import { iconForType, YOTO_ICONS } from "@/lib/yoto-icons";

export type KidTrack = {
  key: string;
  title: string;
  /** Official wording, shown on the page. */
  text: string;
  /** Same words with names respelled for the narrator. */
  spoken: string;
  /** Pixel shown on the player while this part plays. */
  icon: string;
  overlay: string;
  /** Game the Pokédex line comes from, when this track is an entry. */
  source?: string;
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
  /** Playlist the parent is sending, such as "Facts 1–99". */
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

export function rangeLabel(kind: KidCardKind, first: number, last: number): string {
  const title = kind === "meet" ? "Facts" : "Guess Who";
  return first === last ? `${title} ${first}` : `${title} ${first}–${last}`;
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
      ),
      talk(
        "answer",
        "The answer",
        `It is ${sheet.name}.${dexLine} The picture changes to this Pokémon now. Turn to another number for a new riddle.`,
        answerIcon,
        "Yes",
        entry.version || undefined,
      ),
    ],
    { sprite: `/sprites/${sheet.id}.png`, dexId: sheet.id },
  );
}

function intro(kind: KidCardKind, first: number, last: number, firstName: string): KidChapter {
  const label = rangeLabel(kind, first, last);
  const text =
    kind === "meet"
      ? `This card is ${label}. Turn the wheel, or press the arrows, until you see a picture. Then press play. You will hear the name, then the Pokédex line, then how much it weighs and how tall it is. The star is this track. Number ${first} is ${firstName}. Each playlist links to its own card.`
      : `Guess Who. This card is ${label}. Turn the wheel, or press the arrows, until you see a number. Then press play. Three clues. Call the name before the count of three ends. The answer plays next, and the picture changes to that Pokémon. Start at number ${first}. Each playlist links to its own card.`;
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
    const label = rangeLabel(kind, first, last);
    const chapters = [
      intro(kind, first, last, firstSheet?.name ?? "this Pokémon"),
      ...group.map((sheet) => (kind === "meet" ? factChapter(sheet) : riddleChapter(sheet))),
    ];
    return {
      id: `${kind}-${index + 1}`,
      kind,
      title: kind === "meet" ? "Facts" : "Guess Who",
      rangeLabel: label,
      libraryTitle: `Champdex: ${label}`,
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
          overlayLabel: track.overlay,
          display: { icon16x16: track.icon },
        })),
      })),
    },
    metadata: {
      title: card.libraryTitle,
      description: `${card.rangeLabel}. ${card.blurb} Written for ages 8 to 12. Link this playlist to its own Make Your Own card. One card holds ${YOTO_TRACK_LIMIT} tracks.`,
    },
  };
  if (cardId) content.cardId = cardId;
  return content;
}
