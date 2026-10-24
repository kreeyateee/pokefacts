/**
 * Find Your Trainer: the child plays their own partner Pokémon, lost in a dungeon and finding the way back
 * to their trainer, who is the child (by name, or "your trainer").
 *
 * The dungeon comes from the partner's type: a Fire partner wakes in volcano tunnels, a Water one in a sea
 * grotto, and so on. Three floors, each with a choice of way (a clue always points to the trainer: their
 * voice, the smell of their sandwiches, their dropped cap) and an obstacle (a wild Pokémon your type beats,
 * something your power can clear, a sleeping giant to tiptoe past). At the bottom, a grumpy Pokémon that
 * needs help, not a fight. A wrong choice is funny and costs time, never the end: how much time decides
 * the reunion, and a good answer after a bad patch wins some back. Only a perfect run is golden, and then
 * the little guide who helped you comes home too.
 *
 * Most lines say "you", so the same words serve every partner of a type, and the partner's and child's
 * names are recorded on their own.
 */
import { getCatalogueEntry, listMonSheets, listSpecialSpecies } from "@/lib/catalogue-db";
import { jokesFor, toldBy, type Joke } from "@/lib/jokes";
import { mulberry32 } from "@/lib/kid-cards";
import type { AdventureInput, Partner } from "@/lib/story/adventure-route";
import { strongReason } from "@/lib/story/gym-words";
import type { StoryGraph, StoryIcon, StoryNode } from "@/lib/story/story-graph";
import type { StoryAmbience, StoryBed, StoryMusic } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";
import { effectiveness, isPokemonType, type PokemonType } from "@/lib/type-chart";
import { YOTO_ICONS } from "@/lib/yoto-icons";

/** With no favourite chosen, the child plays as Pikachu. */
export const DEFAULT_PARTNER: Partner = { id: 25, name: "Pikachu" };

/** How far behind you are: none, a bit, a lot. Two or more all count the same. */
export const MOST_SLIPS = 2;

export const LOST_ENDINGS = ["The Long Way Round", "Home by Moonlight", "Just in Time", "Best Friends"] as const;

/** A way on, as the label and the narration say it: "the glowing tunnel". */
type Ways = readonly [string, string];

/** A Pokémon in the dungeon, by its Pokédex number. */
type Mon = { id: number; name: string };

export type Theme = {
  key: string;
  /** The partner types that wake up here. */
  types: readonly PokemonType[];
  /** "the Ember Tunnels". */
  place: string;
  bed: { ambience: StoryAmbience; music: StoryMusic };
  /** How you and your trainer got separated, after "You and {trainer} were". */
  fall: string;
  /** The friendly little guide who helps you, and speaks with a voice of their own. */
  guide: Mon & { kind: string };
  /** Two ways on for each floor. The trainer's clue is always on one of them. */
  ways: readonly [Ways, Ways, Ways];
  /** What happens down the wrong way, floor by floor. It's funny, and it costs time. */
  wrong: readonly [string, string, string];
  /** Floor two's blockage, and what happens if you try to squeeze past instead. */
  block: { what: string; squeeze: string };
  /** Floor three: a big Pokémon asleep across the path. */
  sleeper: Mon;
  /** The bottom: a big grumpy Pokémon with a problem, and how you help. */
  boss: Mon & { trouble: string; help: string };
  /** Wild Pokémon types that live here, preferred for floor one when your type beats them. */
  wild: readonly PokemonType[];
};

