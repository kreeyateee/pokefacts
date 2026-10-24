/**
 * Friendly Battles: an adventure for younger children, about three to five. Your favourite Pokémon (Pikachu
 * without one) and you visit the Play Park, where six friendly Pokémon come to play. Each time, you choose:
 * use your partner's power, or do a silly dance. Both are right. Nobody loses: a power move makes your new
 * friend spin round and laugh, and a dance makes everyone giggle. How you played picks the happy ending.
 *
 * Sentences are short, there are sounds everywhere, and the first question comes in a few seconds.
 */
import { mulberry32 } from "@/lib/kid-cards";
import type { AdventureInput } from "@/lib/story/adventure-route";
import { DEFAULT_PARTNER, partnerType } from "@/lib/story/lost";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import type { StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";
import type { PokemonType } from "@/lib/type-chart";
import { YOTO_ICONS } from "@/lib/yoto-icons";

/** Rounds in a play day. */
export const PLAY_ROUNDS = 6;

/** Power moves are counted up to this. Three or more is a battle star day. */
const MOST_POWERS = 3;

export const PLAY_ENDINGS = ["Dance Party", "Best of Both", "Super Star"] as const;

export const PLAY_CAST: StoryCharacter[] = [
  // Jessica, then Laura: the park keeper, warm and bubbly.
  { id: "rosie", name: "Rosie", pronoun: "she", voices: ["cgSgspJ2msm6clMCkdW9", "FGY2WhTYpPnrIDTdsKH5"], tempo: 0.98, piper: { pitch: 2.5, tempo: 1 }, mood: "cheerfully" },
];

/** Friendly Pokémon who come to play, with something they do. */
const FRIENDS = [
  { id: 54, name: "Psyduck", does: "Psyduck holds its head and quacks." },
  { id: 39, name: "Jigglypuff", does: "Jigglypuff puffs up like a balloon." },
  { id: 175, name: "Togepi", does: "Togepi wobbles in its shell." },
  { id: 172, name: "Pichu", does: "Pichu's cheeks go sparkle, sparkle." },
  { id: 1, name: "Bulbasaur", does: "Bulbasaur waves its vines." },
  { id: 7, name: "Squirtle", does: "Squirtle blows a bubble." },
  { id: 4, name: "Charmander", does: "Charmander wags its fiery tail." },
  { id: 133, name: "Eevee", does: "Eevee wags its fluffy tail." },
  { id: 393, name: "Piplup", does: "Piplup flaps its little wings." },
  { id: 258, name: "Mudkip", does: "Mudkip splashes in a puddle." },
  { id: 194, name: "Wooper", does: "Wooper smiles a great big smile." },
  { id: 143, name: "Snorlax", does: "Snorlax yawns a great big yawn." },
  { id: 216, name: "Teddiursa", does: "Teddiursa licks its honey paw." },
  { id: 183, name: "Marill", does: "Marill bounces on its bouncy tail." },
  { id: 915, name: "Lechonk", does: "Lechonk sniffs for snacks." },
  { id: 25, name: "Pikachu", does: "Pikachu goes pika, pika!" },
] as const;

/** The sound word for each type's power. */
const SOUND_WORD: Record<PokemonType, string> = {
  Normal: "Boing",
  Fire: "Whoosh",
  Water: "Splash",
  Electric: "Zap",
  Grass: "Swish",
  Ice: "Brrr",
  Fighting: "Hi-ya",
  Poison: "Blob",
  Ground: "Rumble",
  Flying: "Whoosh",
  Psychic: "Ping",
  Bug: "Buzz",
  Rock: "Bonk",
  Ghost: "Boo",
  Dragon: "Roar",
  Dark: "Boo",
  Steel: "Clang",
  Fairy: "Twinkle",
};

/** Where you play each round, by what the park has. */
const PLACES = ["by the slide", "on the swings", "in the sandpit", "by the duck pond", "on the bouncy hill", "under the big tree", "by the flower beds"];

/** What Rosie says after a power move, and after a dance. A different one each round. */
const CHEERS = ["Hooray!", "Well done!", "Wow!", "Brilliant!", "Super!", "Amazing!"];
const GIGGLES = ["What a dance!", "So silly!", "Wiggle, wiggle!", "Ha ha ha!", "Dance, dance, dance!", "Again, again!"];

/** A snack on the way, after round three. */
const SNACKS = ["a big red berry", "a slice of apple", "a crunchy biscuit", "a juicy pear"];

export type PlayPlan = {
  seed: number;
  owner: string;
  partner: { id: number; name: string };
  type: PokemonType;
  friends: Array<(typeof FRIENDS)[number]>;
  places: string[];
  /** For each round, whether the power move is the left button. */
  powerLeft: boolean[];
  snack: string;
};

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap] as T, out[index] as T];
  }
  return out;
}

export function planPlay(input: AdventureInput): PlayPlan {
  const random = mulberry32((input.seed ^ 0x9a7) >>> 0);
  const partner = input.partner ?? DEFAULT_PARTNER;
  return {
    seed: input.seed,
    owner: input.owner ?? "",
    partner,
    type: partnerType(partner.id),
    friends: shuffled(FRIENDS.filter((friend) => friend.id !== partner.id), random).slice(0, PLAY_ROUNDS),
    places: shuffled(PLACES, random).slice(0, PLAY_ROUNDS),
    powerLeft: Array.from({ length: PLAY_ROUNDS }, () => random() < 0.5),
    snack: SNACKS[Math.floor(random() * SNACKS.length)] as string,
  };
}

