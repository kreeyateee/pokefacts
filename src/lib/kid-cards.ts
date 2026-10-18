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
            `Number 1. The flower. Bulbasaur is born with a seed already on its back. The seed soaks up sunlight, and it grows as Bulbasaur grows. It is Grass and Poison, 0.7 metres tall and 6.9 kilograms. At level 16 it becomes Ivysaur. At level 32 the seed opens into the flower on Venusaur. ${MEET_END}`,
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
            `Number 2. The flame. The flame on Charmander's tail is a sign of its health. A tall, bright flame means Charmander is well. A low flame means it needs rest. It is a Fire type, 0.6 metres tall and 8.5 kilograms. At level 16 it becomes Charmeleon. At level 36, Charizard. ${MEET_END}`,
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
            `Number 3. The fish, for the water. Squirtle pulls its whole body into its shell, then fires a jet of water from the gap. The shell hardens as it grows. It is a Water type, 0.5 metres tall and 9 kilograms. At level 36 that shell carries the cannons of Blastoise. ${MEET_END}`,
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
            `Number 4. The sun. Pikachu keeps electricity in the red pouches on its cheeks. One is small, 0.4 metres tall and 6 kilograms. When a group of Pikachu gathers, their charge can build until it causes a lightning storm. A Thunder Stone evolves Pikachu into Raichu. ${MEET_END}`,
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
            `Number 5. The dog, for the coat and the ears. Eevee is a Normal type, 0.3 metres tall and 6.5 kilograms, and its body can evolve eight ways. A Water Stone makes Vaporeon. A Thunder Stone, Jolteon. A Fire Stone, Flareon. Friendship by day, Espeon. Friendship at night, Umbreon. A Leaf Stone, Leafeon. An Ice Stone, Glaceon. Friendship and a Fairy move, Sylveon. ${MEET_END}`,
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
            `Number 6. The music note. Jigglypuff's song puts listeners to sleep in moments. Drop off before the song ends and it puffs up and scribbles on their faces with a marker. It is Normal and Fairy, 0.5 metres tall and 5.5 kilograms. A Moon Stone evolves it into Wigglytuff. ${MEET_END}`,
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
            `Number 7. The bear. Once Snorlax falls asleep in the road, it will not budge. It wakes to eat, and it is not satisfied unless it eats at least 400 kilograms of food in a day. It is a Normal type, 2.1 metres tall and 460 kilograms. It evolves from Munchlax through friendship. ${MEET_END}`,
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
            `Number 8. The ghost. Gengar hides in a person's shadow and chills the air around them. Step into a cold patch of shade and it may be standing there too. It is Ghost and Poison, 1.5 metres tall and 40.5 kilograms. Haunter becomes Gengar only when traded. ${MEET_END}`,
            I.ghost,
            "8",
          ),
        ],
      ),
      picture(
        "wailord",
        "Wailord",
        "9",
        "a wave",
        "〰",
        I.wave,
        [
          talk(
            "fact",
            "Wailord",
            `Number 9. The wave. Wailord is 14.5 metres long. A humpback whale that long weighs about 30,000 kilograms. Wailord weighs 398 kilograms. It is still a Water type that hunts in a pod, herds fish, and swallows them in one gulp. On one breath it can dive about 3,000 metres. It evolves from Wailmer at level 40. You can turn back to any number and hear it again.`,
            I.wave,
            "9",
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
        "It is Pikachu. A group of them can build enough charge to start a lightning storm. 0.4 metres tall, and 6 kilograms.",
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
        "It is Bulbasaur. The seed is on its back from the day it is born, and sunlight makes it grow. 0.7 metres tall, and 6.9 kilograms.",
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
        "I am a Normal type, 2.1 metres tall. I fall asleep in the road. I need at least 400 kilograms of food every day.",
      answer:
        "It is Snorlax. It weighs 460 kilograms, and it evolves from Munchlax through friendship.",
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
        "It is Gengar. It steps into your shadow and chills the air. Haunter becomes Gengar by trade.",
      icon: I.ghost,
      picture: "a ghost",
      mark: "👻",
    },
    {
      key: "wailord",
      name: "Wailord",
      clues:
        "I am a Water type, 14.5 metres long, and I weigh only 398 kilograms. I hunt in a pod. On one breath I can dive about 3,000 metres.",
      answer:
        "It is Wailord. A humpback whale that long weighs about 30,000 kilograms. Wailord evolves from Wailmer at level 40.",
      icon: I.wave,
      picture: "a wave",
      mark: "〰",
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