export const THEMES: readonly Theme[] = [
  {
    key: "volcano",
    types: ["Fire"],
    place: "the Ember Tunnels",
    bed: { ambience: "canyon", music: "mysterious" },
    fall: "exploring the old volcano when the ground rumbled, and you tumbled down a hot, dark slope",
    guide: { id: 218, name: "Cinder", kind: "Slugma" },
    ways: [
      ["the glowing tunnel", "the steamy tunnel"],
      ["the lava bridge", "the narrow crack"],
      ["the warm stone stairs", "the black sand slide"],
    ],
    wrong: [
      "The steam is so thick that you walk straight into a wall. Twice.",
      "The crack gets narrower and narrower, until you're stuck, and Cinder has to push you out backwards.",
      "You slide all the way down the black sand. Then you have to climb all the way back up.",
    ],
    block: {
      what: "A heap of fallen boulders blocks the tunnel.",
      squeeze: "You squeeze into a tiny gap and get stuck. Cinder pushes. You pop out backwards. You'll have to use your power after all.",
    },
    sleeper: { id: 324, name: "Torkoal" },
    boss: { id: 323, name: "Camerupt", trouble: "it has a pebble stuck up its nose", help: "You gently wiggle the pebble loose. The Camerupt gives an enormous sneeze, and a puff of smoke, and smiles." },
    wild: ["Grass", "Bug", "Ice", "Steel"],
  },
  {
    key: "grotto",
    types: ["Water", "Ice"],
    place: "the Crystal Grotto",
    bed: { ambience: "lake", music: "mysterious" },
    fall: "paddling in the rock pools when a big wave swept you away, into a cave under the sea",
    guide: { id: 363, name: "Pip", kind: "Spheal" },
    ways: [
      ["the blue ice passage", "the dripping passage"],
      ["the stepping stones", "the frozen slide"],
      ["the humming tunnel", "the crystal tunnel"],
    ],
    wrong: [
      "Drips land on your head, plip, plop, plip, until you're soaked, and it's a dead end.",
      "You whizz down the frozen slide, round and round, and land in a snowdrift, upside down.",
      "The crystals are so shiny that you stop to look at yourself. For quite a long time.",
    ],
    block: {
      what: "A wall of packed snow blocks the passage.",
      squeeze: "You try to dig a tunnel with your paws. It falls in on your head. Pip laughs so much she rolls away.",
    },
    sleeper: { id: 365, name: "Walrein" },
    boss: { id: 87, name: "Dewgong", trouble: "its tail is stuck under a block of ice", help: "You push and push, and the ice slides free. The Dewgong swishes its tail and gives you a happy bark." },
    wild: ["Fire", "Rock", "Ground", "Grass", "Dragon", "Flying"],
  },
  {
    key: "wood",
    types: ["Grass", "Bug"],
    place: "the Tangled Wood",
    bed: { ambience: "woods", music: "mysterious" },
    fall: "chasing butterflies in the forest when you ran too far, and the trees closed in behind you",
    guide: { id: 43, name: "Sprout", kind: "Oddish" },
    ways: [
      ["the mossy path", "the thorny path"],
      ["the hollow log", "the muddy ditch"],
      ["the bright clearing", "the dark hollow"],
    ],
    wrong: [
      "The thorny path gets thornier and thornier, until you're wearing more prickles than fur.",
      "The muddy ditch goes squelch. Then squelch again. Then you lose a shoe, which is odd, because you don't wear shoes.",
      "In the dark hollow, you meet an owl who just keeps saying hoo. It's no help at all.",
    ],
    block: {
      what: "A wall of thorny brambles blocks the path.",
      squeeze: "You try to wriggle through the brambles. Now you're a very prickly ball. Sprout has to pick you out, one thorn at a time.",
    },
    sleeper: { id: 3, name: "Venusaur" },
    boss: { id: 127, name: "Pinsir", trouble: "a big twig is tangled in its horns", help: "You carefully untangle the twig. The Pinsir clacks its horns, very pleased, and steps aside." },
    wild: ["Water", "Ground", "Rock", "Grass", "Psychic", "Dark"],
  },
  {
    key: "plant",
    types: ["Electric", "Steel"],
    place: "the Old Power Plant",
    bed: { ambience: "cave", music: "tense" },
    fall: "exploring an old power plant when a door slammed shut behind you, and the lights went out",
    guide: { id: 81, name: "Bolt", kind: "Magnemite" },
    ways: [
      ["the humming corridor", "the dusty corridor"],
      ["the metal stairs", "the rattly lift"],
      ["the blinking door", "the rusty door"],
    ],
    wrong: [
      "The dusty corridor is so dusty that you sneeze all the way to the end, and then all the way back.",
      "The rattly lift goes up. Then down. Then up again. Then it stops, exactly where it started.",
      "Behind the rusty door is a cupboard full of mops. One falls on your head.",
    ],
    block: {
      what: "A heap of broken machines blocks the corridor.",
      squeeze: "You try to climb over the machines. One of them goes beep, and you fall off in surprise.",
    },
    sleeper: { id: 466, name: "Electivire" },
    boss: { id: 208, name: "Steelix", trouble: "a loose bolt is rattling in its tail", help: "You tighten the loose bolt with a twist. The Steelix gives a happy clang and lifts its great head out of the way." },
    wild: ["Water", "Flying", "Ice", "Rock", "Fairy"],
  },
  {
    key: "tower",
    types: ["Ghost", "Dark", "Psychic"],
    place: "the Hollow Tower",
    bed: { ambience: "woods", music: "mysterious" },
    fall: "exploring an old tower at dusk when a gust of wind blew the door shut, and the stairs went round and round",
    guide: { id: 607, name: "Wick", kind: "Litwick" },
    ways: [
      ["the candlelit stairs", "the creaky stairs"],
      ["the painted hall", "the hall of mirrors"],
      ["the spiral steps", "the trapdoor"],
    ],
    wrong: [
      "Every step on the creaky stairs creaks louder than the last, until even the spiders are complaining.",
      "In the hall of mirrors, there are a hundred of you, and none of them know the way either.",
      "The trapdoor drops you into a pile of old curtains. You climb out wearing one.",
    ],
    block: {
      what: "A door covered in cobwebs won't open.",
      squeeze: "You try to squeeze under the door. Your tail gets stuck, and the cobwebs get into your ears.",
    },
    sleeper: { id: 94, name: "Gengar" },
    boss: { id: 429, name: "Mismagius", trouble: "it has lost its favourite hat", help: "You spot the hat on a high shelf, and fetch it down. The Mismagius puts it on, twirls, and floats aside." },
    wild: ["Ghost", "Psychic", "Fighting", "Poison", "Dark"],
  },
  {
    key: "mines",
    types: ["Rock", "Ground", "Fighting"],
    place: "the Deep Mines",
    bed: { ambience: "cave", music: "mysterious" },
    fall: "exploring an old mine when a rumble shook the roof, and you rolled down a long tunnel in the dark",
    guide: { id: 50, name: "Digby", kind: "Diglett" },
    ways: [
      ["the wide tunnel", "the low tunnel"],
      ["the wooden ladder", "the mine cart track"],
      ["the shiny seam", "the echoing shaft"],
    ],
    wrong: [
      "The low tunnel gets lower and lower, until you're crawling, and then it just stops.",
      "You hop in a mine cart. It whizzes off down the track, round a loop, and back to the start.",
      "You shout down the echoing shaft. It shouts back. You have a long chat with yourself.",
    ],
    block: {
      what: "A heap of fallen rocks blocks the tunnel.",
      squeeze: "You try to squeeze past the rocks. A pebble falls on your nose. Then another. Digby giggles.",
    },
    sleeper: { id: 76, name: "Golem" },
    boss: { id: 95, name: "Onix", trouble: "it has a bit of grit in its eye", help: "You blow the grit out of its eye, very gently. The Onix blinks, and blinks, and then curls aside with a happy rumble." },
    wild: ["Fire", "Ice", "Flying", "Bug", "Electric", "Steel", "Rock", "Normal", "Dark", "Poison"],
  },
  {
    key: "sky",
    types: ["Flying", "Dragon", "Fairy"],
    place: "the Sky Ruins",
    bed: { ambience: "mountain", music: "magical" },
    fall: "flying kites on a windy hill when a huge gust lifted you up, up, and onto an island floating in the clouds",
    guide: { id: 333, name: "Puff", kind: "Swablu" },
    ways: [
      ["the cloud bridge", "the broken arch"],
      ["the floating stones", "the windy ledge"],
      ["the shining gate", "the crumbly tower"],
    ],
    wrong: [
      "Under the broken arch, a pigeon is having its lunch, and it does not want company.",
      "On the windy ledge, the wind blows you round in a circle, and you end up exactly where you started.",
      "The crumbly tower crumbles a little bit more every time you sneeze, so you go back down very carefully.",
    ],
    block: {
      what: "A gap opens in the floating path, too wide to jump.",
      squeeze: "You try a big jump. It's not big enough. A cloud catches you, and puts you back, a bit damp.",
    },
    sleeper: { id: 149, name: "Dragonite" },
    boss: { id: 18, name: "Pidgeot", trouble: "the wind has blown its nest to pieces", help: "You gather the twigs, and help it build the nest again. The Pidgeot puffs out its chest, and spreads its wings aside." },
    wild: ["Grass", "Fighting", "Bug", "Dragon", "Dark"],
  },
  {
    key: "maze",
    types: ["Normal", "Poison"],
    place: "the Bramble Maze",
    bed: { ambience: "grass", music: "mysterious" },
    fall: "playing hide and seek in a garden when you hid so well that you got lost in a hedge maze",
    guide: { id: 819, name: "Nibbles", kind: "Skwovet" },
    ways: [
      ["the gravel path", "the grassy path"],
      ["the arch of roses", "the gap in the hedge"],
      ["the stepping stones", "the long way round"],
    ],
    wrong: [
      "The grassy path leads to a sundial, a bench, and nothing else. You sit on the bench for a bit.",
      "Through the gap in the hedge is another hedge. And another. You go back.",
      "The long way round is very, very long. You count every stone. There are a lot of stones.",
    ],
    block: {
      what: "A hedge as tall as a house blocks the path.",
      squeeze: "You try to push through the hedge. It pushes back. You land on your bottom, covered in leaves.",
    },
    sleeper: { id: 143, name: "Snorlax" },
    boss: { id: 24, name: "Arbok", trouble: "it has tied itself in a knot", help: "You find the end of its tail, and carefully undo the knot. The Arbok stretches out, very relieved, and slides aside." },
    wild: ["Grass", "Fairy", "Ghost", "Bug"],
  },
];

