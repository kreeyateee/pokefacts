import type { YotoContent } from "@/lib/yoto-card";
import { YOTO_ICONS } from "@/lib/yoto-icons";

export type KidTrack = {
  key: string;
  title: string;
  text: string;
  /** Pixel shown on the player while this part plays. */
  icon: string;
  overlay: string;
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

const I = YOTO_ICONS;

function talk(
  key: string,
  title: string,
  text: string,
  icon: string,
  overlay: string,
): KidTrack {
  return { key, title, text: text.replace(/\s+/g, " ").trim(), icon, overlay };
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
  return {
    key,
    title,
    overlay,
    picture: pictureLabel,
    mark,
    icon,
    tracks,
  };
}

const MEET_END = "Turn the dial when you want the next one.";

export const KID_CARDS: KidCard[] = [
  {
    id: "meet",
    title: "Facts",
    libraryTitle: "Champdex: Pokémon Facts",
    recommended: true,
    blurb: "Type, a real fact, and how it evolves.",
    childDoes:
      "Turn to a picture and press play. Each picture gives the type, a fact, and the evolution.",
    chapters: [
      picture(
        "start",
        "Start here",
        "Go",
        "a star",
        "★",
        I.star,
        [
          talk(
            "how",
            "How to play",
            "Pokémon facts. Turn the wheel, or press the arrows, until you see a picture. Then press play. You get the type, a real fact, and how it evolves. The star is this track. Number 1 is Bulbasaur.",
            I.star,
            "Go",
          ),
        ],
      ),
      picture(
        "bulbasaur",
        "Bulbasaur",
        "1",
        "a flower",
        "❀",
        I.daisy,
        [
          talk(
            "fact",
            "Bulbasaur",
            `Number 1. The flower. Bulbasaur is a Grass and Poison type, number 001 in the Pokédex. The seed on its back stores energy from sunlight, and it gets bigger as Bulbasaur grows. At level 16 it evolves into Ivysaur. At level 32 the seed blooms and it becomes Venusaur. About 2 feet tall, and about 15 pounds. ${MEET_END}`,
            I.daisy,
            "1",
          ),
        ],
      ),
      picture(
        "charmander",
        "Charmander",
        "2",
        "a flame",
        "🔥",
        I.fire,
        [
          talk(
            "fact",
            "Charmander",
            `Number 2. The flame. Charmander is a Fire type. The flame on its tail is a sign of its health. When Charmander is doing well, that flame burns bright. At level 16 it evolves into Charmeleon. At level 36 it becomes Charizard. About 2 feet tall, and about 19 pounds. ${MEET_END}`,
            I.fire,
            "2",
          ),
        ],
      ),
      picture(
        "squirtle",
        "Squirtle",
        "3",
        "a fish",
        "🐟",
        I.fish,
        [
          talk(
            "fact",
            "Squirtle",
            `Number 3. The fish, because Squirtle is a Water type. It can pull into its shell, and that shell is hard enough to take a hit. It fights back with a blast of water. At level 16 it evolves into Wartortle. At level 36 it becomes Blastoise, with water cannons on the shell. A bit under 2 feet tall, about 20 pounds. ${MEET_END}`,
            I.fish,
            "3",
          ),
        ],
      ),
      picture(
        "pikachu",
        "Pikachu",
        "4",
        "a sun",
        "☀",
        I.sun,
        [
          talk(
            "fact",
            "Pikachu",
            `Number 4. The sun. Pikachu is an Electric type. The red circles on its cheeks are pouches that store electricity, and a shock can jump out when it is startled. Pikachu evolves from Pichu once their bond is strong. A Thunder Stone turns Pikachu into Raichu. Just over a foot tall, about 13 pounds. And yes, it says its own name. ${MEET_END}`,
            I.sun,
            "4",
          ),
        ],
      ),
      picture(
        "eevee",
        "Eevee",
        "5",
        "a dog",
        "🐶",
        I.dog,
        [
          talk(
            "fact",
            "Eevee",
            `Number 5. The dog, for the fluffy coat and pointed ears. Eevee is a Normal type, and its body can evolve eight different ways. Water Stone, Vaporeon. Thunder Stone, Jolteon. Fire Stone, Flareon. A close bond in the day, Espeon. A close bond at night, Umbreon. A Leaf Stone, Leafeon. An Ice Stone, Glaceon. A close bond plus a Fairy move, Sylveon. About 1 foot tall, and about 14 pounds. ${MEET_END}`,
            I.dog,
            "5",
          ),
        ],
      ),
      picture(
        "jigglypuff",
        "Jigglypuff",
        "6",
        "a music note",
        "♪",
        I.music,
        [
          talk(
            "fact",
            "Jigglypuff",
            `Number 6. The music note. Jigglypuff is Normal and Fairy. Its song is a lullaby, and listeners fall asleep. Fall asleep before the song ends and it gets annoyed and draws on your face with a marker. It evolves from Igglybuff. A Moon Stone turns it into Wigglytuff. A bit under 2 feet tall, about 12 pounds. ${MEET_END}`,
            I.music,
            "6",
          ),
        ],
      ),
      picture(
        "snorlax",
        "Snorlax",
        "7",
        "a bear",
        "🐻",
        I.bear,
        [
          talk(
            "fact",
            "Snorlax",
            `Number 7. The bear. Snorlax is a Normal type, almost 7 feet tall and over 1,000 pounds. It falls asleep in the road and will not move. It wakes up to eat. A hungry Snorlax can put away about 900 pounds of food in a day, then go straight back to sleep. It evolves from Munchlax when their bond is strong. ${MEET_END}`,
            I.bear,
            "7",
          ),
        ],
      ),
      picture(
        "gengar",
        "Gengar",
        "8",
        "a ghost",
        "👻",
        I.ghost,
        [
          talk(
            "fact",
            "Gengar",
            "Number 8. The ghost. Gengar is Ghost and Poison, about 5 feet tall and 90 pounds. It hides in shadows and will slip into yours to give you a scare. A sudden chill can mean it is right there with you. Gastly evolves into Haunter, and Haunter becomes Gengar only when it is traded. You can turn back to any number and hear it again.",
            I.ghost,
            "8",
          ),
        ],
      ),
    ],
  },
  {
    id: "guess",
    title: "Guess Who",
    libraryTitle: "Champdex: Guess Who",
    blurb: "Three clues. Call the name before the count ends.",
    childDoes:
      "Pick a number and press play. Three clues, then a count of three. The answer plays next and the picture changes.",
    chapters: [
      picture(
        "start",
        "Start here",
        "Go",
        "a star",
        "★",
        I.star,
        [
          talk(
            "how",
            "How to play Guess Who",
            "Guess Who. Turn the wheel, or press the arrows, until you see a number. Then press play. Three clues. Call the name before the count of three ends. The answer plays next, and the picture changes to that Pokémon. Start at number 1.",
            I.star,
            "Go",
          ),
        ],
      ),
      ...guessChapters(),
    ],
  },
];

function guessChapters(): KidChapter[] {
  const riddles: Array<{
    key: string;
    name: string;
    clues: string;
    answer: string;
    icon: string;
    picture: string;
    mark: string;
  }> = [
    {
      key: "pikachu",
      name: "Pikachu",
      clues:
        "I am an Electric type. My cheeks store electricity. I evolve from Pichu, and a Thunder Stone turns me into Raichu.",
      answer:
        "It is Pikachu. Those red cheek pouches can throw a spark when it is startled. Just over a foot tall, about 13 pounds.",
      icon: I.sun,
      picture: "a sun",
      mark: "☀",
    },
    {
      key: "bulbasaur",
      name: "Bulbasaur",
      clues:
        "I am Grass and Poison. I carry a seed that stores sunlight. I evolve at level 16, and later that seed blooms.",
      answer:
        "It is Bulbasaur. Number 001. At level 32 it becomes Venusaur and the seed opens into a flower.",
      icon: I.daisy,
      picture: "a flower",
      mark: "❀",
    },
    {
      key: "charmander",
      name: "Charmander",
      clues:
        "I am a Fire type. A flame on my tail shows how healthy I am. At level 36 I grow wings.",
      answer:
        "It is Charmander. Charmeleon comes at level 16. Charizard comes at level 36.",
      icon: I.fire,
      picture: "a flame",
      mark: "🔥",
    },
    {
      key: "snorlax",
      name: "Snorlax",
      clues:
        "I am a Normal type, almost 7 feet tall. I fall asleep in the road. I can eat about 900 pounds of food in a day.",
      answer:
        "It is Snorlax. Over 1,000 pounds, and it evolves from Munchlax when their bond is strong.",
      icon: I.bear,
      picture: "a bear",
      mark: "🐻",
    },
    {
      key: "squirtle",
      name: "Squirtle",
      clues:
        "I am a Water type. I hide inside a hard shell. Later, water cannons grow out of that shell.",
      answer: "It is Squirtle. Wartortle at level 16. Blastoise at level 36.",
      icon: I.fish,
      picture: "a fish",
      mark: "🐟",
    },
    {
      key: "jigglypuff",
      name: "Jigglypuff",
      clues:
        "I am Normal and Fairy. I sing people to sleep. If you nod off too early, I draw on your face.",
      answer: "It is Jigglypuff. A Moon Stone evolves it into Wigglytuff.",
      icon: I.music,
      picture: "a music note",
      mark: "♪",
    },
    {
      key: "eevee",
      name: "Eevee",
      clues:
        "I am a Normal type, brown and fluffy. I can evolve eight different ways. A stone, the time of day, or a close bond decides which one.",
      answer:
        "It is Eevee. Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Leafeon, Glaceon, and Sylveon all start as Eevee.",
      icon: I.dog,
      picture: "a dog",
      mark: "🐶",
    },
    {
      key: "gengar",
      name: "Gengar",
      clues:
        "I am Ghost and Poison. I hide in shadows. I only finish evolving when I am traded.",
      answer:
        "It is Gengar. It steps into your shadow to give you a scare. Haunter becomes Gengar by trade.",
      icon: I.ghost,
      picture: "a ghost",
      mark: "👻",
    },
  ];

  return riddles.map((riddle, index) => {
    const number = String(index + 1);
    return picture(
      riddle.key,
      riddle.name,
      number,
      "a detective",
      "?",
      I.detective,
      [
        talk(
          "clues",
          `${riddle.name} clues`,
          `Number ${number}. Three clues. ${riddle.clues} Shout your guess. One. Two. Three.`,
          I.detective,
          "?",
        ),
        talk(
          "answer",
          `${riddle.name} answer`,
          `${riddle.answer} The picture is ${riddle.picture} now. Turn to another number for a new riddle.`,
          riddle.icon,
          "Yes",
        ),
      ],
    );
  });
}

export function getKidCard(id: string): KidCard | undefined {
  return KID_CARDS.find((card) => card.id === id);
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
          trackUrl: track.text,
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
