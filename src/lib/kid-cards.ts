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

const MEET_END = "Turn to a different picture when you want another one.";

export const KID_CARDS: KidCard[] = [
  {
    id: "meet",
    title: "Facts",
    libraryTitle: "Champdex: Pokémon Facts",
    recommended: true,
    blurb: "A short fact for each Pokémon.",
    childDoes:
      "They turn to a picture and press play. Each picture tells one Pokémon fact.",
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
            "Hi. This is your Pokémon card. Turn the wheel, or press the arrow buttons, until you see a picture. Then press the big button. I will tell you about that Pokémon. When you want a new one, turn to a different picture. The star is me. Number 1 is a good place to start.",
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
            `Number 1. The picture is a flower. This is Bulbasaur. Bulbasaur is green, with a big seed on its back. The seed likes sunshine. It drinks the light and grows as Bulbasaur grows. Bulbasaur is calm and likes to nap in the grass. If it stood next to you, it would reach about to your waist. One day that seed becomes a flower. ${MEET_END}`,
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
            `Number 2. The picture is a flame. This is Charmander. Charmander is an orange lizard with a flame on the tip of its tail. That flame is its power. When Charmander feels strong, the flame burns bright. It is small and warm, like a campfire you could hold in your arms. Be gentle with the tail. ${MEET_END}`,
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
            `Number 3. The picture is a fish, because this one loves water. This is Squirtle. Squirtle is a blue turtle. It can hide in its shell, and it can shoot water. The shell is tough, like a helmet. Squirtle loves to swim. It is heavier than a cat, and lighter than you. ${MEET_END}`,
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
            `Number 4. The picture is a sun. This is Pikachu. Pikachu is yellow, with long ears and two red circles on its cheeks. Those cheeks are full of electricity, like a little battery. When Pikachu is surprised, sparks can jump. Pikachu is small enough to sit on your lap. It says its own name. Pikachu! ${MEET_END}`,
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
            `Number 5. The picture is a dog, because this one is fluffy with pointy ears. This is Eevee. Eevee is brown, with a big soft tail. It is curious, and it likes to watch people. Eevee is special. It can grow up in lots of different ways. A special stone, or a whole lot of kindness, can change what it becomes. ${MEET_END}`,
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
            `Number 6. The picture is a music note. This is Jigglypuff. Jigglypuff is round and pink, like a balloon that can sing. Its song is a lullaby, and people get sleepy. If you fall asleep before the song is finished, Jigglypuff gets grumpy and draws on your face with a marker. Try to clap until the end. ${MEET_END}`,
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
            `Number 7. The picture is a bear. This is Snorlax. Snorlax is giant and very sleepy. It naps in the middle of the road, and it will not budge. Food is the trick. Snorlax wakes up to eat, and then it wants to sleep again. It is taller than a door, and it weighs about as much as six grown-ups. ${MEET_END}`,
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
            "Number 8. The picture is a ghost. This is Gengar. Gengar floats, and it loves to giggle and hide. On a dark night it might slip into your shadow and follow your feet. It is naughty, like a friend who jumps out and says boo. It is not a monster from a scary movie. You know eight Pokémon now. You can turn back to any picture and hear it again.",
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
    blurb: "Three clues. Guess the Pokémon. Then hear if you were right.",
    childDoes:
      "They pick a number, hear three clues, and shout a name. They wait through the count. The answer plays next, and the picture on the player changes.",
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
            "This card is a guessing game. Turn the wheel, or press the arrows, until you see a number. Then press the big button. I will give you three clues. Shout the Pokémon's name if you know it. Then wait. I count to three, and the answer plays next. The picture changes when I say the name. Start at number 1.",
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
      clues: "I am yellow. I have long ears. My cheeks are full of electricity.",
      answer:
        "It is Pikachu. Pikachu is small enough to sit on your lap. A surprise can make sparks jump from those red cheeks.",
      icon: I.sun,
      picture: "a sun",
      mark: "☀",
    },
    {
      key: "bulbasaur",
      name: "Bulbasaur",
      clues: "I am green. I carry a seed on my back. One day that seed becomes a flower.",
      answer:
        "It is Bulbasaur. Bulbasaur naps in the grass, and the seed on its back drinks the sunshine.",
      icon: I.daisy,
      picture: "a flower",
      mark: "❀",
    },
    {
      key: "charmander",
      name: "Charmander",
      clues: "I am an orange lizard. I have a flame on my tail. The flame shows how strong I feel.",
      answer:
        "It is Charmander. Be gentle with that tail. The flame is Charmander's power.",
      icon: I.fire,
      picture: "a flame",
      mark: "🔥",
    },
    {
      key: "snorlax",
      name: "Snorlax",
      clues: "I am giant. I fall asleep in the road. I wake up if you bring food.",
      answer:
        "It is Snorlax. Snorlax is taller than a door and weighs about as much as six grown-ups.",
      icon: I.bear,
      picture: "a bear",
      mark: "🐻",
    },
    {
      key: "squirtle",
      name: "Squirtle",
      clues: "I am blue. I hide in a shell. I shoot water, and I love to swim.",
      answer:
        "It is Squirtle. Squirtle's shell is tough, like a helmet, and it is heavier than a cat.",
      icon: I.fish,
      picture: "a fish",
      mark: "🐟",
    },
    {
      key: "jigglypuff",
      name: "Jigglypuff",
      clues: "I am round and pink. I sing a lullaby. If you fall asleep too soon, I draw on your face.",
      answer:
        "It is Jigglypuff. Clap until the song is over, or you might wake up with marker on your cheeks.",
      icon: I.music,
      picture: "a music note",
      mark: "♪",
    },
    {
      key: "eevee",
      name: "Eevee",
      clues: "I am brown and fluffy. I have a big soft tail. I can grow up in lots of different ways.",
      answer:
        "It is Eevee. A special stone, or a lot of kindness, can change what Eevee becomes.",
      icon: I.dog,
      picture: "a dog",
      mark: "🐶",
    },
    {
      key: "gengar",
      name: "Gengar",
      clues: "I float. I giggle and hide. On a dark night I might follow you inside your own shadow.",
      answer:
        "It is Gengar. Gengar likes to say boo. It is naughty, not a monster from a scary movie.",
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
      description: `${card.blurb} Made for a child to play on a Yoto player with one Make Your Own card.`,
    },
  };
  if (cardId) content.cardId = cardId;
  return content;
}