/** What each type's power looks like, for clearing the way. */
const POWER: Record<PokemonType, string> = {
  Normal: "a mighty tackle",
  Fire: "a burst of flame",
  Water: "a jet of water",
  Electric: "a crackle of lightning",
  Grass: "a whirl of sharp leaves",
  Ice: "a blast of icy wind",
  Fighting: "a mighty karate chop",
  Poison: "a splash of sticky goo",
  Ground: "a rumble of the ground",
  Flying: "a great gust of wind",
  Psychic: "a flash of mind power",
  Bug: "a buzzing swarm of energy",
  Rock: "a tumble of rocks",
  Ghost: "a swirl of spooky shadow",
  Dragon: "a dragon's roar",
  Dark: "a shadowy trick",
  Steel: "a clang of steel",
  Fairy: "a sparkle of fairy light",
};

/** The type a partner plays with: its first type, unless that's Normal and it has another (a Pidgey flies). */
export function partnerType(id: number): PokemonType {
  const types = (getCatalogueEntry(id)?.types ?? []).filter(isPokemonType);
  return types.find((type) => type !== "Normal") ?? types[0] ?? "Normal";
}

export function themeFor(type: PokemonType): Theme {
  return THEMES.find((theme) => theme.types.includes(type)) ?? (THEMES.at(-1) as Theme);
}

