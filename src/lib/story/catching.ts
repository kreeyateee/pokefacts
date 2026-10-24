/**
 * Catch Quest: battle wild Pokémon, then catch them. Ranger Fern walks you and a team of three (your
 * favourite Pokémon, Pikachu without one, and two friends) along Route One. Each time a wild Pokémon
 * jumps out, you choose which of two of your team to send out first. Pick the type that is strong
 * against it and the battle is quick; pick the other and it tries its best, then you swap. Either way
 * the battle ends with a Poké Ball and a catch, and the wild Pokémon's fact. How many you pick right
 * first time chooses the ending.
 */
import { mulberry32 } from "@/lib/kid-cards";
import type { AdventureInput } from "@/lib/story/adventure-route";
import { strongReason, weakReason } from "@/lib/story/gym-words";
import { DEFAULT_PARTNER, partnerType } from "@/lib/story/lost";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import type { StoryAmbience, StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";
import { effectiveness, type PokemonType } from "@/lib/type-chart";
import { YOTO_ICONS } from "@/lib/yoto-icons";

/** Wild Pokémon met on the way. */
export const CATCH_ROUNDS = 5;

/** First-time picks are counted up to this. Four or more is a Type Master. */
const MOST_RIGHT = 4;

export const CATCH_ENDINGS = ["Off to a Good Start", "Super Catcher", "Type Master"] as const;

export const CATCH_CAST: StoryCharacter[] = [
  // Aurelia's voices: a calm, kind ranger.
  { id: "fern", name: "Fern", pronoun: "she", voices: ["XrExE9yKIg1WjnnlVkGX", "Xb7hH8MSUJpSbSDYk0k2"], tempo: 1, piper: { pitch: -1.5, tempo: 1 }, mood: "cheerfully" },
];

export type TeamMon = { id: number; name: string; type: PokemonType };

/** Friends who join your favourite on the team: one of each attacking type. */
const COMPANIONS: readonly TeamMon[] = [
  { id: 1, name: "Bulbasaur", type: "Grass" },
  { id: 4, name: "Charmander", type: "Fire" },
  { id: 7, name: "Squirtle", type: "Water" },
  { id: 25, name: "Pikachu", type: "Electric" },
  { id: 66, name: "Machop", type: "Fighting" },
  { id: 27, name: "Sandshrew", type: "Ground" },
];

export type WildMon = {
  id: number;
  name: string;
  types: PokemonType[];
  /** Where it jumps out, and the sound there. */
  where: string;
  at: StoryAmbience;
  fact: string;
};

const WILD: readonly WildMon[] = [
  { id: 19, name: "Rattata", types: ["Normal"], where: "in the long grass", at: "grass", fact: "Rattata's teeth never stop growing, so it chews all the time." },
  { id: 16, name: "Pidgey", types: ["Normal", "Flying"], where: "in the long grass", at: "grass", fact: "Pidgey would rather hide in the grass than fight." },
  { id: 10, name: "Caterpie", types: ["Bug"], where: "under the trees", at: "woods", fact: "Caterpie's red antenna makes a smell that keeps birds away." },
  { id: 13, name: "Weedle", types: ["Bug", "Poison"], where: "under the trees", at: "woods", fact: "Weedle has a sharp stinger on top of its head." },
  { id: 43, name: "Oddish", types: ["Grass", "Poison"], where: "in the long grass", at: "grass", fact: "Oddish hides in the ground all day and walks about at night." },
  { id: 69, name: "Bellsprout", types: ["Grass", "Poison"], where: "under the trees", at: "woods", fact: "Bellsprout's thin body bends like a plant stem in the wind." },
  { id: 74, name: "Geodude", types: ["Rock", "Ground"], where: "on the mountain path", at: "mountain", fact: "People often walk past Geodude, because it looks just like a rock." },
  { id: 95, name: "Onix", types: ["Rock", "Ground"], where: "in a dark cave", at: "cave", fact: "Onix tunnels through the ground at great speed." },
  { id: 41, name: "Zubat", types: ["Poison", "Flying"], where: "in a dark cave", at: "cave", fact: "Zubat has no eyes. It finds its way using sound." },
  { id: 54, name: "Psyduck", types: ["Water"], where: "by the lake", at: "lake", fact: "Psyduck always has a headache. Its powers work best when its head hurts most." },
  { id: 60, name: "Poliwag", types: ["Water"], where: "by the lake", at: "lake", fact: "The swirl on Poliwag's tummy is its insides, showing through its skin." },
  { id: 129, name: "Magikarp", types: ["Water"], where: "by the lake", at: "lake", fact: "Magikarp isn't very strong, but it is very good at splashing." },
  { id: 58, name: "Growlithe", types: ["Fire"], where: "in the rocky canyon", at: "canyon", fact: "Growlithe is very loyal, and guards its trainer bravely." },
  { id: 77, name: "Ponyta", types: ["Fire"], where: "in the rocky canyon", at: "canyon", fact: "Ponyta's mane is made of fire, but it never burns its friends." },
  { id: 37, name: "Vulpix", types: ["Fire"], where: "in the rocky canyon", at: "canyon", fact: "Vulpix is born with one white tail. It grows six as it gets older." },
  { id: 50, name: "Diglett", types: ["Ground"], where: "in the rocky canyon", at: "canyon", fact: "Diglett lives underground and digs tunnels through the soil." },
  { id: 81, name: "Magnemite", types: ["Electric", "Steel"], where: "by the old power station", at: "canyon", fact: "Magnemite floats in the air using magnets." },
  { id: 100, name: "Voltorb", types: ["Electric"], where: "by the old power station", at: "canyon", fact: "Voltorb looks just like a Poké Ball. Some people try to pick it up." },
  { id: 163, name: "Hoothoot", types: ["Normal", "Flying"], where: "under the trees", at: "woods", fact: "Hoothoot always stands on one foot, and swaps feet very quickly." },
  { id: 167, name: "Spinarak", types: ["Bug", "Poison"], where: "under the trees", at: "woods", fact: "Spinarak spins strong webs and waits very patiently." },
  { id: 361, name: "Snorunt", types: ["Ice"], where: "on the snowy hill", at: "mountain", fact: "Snorunt lives in snowy places and loves the cold." },
  { id: 220, name: "Swinub", types: ["Ice", "Ground"], where: "on the snowy hill", at: "mountain", fact: "Swinub sniffs out food buried deep under the snow." },
  { id: 396, name: "Starly", types: ["Normal", "Flying"], where: "in the long grass", at: "grass", fact: "Starly fly together in big, noisy flocks." },
  { id: 403, name: "Shinx", types: ["Electric"], where: "in the long grass", at: "grass", fact: "Shinx's fur glows when it senses danger." },
  { id: 399, name: "Bidoof", types: ["Normal"], where: "by the lake", at: "lake", fact: "Bidoof is very calm. Nothing much bothers it." },
  { id: 278, name: "Wingull", types: ["Water", "Flying"], where: "down on the beach", at: "sea", fact: "Wingull rides the wind high over the sea." },
  { id: 299, name: "Nosepass", types: ["Rock"], where: "in a dark cave", at: "cave", fact: "Nosepass's nose is a magnet. It always points north." },
  { id: 52, name: "Meowth", types: ["Normal"], where: "by the old power station", at: "canyon", fact: "Meowth loves shiny coins, and picks up every one it finds." },
  { id: 79, name: "Slowpoke", types: ["Water", "Psychic"], where: "down on the beach", at: "sea", fact: "Slowpoke is so slow, it takes a while to notice anything at all." },
];

export type CatchRound = {
  wild: WildMon;
  /** Strong against the wild Pokémon. */
  right: TeamMon;
  /** Not strong against it. */
  wrong: TeamMon;
  /** The right one is the left button. */
  rightLeft: boolean;
};

export type CatchPlan = {
  seed: number;
  owner: string;
  team: TeamMon[];
  rounds: CatchRound[];
};

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap] as T, out[index] as T];
  }
  return out;
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("Nothing to pick from.");
  return item;
}

