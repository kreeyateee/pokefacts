import { pickDexEntry, threeClues, type FlavorSource } from "@/lib/dex-facts";
import { pronounce } from "@/lib/pronounce";
import type { YotoContent } from "@/lib/yoto-card";
import { YOTO_ICONS } from "@/lib/yoto-icons";

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
  tracks: KidTrack[];
};

export type KidCard = {
  id: "meet" | "guess";
  title: string;
  libraryTitle: string;
  recommended?: boolean;
  blurb: string;
  childDoes: string;
  chapters: KidChapter[];
};

type Mon = {
  id: number;
  key: string;
  name: string;
  picture: string;
  mark: string;
  icon: string;
};

const I = YOTO_ICONS;

const ROSTER: Mon[] = [
  { id: 1, key: "bulbasaur", name: "Bulbasaur", picture: "a flower", mark: "❀", icon: I.daisy },
  { id: 4, key: "charmander", name: "Charmander", picture: "a flame", mark: "🔥", icon: I.fire },
  { id: 7, key: "squirtle", name: "Squirtle", picture: "a fish", mark: "🐟", icon: I.fish },
  { id: 25, key: "pikachu", name: "Pikachu", picture: "a sun", mark: "☀", icon: I.sun },
  { id: 133, key: "eevee", name: "Eevee", picture: "a dog", mark: "🐶", icon: I.dog },
  { id: 39, key: "jigglypuff", name: "Jigglypuff", picture: "a music note", mark: "♪", icon: I.music },
  { id: 143, key: "snorlax", name: "Snorlax", picture: "a bear", mark: "🐻", icon: I.bear },
  { id: 94, key: "gengar", name: "Gengar", picture: "a ghost", mark: "👻", icon: I.ghost },
  { id: 321, key: "wailord", name: "Wailord", picture: "a wave", mark: "〰", icon: I.wave },
];

const GUESS_ORDER = [
  "pikachu",
  "bulbasaur",
  "charmander",
  "snorlax",
  "squirtle",
  "jigglypuff",
  "eevee",
  "gengar",
  "wailord",
];

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
): KidChapter {
  return { key, title, overlay, picture: pictureLabel, mark, icon, tracks };
}

export function trackSpeech(track: KidTrack): string {
  return track.spoken;
}

export function kidCardsFromDex(dex: Map<number, FlavorSource[]>): KidCard[] {
  const byKey = new Map(ROSTER.map((mon) => [mon.key, mon]));

  const facts = ROSTER.map((mon, index) => {
    const entry = pickDexEntry(dex.get(mon.id) ?? []);
    const number = String(index + 1);
    return picture(mon.key, mon.name, number, mon.picture, mon.mark, mon.icon, [
      talk(
        "fact",
        mon.name,
        `Number ${number}. ${mon.name}. ${entry.text}`,
        mon.icon,
        number,
        entry.version,
      ),
    ]);
  });

  const riddles = GUESS_ORDER.map((key, index) => {
    const mon = byKey.get(key);
    if (!mon) throw new Error(`Missing roster entry for ${key}.`);
    const sources = dex.get(mon.id) ?? [];
    const entry = pickDexEntry(sources);
    const clues = threeClues(mon.name, sources);
    const number = String(index + 1);
    return picture(mon.key, mon.name, number, "a detective", "?", I.detective, [
      talk(
        "clues",
        `${mon.name} clues`,
        `Number ${number}. Three clues. ${clues.join(" ")} Shout your guess. One. Two. Three.`,
        I.detective,
        "?",
      ),
      talk(
        "answer",
        `${mon.name} answer`,
        `It is ${mon.name}. ${entry.text} The picture is ${mon.picture} now. Turn to another number for a new riddle.`,
        mon.icon,
        "Yes",
        entry.version,
      ),
    ]);
  });

  return [
    {
      id: "meet",
      title: "Facts",
      libraryTitle: "Champdex: Pokémon Facts",
      recommended: true,
      blurb: "One English Pokédex entry for each Pokémon.",
      childDoes: "Turn to a picture and press play. Each picture reads one Pokédex entry.",
      chapters: [
        picture("start", "Start here", "Go", "a star", "★", I.star, [
          talk(
            "how",
            "How to play",
            "Pokémon facts. Turn the wheel, or press the arrows, until you see a picture. Then press play. Each picture is one Pokédex entry. The star is this track. Number 1 is Bulbasaur.",
            I.star,
            "Go",
          ),
        ]),
        ...facts,
      ],
    },
    {
      id: "guess",
      title: "Guess Who",
      libraryTitle: "Champdex: Guess Who",
      blurb: "Three clues from the Pokédex. Call the name before the count ends.",
      childDoes:
        "Pick a number and press play. Three Pokédex clues, then a count of three. The answer plays next and the picture changes.",
      chapters: [
        picture("start", "Start here", "Go", "a star", "★", I.star, [
          talk(
            "how",
            "How to play Guess Who",
            "Guess Who. Turn the wheel, or press the arrows, until you see a number. Then press play. Three clues from the Pokédex. Call the name before the count of three ends. The answer plays next, and the picture changes to that Pokémon. Start at number 1.",
            I.star,
            "Go",
          ),
        ]),
        ...riddles,
      ],
    },
  ];
}

export function buildKidCard(card: KidCard, cardId?: string): YotoContent {
  const content: YotoContent = {
    title: card.libraryTitle,
    content: {
      chapters: card.chapters.map((chapter) => ({
        key: chapter.key,
        title: chapter.title,
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
      description: `${card.blurb} Written for ages 8 to 12, to play on a Yoto player with one Make Your Own card.`,
    },
  };
  if (cardId) content.cardId = cardId;
  return content;
}