function an(word: string): string {
  return `${/^[AEIOU]/.test(word) ? "an" : "a"} ${word}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Wild = Mon & { types: string[] };

let wildPool: Wild[] | null = null;

function wilds(): Wild[] {
  if (!wildPool) {
    const special = listSpecialSpecies();
    wildPool = listMonSheets()
      .filter((sheet) => !special.has(sheet.id) && sheet.types.length > 0)
      .map((sheet) => ({ id: sheet.id, name: sheet.name.replace(/[.♀♂]/g, "").trim(), types: sheet.types }));
  }
  return wildPool;
}

/** A wild Pokémon your type hits hard, preferably one that lives here. Same seed, same Pokémon. */
function wildFor(type: PokemonType, theme: Theme, partnerId: number, random: () => number): Wild & { weak: string } {
  const sayable = (mon: Wild) => mon.id !== partnerId && /^[A-Za-z' -]+$/.test(mon.name);
  const strong = wilds().filter((mon) => sayable(mon) && effectiveness(type, mon.types) >= 2);
  const all = strong.length > 0 ? strong : wilds().filter((mon) => sayable(mon) && effectiveness(type, mon.types) === 1);
  const local = all.filter((mon) => mon.types.some((each) => (theme.wild as readonly string[]).includes(each)));
  const pool = local.length >= 4 ? local : all;
  const mon = pool[Math.floor(random() * pool.length)] ?? { id: 74, name: "Geodude", types: ["Rock", "Ground"] };
  const weak = mon.types.find((each) => isPokemonType(each) && effectiveness(type, [each]) >= 2) ?? mon.types[0] ?? "Normal";
  return { ...mon, weak };
}

/** What this adventure is made of: the partner, its type and dungeon, the wild Pokémon, and which side is right. */
export type LostPlan = {
  seed: number;
  owner: string;
  partner: Partner;
  type: PokemonType;
  genus: string;
  theme: Theme;
  wild: Wild & { weak: string };
  /** For each floor, whether the right way is the left button, then whether the right answer to the obstacle is. */
  wayLeft: [boolean, boolean, boolean];
  fixLeft: [boolean, boolean, boolean];
  bossLeft: boolean;
};

/** Stand-ins, for when the child's own partner is the very Pokémon that would play a part. */
const STAND_INS = {
  guide: { id: 427, name: "Bun", kind: "Buneary" },
  sleeper: { id: 289, name: "Slaking" },
  boss: { id: 217, name: "Ursaring", trouble: "it has a thorn in its paw", help: "You pull the thorn out, very gently. The Ursaring licks its paw, sighs, and shuffles aside." },
};

/** The theme, with anyone who is the partner swapped for a stand-in. */
function castAround(theme: Theme, partnerId: number): Theme {
  return {
    ...theme,
    guide: theme.guide.id === partnerId ? STAND_INS.guide : theme.guide,
    sleeper: theme.sleeper.id === partnerId ? STAND_INS.sleeper : theme.sleeper,
    boss: theme.boss.id === partnerId ? STAND_INS.boss : theme.boss,
  };
}

export function planLost(input: AdventureInput): LostPlan {
  const random = mulberry32((input.seed ^ 0x105b) >>> 0);
  const partner = input.partner ?? DEFAULT_PARTNER;
  const type = partnerType(partner.id);
  const theme = castAround(themeFor(type), partner.id);
  const genus = getCatalogueEntry(partner.id)?.genus ?? "Pokémon";
  const coin = () => random() < 0.5;
  return {
    seed: input.seed,
    owner: input.owner ?? "",
    partner,
    type,
    genus,
    theme,
    wild: wildFor(type, theme, partner.id, random),
    wayLeft: [coin(), coin(), coin()],
    fixLeft: [coin(), coin(), coin()],
    bossLeft: coin(),
  };
}

export const LOST_CAST = (guide: Mon, boss: Mon): StoryCharacter[] => [
  // Jessica, then Laura: small, bright and brave.
  { id: "guide", name: guide.name, voices: ["cgSgspJ2msm6clMCkdW9", "FGY2WhTYpPnrIDTdsKH5"], tempo: 1.06, piper: { pitch: 3, tempo: 1.1 } },
  // George, then Bill: big, grumbly and soft-hearted. Speaks as "the" Pokémon, so its name is its species.
  { id: "boss", name: boss.name, voices: ["JBFqnCBsd6RMkjVDRZzb", "pqHfZKP75CvOlQylNhV4"], tempo: 0.9, piper: { pitch: -4, tempo: 0.9 }, mood: "sighs" },
];

const id = {
  way: (floor: number, behind: number) => (floor === 1 && behind === 0 ? "start" : `f${floor}p${behind}`),
  wrong: (floor: number, behind: number) => `f${floor}w${behind}`,
  fix: (floor: number, behind: number) => `f${floor}o${behind}`,
  good: (floor: number, behind: number) => `f${floor}g${behind}`,
  bad: (floor: number, behind: number) => `f${floor}b${behind}`,
  boss: (behind: number) => `boss${behind}`,
  bossGood: (behind: number) => `boss${behind}g`,
  bossBad: (behind: number) => `boss${behind}b`,
  ending: (number: number) => `end${number}`,
};

/** A good answer after a bad patch wins one back. One stays: only a perfect run is golden. */
function caughtUp(behind: number): number {
  return behind >= 2 ? behind - 1 : behind;
}

/** The guide, after each obstacle, by how you're doing. */
function guideSays(guide: string, trainer: string, behind: number, slipped: boolean): string {
  if (slipped) {
    return behind >= MOST_SLIPS
      ? `${guide} looks worried. '{nervously} It's getting late. But we'll find ${trainer}.'`
      : `${guide} shrugs. 'Never mind. This way.'`;
  }
  return behind === 0 ? `${guide} beams. '{excited} You're so quick!'` : `${guide} smiles. 'That's more like it.'`;
}

/** The clue on each floor that tells you which way your trainer went. */
function clue(floor: number, way: string, trainer: string): string {
  if (floor === 1) return `From ${way}, very faintly, you hear ${trainer} calling your name.`;
  if (floor === 2) return `You sniff. Sandwiches! ${capital(trainer)}'s sandwiches. The smell is coming from ${way}.`;
  return `At the start of ${way}, you find something you know: ${trainer}'s cap, dropped on the ground.`;
}