export function planCatch(input: AdventureInput): CatchPlan {
  const random = mulberry32((input.seed ^ 0xca7c) >>> 0);
  const partner = input.partner ?? DEFAULT_PARTNER;
  const mine: TeamMon = { ...partner, type: partnerType(partner.id) };
  const friends = shuffled(
    COMPANIONS.filter((mon) => mon.id !== mine.id && mon.type !== mine.type),
    random,
  ).slice(0, 2);
  const team = [mine, ...friends];
  const onTeam = new Set(team.map((mon) => mon.id));
  const rounds: CatchRound[] = [];
  for (const wild of shuffled(WILD, random)) {
    if (rounds.length === CATCH_ROUNDS) break;
    if (onTeam.has(wild.id)) continue;
    const rights = team.filter((mon) => effectiveness(mon.type, wild.types) >= 2);
    const wrongs = team.filter((mon) => effectiveness(mon.type, wild.types) < 2);
    if (rights.length === 0 || wrongs.length === 0) continue;
    // The child's own favourite gets the win whenever it can.
    const right = rights.includes(mine) && random() < 0.7 ? mine : pick(rights, random);
    rounds.push({ wild, right, wrong: pick(wrongs, random), rightLeft: random() < 0.5 });
  }
  if (rounds.length < CATCH_ROUNDS) throw new Error("There are not enough wild Pokémon for this team.");
  return { seed: input.seed, owner: input.owner ?? "", team, rounds };
}