const id = {
  round: (round: number, powers: number) => (round === 0 ? "start" : `r${round}p${powers}`),
  power: (round: number, powers: number) => `r${round}p${powers}z`,
  dance: (round: number, powers: number) => `r${round}p${powers}d`,
  ending: (number: number) => `end${number}`,
};

function endingFor(powers: number): number {
  return powers <= 1 ? 1 : powers === 2 ? 2 : 3;
}

/** Turns a plan into the play day. Pure: the same plan always gives the same story. */
export function buildPlay(plan: PlayPlan): StoryGraph {
  const { partner, type } = plan;
  const P = partner.name;
  const owner = plan.owner.trim();
  const you = owner || "friend";
  const word = SOUND_WORD[type];
  const nodes: StoryNode[] = [];
  const bed: StoryBed = { ambience: "grass", music: "bright" };
  const opening = `Hello! [cry:${partner.id}] You and ${P} are at the Play Park. [footsteps] Rosie waves. 'Hello, ${you}! Lots of Pokémon want to play today. Let's play battle!'`;

  for (let round = 0; round < PLAY_ROUNDS; round += 1) {
    const friend = plan.friends[round] as (typeof FRIENDS)[number];
    const place = plan.places[round] as string;
    const last = round === PLAY_ROUNDS - 1;
    for (let powers = 0; powers <= Math.min(round, MOST_POWERS); powers += 1) {
      const more = Math.min(powers + 1, MOST_POWERS);
      const meet = `[footsteps] Look, ${place}! [cry:${friend.id}] It's ${friend.name}! ${friend.does} ${friend.name} wants to play. Rosie smiles. 'What will ${P} do?'`;
      const power = { to: id.power(round, powers), label: `use ${P}'s ${type} power` };
      const dance = { to: id.dance(round, powers), label: "do a silly dance" };
      const left = plan.powerLeft[round] as boolean;
      nodes.push({
        id: id.round(round, powers),
        kind: "choice",
        title: `${friend.name} Wants to Play`,
        icon: { dexId: friend.id },
        bed,
        text: round === 0 ? `${opening} ${meet}` : meet,
        left: left ? power : dance,
        right: left ? dance : power,
      });
      // A snack after round three, and a song after round five: little treats on the way.
      const snack =
        round === 2
          ? ` Snack time! Everyone shares ${plan.snack}. Munch, munch.`
          : round === 4
            ? " Then everyone sings the Play Park song. La la la! [cheer]"
            : "";
      nodes.push({
        id: id.power(round, powers),
        kind: "scene",
        title: `${friend.name}: ${word}!`,
        icon: { dexId: partner.id },
        bed,
        text: `${P} uses ${type} power. [hit] ${word}! ${friend.name} spins round and round. Then it laughs. [cheer] Rosie claps. '${CHEERS[round] ?? "Hooray!"} Well played, ${P}!'${snack}`,
        next: last ? id.ending(endingFor(more)) : id.round(round + 1, more),
      });
      nodes.push({
        id: id.dance(round, powers),
        kind: "scene",
        title: `${friend.name}: A Silly Dance`,
        icon: { dexId: friend.id },
        bed,
        text: `${P} does a silly dance. Wiggle, wiggle! ${friend.name} does a silly dance too. [cry:${friend.id}] Everyone giggles. [cheer] Rosie laughs. '{laughs} ${GIGGLES[round] ?? "So silly!"}'${snack}`,
        next: last ? id.ending(endingFor(powers)) : id.round(round + 1, powers),
      });
    }
  }

  const friendCries = plan.friends.map((friend) => `[cry:${friend.id}]`).slice(0, 3).join(" ");
  const endings = [
    `The sun goes down. All your new friends have a dance party. ${friendCries} [cheer] Rosie gives ${P} a shiny dancing star. 'You were brilliant!' Bye bye, Play Park. [ending]`,
    `The sun goes down. Rosie has two stars. One for dancing. One for battling. [badge] They are both for ${P}! [cry:${partner.id}] [cheer] 'You did everything!' Bye bye, Play Park. [golden]`,
    `The sun goes down. Rosie pins a shiny badge on ${P}. [badge] [fanfare] 'Super star!' All your new friends cheer. ${friendCries} [cheer] Bye bye, Play Park. [ending]`,
  ];
  endings.forEach((text, index) => {
    const number = index + 1;
    const golden = number === 2;
    nodes.push({
      id: id.ending(number),
      kind: "ending",
      title: `Ending ${number}: ${PLAY_ENDINGS[index]}`,
      icon: golden ? { yoto: YOTO_ICONS.celebrate } : { dexId: partner.id },
      bed: { ambience: "grass", music: golden ? "magical" : "homely" },
      text,
      ending: { number, name: PLAY_ENDINGS[index] as string, ...(golden ? { golden: true } : {}) },
    });
  });

  return {
    id: `play-${plan.seed}`,
    title: "Friendly Battles",
    description: `${P} and you play with six friendly Pokémon at the Play Park. Nobody loses: every choice is a happy one.`,
    start: "start",
    nodes,
    cast: PLAY_CAST,
    slots: [P, ...(owner ? [owner] : [])],
    // The page shows each friend as its animated battle sprite.
    battles: true,
  };
}

export function playAdventure(input: AdventureInput): StoryGraph {
  return buildPlay(planPlay(input));
}