/** Turns a plan into the dungeon. Pure: the same plan always gives the same story. */
export function buildLost(plan: LostPlan): StoryGraph {
  const { partner, type, theme, wild } = plan;
  const owner = plan.owner.trim();
  const trainer = owner || "your trainer";
  const guide = theme.guide.name;
  const boss = theme.boss;
  const nodes: StoryNode[] = [];
  const bed: StoryBed = theme.bed;
  const tense: StoryBed = { ...theme.bed, music: "tense" };
  const you: StoryIcon = { dexId: partner.id };
  const power = `use your ${type} power`;
  const jokes = jokesFor(mulberry32((plan.seed ^ 0x70e) >>> 0), [partner.id]);

  const opening = [
    `You are ${partner.name}, the ${plan.genus}. [cry:${partner.id}]`,
    `You and ${trainer} were ${theme.fall}.`,
    `[footsteps] Now you're alone, deep in ${theme.place}.`,
    `A little ${theme.guide.kind} called ${guide} peeks out at you. [cry:${theme.guide.id}] '{curious} Are you lost? I'll help you find your way.'`,
  ].join(" ");

  for (let floor = 1; floor <= 3; floor += 1) {
    const index = floor - 1;
    const [right, wrong] = theme.ways[index] as Ways;
    const wayLeft = plan.wayLeft[index] as boolean;
    // Floor one starts on time; by floor two you can already be two behind.
    for (let behind = 0; behind <= Math.min(2 * (floor - 1), MOST_SLIPS); behind += 1) {
      const later = Math.min(behind + 1, MOST_SLIPS);
      const ways = wayLeft ? `${right} and ${wrong}` : `${wrong} and ${right}`;
      const question = `Two ways lead on: ${ways}. ${clue(floor, right, trainer)}`;
      const toRight = { to: id.fix(floor, behind), label: `take ${right}` };
      const toWrong = { to: id.wrong(floor, behind), label: `take ${wrong}` };
      nodes.push({
        id: id.way(floor, behind),
        kind: "choice",
        title: `Floor ${floor}`,
        icon: floor === 1 && behind === 0 ? you : { dexId: theme.guide.id },
        bed,
        text: floor === 1 && behind === 0 ? `${opening} ${question}` : `[footsteps] Down you go, to floor ${["one", "two", "three"][index]}. ${question}`,
        left: wayLeft ? toRight : toWrong,
        right: wayLeft ? toWrong : toRight,
      });
      nodes.push({
        id: id.wrong(floor, behind),
        kind: "scene",
        title: `Floor ${floor}: Wrong Way`,
        icon: { dexId: theme.guide.id },
        bed,
        text: `${theme.wrong[index]} [fizzle] In the end, you find your way back, and take the other way.`,
        next: id.fix(floor, later),
      });
    }
  }

  // The obstacles. Each is reached at any lateness, whichever way you came.
  const fixes: Array<{
    title: string;
    icon: StoryIcon;
    text: string;
    labels: [string, string];
    good: string;
    bad: string;
  }> = [
    {
      title: "A Wild Pokémon",
      icon: { dexId: wild.id },
      text: `A wild ${wild.name} jumps out in front of you! [cry:${wild.id}] It's ${an(wild.types.join(" and "))} type, and it won't let you by. ${guide} leans in. '{whispers} You're ${an(type)} type. What will you do?'`,
      labels: [power, "run back the way you came"],
      good:
        effectiveness(type, wild.types) >= 2
          ? `You use your ${type} power. [hit] It's super effective! ${strongReason(type, wild.weak)} The ${wild.name} decides it has somewhere else to be.`
          : `You use your ${type} power, ${POWER[type]}. [hit] The ${wild.name} decides you're far too brave to argue with.`,
      bad: `You turn and run, and the ${wild.name} chases you round in a circle until you're both too dizzy to stand. [run] Then it wanders off.`,
    },
    {
      title: "The Way Is Blocked",
      icon: { dexId: theme.guide.id },
      text: `${theme.block.what} ${guide} looks at you. '{curious} You're strong. Could your power clear it?'`,
      labels: [power, "squeeze past"],
      good: `You use your ${type} power, ${POWER[type]}. [hit] The way is clear!`,
      bad: `${theme.block.squeeze} [fizzle] So you use your ${type} power, and the way is clear.`,
    },
    {
      title: "Fast Asleep",
      icon: { dexId: theme.sleeper.id },
      text: `A huge ${theme.sleeper.name} is fast asleep across the path. [cry:${theme.sleeper.id}] Every snore shakes the floor. ${guide} leans in. '{whispers} Shh. Don't wake it.'`,
      labels: ["tiptoe past", power],
      good: `You tiptoe past, one careful step at a time. The ${theme.sleeper.name} snores on, and smiles in its sleep.`,
      bad: `You use your power, and the ${theme.sleeper.name} wakes with a yawn so big it blows you back to the stairs. [fizzle] Then it's asleep again. You tiptoe past, the second time.`,
    },
  ];

  fixes.forEach((fix, index) => {
    const floor = index + 1;
    const fixLeft = plan.fixLeft[index] as boolean;
    // Reached on time, or a step late after a wrong way: floor one's can already be one behind.
    for (let behind = 0; behind <= Math.min(2 * floor - 1, MOST_SLIPS); behind += 1) {
      const later = Math.min(behind + 1, MOST_SLIPS);
      const won = caughtUp(behind);
      const nextOnWin = floor < 3 ? id.way(floor + 1, won) : id.boss(won);
      const nextOnSlip = floor < 3 ? id.way(floor + 1, later) : id.boss(later);
      const good = { to: id.good(floor, behind), label: fix.labels[0] };
      const bad = { to: id.bad(floor, behind), label: fix.labels[1] };
      nodes.push({
        id: id.fix(floor, behind),
        kind: "choice",
        title: fix.title,
        icon: fix.icon,
        bed: index === 0 ? tense : bed,
        text: fix.text,
        left: fixLeft ? good : bad,
        right: fixLeft ? bad : good,
      });
      nodes.push({
        id: id.good(floor, behind),
        kind: "scene",
        title: `${fix.title}: Onwards`,
        icon: you,
        bed,
        // The guide tells a joke on the way down from floor two: its own joke for every copy of the scene.
        text: [fix.good, guideSays(guide, trainer, won, false), floor === 2 ? toldBy(guide, jokes[behind] as Joke) : ""].filter(Boolean).join(" "),
        next: nextOnWin,
      });
      nodes.push({
        id: id.bad(floor, behind),
        kind: "scene",
        title: `${fix.title}: Oops`,
        icon: fix.icon,
        bed,
        text: [fix.bad, guideSays(guide, trainer, later, true)].filter(Boolean).join(" "),
        next: nextOnSlip,
      });
    }
  });

  // The bottom: a grumpy Pokémon in the way out. Helping it is right; the tell is that it's hurt.
  const bossBed: StoryBed = { ...theme.bed, music: "tense" };
  for (let behind = 0; behind <= MOST_SLIPS; behind += 1) {
    const good = { to: id.bossGood(behind), label: "help it" };
    const bad = { to: id.bossBad(behind), label: power };
    nodes.push({
      id: id.boss(behind),
      kind: "choice",
      title: "The Way Out",
      icon: { dexId: boss.id },
      bed: bossBed,
      text: `At the very bottom, daylight shines through the way out. But a big ${boss.name} is lying across it, grumbling. [cry:${boss.id}] The ${boss.name} groans. '{sighs} Go away.' Then you see why: ${boss.trouble}. ${guide} leans in. '{whispers} It's not cross. It's hurt.'`,
      left: plan.bossLeft ? good : bad,
      right: plan.bossLeft ? bad : good,
    });
    // Helping keeps your place, or wins one back; a fight costs one. Perfect and helping is golden.
    const helped = behind === 0 ? 4 : behind === 1 ? 3 : 2;
    const fought = behind === 0 ? 3 : behind === 1 ? 2 : 1;
    nodes.push({
      id: id.bossGood(behind),
      kind: "scene",
      title: "The Way Out: A Friend",
      icon: { dexId: boss.id },
      bed: { ...theme.bed, music: "bright" },
      text: `${boss.help} The ${boss.name} looks at you. '{laughs} Thank you. Off you go, little one.'`,
      next: id.ending(helped),
    });
    nodes.push({
      id: id.bossBad(behind),
      kind: "scene",
      title: "The Way Out: Grumpier",
      icon: { dexId: boss.id },
      bed: bossBed,
      text: `You use your ${type} power. [fizzle] The ${boss.name} only gets crosser, and chases you round and round, until ${guide} says sorry for you, and helps it. ${capital(boss.help.replace(/^You /, "Then you "))}`,
      next: id.ending(fought),
    });
  }

  const reunion = `You run up the slope, out into the light, and there's ${trainer}! [cry:${partner.id}] [cheer]`;
  const endings = [
    `The stars are out by the time you find each other. ${reunion} ${capital(trainer)} scoops you up in the biggest hug, and doesn't let go all the way home. [ending]`,
    `The moon is up when you come out. ${reunion} ${capital(trainer)} has been calling your name all evening. Now you're together, and that's all that matters. You fall asleep in their arms on the way home. [ending]`,
    `The sun is just setting. ${reunion} ${capital(trainer)} hugs you so tight your ears squish. ${guide} waves goodbye from the doorway. 'Come back and visit!' [ending]`,
    `The sun is still high. ${reunion} ${capital(trainer)} spins you round and round. Then ${guide} peeks out from behind you. '{whispers} Can I come too?' ${capital(trainer)} laughs. Of course you can. Now you're three best friends, and the ${boss.name} waves you all goodbye. [cry:${theme.guide.id}] [golden]`,
  ];
  endings.forEach((text, index) => {
    const number = index + 1;
    const golden = number === LOST_ENDINGS.length;
    nodes.push({
      id: id.ending(number),
      kind: "ending",
      title: `Ending ${number}: ${LOST_ENDINGS[index]}`,
      icon: golden ? { yoto: YOTO_ICONS.celebrate } : you,
      bed: { ambience: "gate", music: golden ? "magical" : "calm" },
      text,
      ending: { number, name: LOST_ENDINGS[index] as string, ...(golden ? { golden: true } : {}) },
    });
  });

  return {
    id: `lost-${plan.seed}`,
    title: "Find Your Trainer",
    description: `You are ${partner.name}, lost in ${theme.place}. Find your way back to ${trainer}, with a little help from a new friend.`,
    start: "start",
    nodes,
    cast: LOST_CAST(theme.guide, boss),
    // The partner's and child's names are recorded on their own, and each sentence too, so the same
    // dungeon for another partner of the same type reuses almost every line.
    slots: [partner.name, ...(owner ? [owner] : [])],
  };
}

export function lostAdventure(input: AdventureInput): StoryGraph {
  return buildLost(planLost(input));
}