/** The defending type an attack is strong against, for the reason. */
function strongAgainst(attack: PokemonType, wild: WildMon): PokemonType {
  return wild.types.find((type) => effectiveness(attack, [type]) >= 2) ?? (wild.types[0] as PokemonType);
}

/** Why an attack does not do much: the type that blocks it, or a plain "it isn't strong". */
function whyNot(attack: PokemonType, wild: WildMon): string {
  const blocker = wild.types.find((type) => effectiveness(attack, [type]) < 1);
  return blocker ? weakReason(attack, blocker) : `${attack} isn't strong against ${wild.types.join(" and ")} types.`;
}

const id = {
  round: (round: number, right: number) => (round === 0 ? "start" : `r${round}c${right}`),
  yes: (round: number, right: number) => `r${round}c${right}y`,
  no: (round: number, right: number) => `r${round}c${right}n`,
  caught: (round: number, right: number) => `r${round}k${right}`,
  ending: (number: number) => `end${number}`,
};

function endingFor(right: number): number {
  return right <= 2 ? 1 : right === 3 ? 2 : 3;
}

const APPEARS = ["Rustle, rustle!", "Something moves!", "Look out!", "What's that?", "Over there!", "Shh, listen!"];
const SEND = ["Go", "You can do it", "Your turn", "Off you go", "Let's go", "Show them"];
const PRAISE = ["Great choice!", "Spot on!", "Brilliant!", "Just right!", "Well picked!", "Perfect!"];
const SWAP = ["Good try!", "Nice effort!", "Never mind!", "That's how we learn!", "Almost!", "Good thinking!"];

/** Turns a plan into the route. Pure: the same plan always gives the same story. */
export function buildCatch(plan: CatchPlan): StoryGraph {
  const owner = plan.owner.trim();
  const you = owner || "Trainer";
  const [mine, ...friends] = plan.team as [TeamMon, ...TeamMon[]];
  const nodes: StoryNode[] = [];
  const opening = `[cry:${mine.id}] You and ${mine.name} meet Ranger Fern at the start of Route One. [footsteps] '{cheerfully} Hello, ${you}! Today we battle wild Pokémon, then catch them. Your team is ${mine.name}, ${friends.map((mon) => mon.name).join(" and ")}. Pick who goes out first. Choose a type that's strong against the wild one!'`;

  plan.rounds.forEach((round, number) => {
    const { wild, right, wrong } = round;
    const last = number === CATCH_ROUNDS - 1;
    const bed: StoryBed = { ambience: wild.at, music: "adventure" };
    const fight: StoryBed = { ambience: wild.at, music: "battle" };
    const types = wild.types.join(" and ");
    const rightChoice = (count: number) => ({ to: id.yes(number, count), label: `send out ${right.name}` });
    const wrongChoice = (count: number) => ({ to: id.no(number, count), label: `send out ${wrong.name}` });
    for (let count = 0; count <= Math.min(number, MOST_RIGHT); count += 1) {
      const more = Math.min(count + 1, MOST_RIGHT);
      const meet = `[footsteps] You walk on, ${wild.where}. ${APPEARS[number] ?? "Look out!"} [cry:${wild.id}] A wild ${wild.name} jumps out! ${wild.name} is ${/^[AEIOU]/.test(types) ? "an" : "a"} ${types} type. Fern whispers. '{whispers} Who will you send out first?'`;
      nodes.push({
        id: id.round(number, count),
        kind: "choice",
        title: `A Wild ${wild.name}`,
        icon: { dexId: wild.id },
        bed,
        text: number === 0 ? `${opening} ${meet}` : meet,
        left: round.rightLeft ? rightChoice(count) : wrongChoice(count),
        right: round.rightLeft ? wrongChoice(count) : rightChoice(count),
      });
      nodes.push({
        id: id.yes(number, count),
        kind: "scene",
        title: `${right.name} Battles ${wild.name}`,
        icon: { dexId: right.id, attack: true },
        bed: fight,
        text: `'${SEND[number] ?? "Go"}, ${right.name}!' [cry:${right.id}] ${right.name} uses a ${right.type} move. [hit] It's super effective! ${strongReason(right.type, strongAgainst(right.type, wild))} Fern cheers. '{excited} ${PRAISE[number] ?? "Great choice!"} ${wild.name} is tired. Throw your Poké Ball!'`,
        next: id.caught(number, more),
      });
      nodes.push({
        id: id.no(number, count),
        kind: "scene",
        title: `${wrong.name} Gives It a Go`,
        icon: { dexId: right.id, attack: true },
        bed: fight,
        text: `'${SEND[number] ?? "Go"}, ${wrong.name}!' [cry:${wrong.id}] ${wrong.name} tries its best, but ${wild.name} just shakes it off. ${whyNot(wrong.type, wild)} Fern smiles. '${SWAP[number] ?? "Good try!"} Swap to ${right.name}. ${right.type} is strong against ${wild.name}.' [cry:${right.id}] ${right.name} jumps in. [hit] ${strongReason(right.type, strongAgainst(right.type, wild))} '${wild.name} is tired. Throw your Poké Ball!'`,
        next: id.caught(number, count),
      });
    }
    // One catch track for each count, so both choices share it.
    for (let count = 0; count <= Math.min(number + 1, MOST_RIGHT); count += 1) {
      if (nodes.some((node) => node.id === id.caught(number, count))) continue;
      const after = last
        ? `Fern looks at the sky. '{proudly} What a day. Time to head home, ${you}.'`
        : number === 1
          ? `Fern hands round some berries. '{cheerfully} Halfway there! Snack time.' Munch, munch.`
          : "";
      nodes.push({
        id: id.caught(number, count),
        kind: "scene",
        title: `${wild.name} Caught!`,
        icon: { pixel: "pokeball-caught" },
        bed,
        text: `[throw] Wobble, wobble, wobble. [catch] Click! You caught ${wild.name}! [cheer] Fern grins. '{excited} Got it! Did you know? ${wild.fact}'${after ? ` ${after}` : ""}`,
        next: last ? id.ending(endingFor(count)) : id.round(number + 1, count),
      });
    }
  });

  const caught = plan.rounds.map((round) => round.wild);
  const endings = [
    `[footsteps] Back at the ranger hut, Fern counts your Poké Balls. Five new friends! [cry:${caught[0]?.id ?? mine.id}] '{cheerfully} You caught them all, ${you}. Next time, think about types first. You'll be brilliant.' [ending]`,
    `[footsteps] Back at the ranger hut, Fern counts your Poké Balls. Five new friends! [cry:${caught[1]?.id ?? mine.id}] [badge] She gives you a shiny Catcher Badge. '{proudly} Super catching, ${you}! You know your types.' [ending]`,
    `[footsteps] Back at the ranger hut, Fern counts your Poké Balls. Five new friends! [badge] [fanfare] '{excited} Wow! You picked the strong type nearly every time. You're a Type Master, ${you}!' [cry:${mine.id}] ${mine.name} jumps for joy. [golden]`,
  ];
  endings.forEach((text, index) => {
    const number = index + 1;
    const golden = number === 3;
    nodes.push({
      id: id.ending(number),
      kind: "ending",
      title: `Ending ${number}: ${CATCH_ENDINGS[index]}`,
      icon: golden ? { yoto: YOTO_ICONS.celebrate } : { dexId: mine.id },
      bed: { ambience: "house", music: golden ? "magical" : "homely" },
      text,
      ending: { number, name: CATCH_ENDINGS[index] as string, ...(golden ? { golden: true } : {}) },
    });
  });

  return {
    id: `catch-${plan.seed}`,
    title: "Catch Quest",
    description: `Battle five wild Pokémon with ${mine.name} and friends, pick the right type to send out first, then catch them all.`,
    start: "start",
    nodes,
    cast: CATCH_CAST,
    slots: [...plan.team.map((mon) => mon.name), ...plan.rounds.map((round) => round.wild.name), ...(owner ? [owner] : [])],
    battles: true,
  };
}

export function catchAdventure(input: AdventureInput): StoryGraph {
  return buildCatch(planCatch(input));
}
