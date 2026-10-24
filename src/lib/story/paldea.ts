/**
 * Paldea Picnic: your first week at a Paldea academy. You choose Sprigatito, Fuecoco or Quaxly, and
 * set off with your classmates Juno and Arlo to gather the ingredients for the Great Picnic: a sandwich,
 * a pizza, a stack of pancakes or a curry, different on each card.
 *
 * Three friendly battles on the way, each a type puzzle: pick the move that suits the wild Pokémon.
 * The middle one is a trick, where your partner's own type is the wrong choice. A miss never ends the
 * story: your partner wobbles, your friends help, and you carry on. How many you got right decides the
 * picnic at the end: your partner evolves twice and Terastallises (golden), evolves once, or not yet.
 *
 * The seed picks which wild Pokémon you meet, so every week is different. A Yoto card cannot count, so
 * each starter's journey is laid out once for none, one, and two or more misses: 89 tracks in all.
 */
import { mulberry32 } from "@/lib/kid-cards";
import { jokesFor, toldBy, type Joke } from "@/lib/jokes";
import type { AdventureInput, Partner } from "@/lib/story/adventure-route";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import type { StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";

export const PALDEA_CAST: StoryCharacter[] = [
  // Jessica, then Laura: loud, kind and very competitive.
  { id: "juno", name: "Juno", voices: ["cgSgspJ2msm6clMCkdW9", "FGY2WhTYpPnrIDTdsKH5"], tempo: 1.06, piper: { pitch: 3, tempo: 1.1 }, mood: "excited" },
  // Liam, then Will: knows every Pokédex entry by heart.
  { id: "arlo", name: "Arlo", voices: ["TX3LPaxmHKxFdv7VOQHJ", "bIHbv24MWmeRgasZH58o"], tempo: 1.02, piper: { pitch: 1, tempo: 1.04 }, mood: "curious" },
  // Sarah, then Matilda: the head of the academy, calm and dry, with a Lechonk that follows her everywhere.
  { id: "olwen", name: "Olwen", voices: ["EXAVITQu4vr4xnSDxMaL", "XrExE9yKIg1WjnnlVkGX"], tempo: 0.96, piper: { pitch: -1.5, tempo: 0.94 } },
];

/** Misses are counted up to this; two or more all come to the same picnic. */
export const MOST_MISSES = 2;

/** One wild Pokémon in a battle, and why the right move works on it. */
type Foe = { name: string; id: number; type: string; why: string };

type Starter = {
  key: "grass" | "fire" | "water";
  name: string;
  id: number;
  mid: { name: string; id: number };
  final: { name: string; id: number };
  type: string;
  /** Its own type's first move, its plain move, and its big move for the Titan. */
  own: string;
  plain: string;
  big: string;
  meet: string;
  happy: string[];
  sulk: string[];
  /** Battle 1 and 2 opponents to choose from, and the Titan. */
  first: Foe[];
  trick: Foe[];
  titan: Foe & { title: string };
};

export const STARTERS: Starter[] = [
  {
    key: "grass",
    name: "Sprigatito",
    id: 906,
    mid: { name: "Floragato", id: 907 },
    final: { name: "Meowscarada", id: 908 },
    type: "Grass",
    own: "Leafage",
    plain: "Scratch",
    big: "Magical Leaf",
    meet: "A little green cat. It turns its nose up at you, then peeks to check you're still watching.",
    happy: [
      "Sprigatito purrs so loudly it sounds like a tiny engine.",
      "Sprigatito struts about with its tail in the air, very pleased with itself.",
      "Sprigatito rubs its head against your leg. It would never admit it, but it's having the best day.",
    ],
    sulk: [
      "Sprigatito sulks, with its back to you, for a whole minute. Then it forgives you, because you scratch it behind the ear.",
      "Sprigatito looks at you as if to say, really? Then it sits in your lap anyway.",
    ],
    first: [
      { name: "Nacli", id: 932, type: "Rock", why: "Roots crack rocks apart, so a Grass move hits it hard." },
      { name: "Wiglett", id: 960, type: "Water", why: "Plants drink up water, so a Grass move hits it hard." },
      { name: "Finizen", id: 963, type: "Water", why: "Plants drink up water, so a Grass move hits it hard." },
    ],
    trick: [
      { name: "Tarountula", id: 917, type: "Bug", why: "Bugs munch leaves for breakfast, so Leafage hardly tickles it." },
      { name: "Charcadet", id: 935, type: "Fire", why: "Fire burns leaves up, so Leafage hardly tickles it." },
    ],
    titan: { name: "Klawf", id: 950, type: "Rock", title: "the Stony Cliff Titan", why: "Roots crack rocks apart, so Magical Leaf hits it hard." },
  },
  {
    key: "fire",
    name: "Fuecoco",
    id: 909,
    mid: { name: "Crocalor", id: 910 },
    final: { name: "Skeledirge", id: 911 },
    type: "Fire",
    own: "Ember",
    plain: "Bite",
    big: "Incinerate",
    meet: "A little red crocodile with a big grin, chewing something. It's your backpack strap.",
    happy: [
      "Fuecoco does a happy dance, and accidentally sets fire to a twig, which it then eats.",
      "Fuecoco grins so widely that you can count all its teeth.",
      "Fuecoco sings a little song. It's mostly the word Fuecoco, over and over.",
    ],
    sulk: [
      "Fuecoco shrugs, and eats a pine cone to cheer itself up. It works.",
      "Fuecoco looks puzzled, then eats your lunch bag. It feels much better.",
    ],
    first: [
      { name: "Smoliv", id: 928, type: "Grass", why: "Fire burns plants, so a Fire move hits it hard." },
      { name: "Snom", id: 972, type: "Ice and Bug", why: "Fire melts ice and scares bugs, so a Fire move hits it four times as hard!" },
      { name: "Tarountula", id: 917, type: "Bug", why: "Bugs keep well away from fire, so a Fire move hits it hard." },
    ],
    trick: [
      { name: "Wiglett", id: 960, type: "Water", why: "Water puts fire out, so Ember just fizzles." },
      { name: "Nacli", id: 932, type: "Rock", why: "Rocks don't burn, so Ember just fizzles." },
    ],
    titan: { name: "Orthworm", id: 968, type: "Steel", title: "the Lurking Steel Titan", why: "Fire melts metal, so Incinerate hits it hard." },
  },
  {
    key: "water",
    name: "Quaxly",
    id: 912,
    mid: { name: "Quaxwell", id: 913 },
    final: { name: "Quaquaval", id: 914 },
    type: "Water",
    own: "Water Gun",
    plain: "Pound",
    big: "Aqua Jet",
    meet: "A little duck with a neat blue quiff. It straightens a feather, and quacks at you, very politely.",
    happy: [
      "Quaxly does a smart little bow.",
      "Quaxly polishes its quiff, which is already perfectly shiny.",
      "Quaxly does a little dance, very precisely, without a single step out of place.",
    ],
    sulk: [
      "Quaxly is horrified. It has a speck of mud on its foot, and it cleans it for a very long time.",
      "Quaxly fluffs up its feathers crossly, then lets you smooth them down again.",
    ],
    first: [
      { name: "Nacli", id: 932, type: "Rock", why: "Water wears rock away, so a Water move hits it hard." },
      { name: "Charcadet", id: 935, type: "Fire", why: "Water puts fire out, so a Water move hits it hard." },
      { name: "Silicobra", id: 843, type: "Ground", why: "Water turns the ground to mud, so a Water move hits it hard." },
    ],
    trick: [
      { name: "Smoliv", id: 928, type: "Grass", why: "Plants just drink the water, so Water Gun hardly tickles it." },
      { name: "Wiglett", id: 960, type: "Water", why: "Water doesn't mind getting wet, so Water Gun hardly tickles it." },
    ],
    titan: { name: "Great Tusk", id: 984, type: "Ground and Fighting", title: "the Quaking Earth Titan", why: "Water turns the ground to mud, so Aqua Jet hits it hard." },
  },
];

/** Juno always picks the one that beats yours. Arlo gets the other. */
function friendsOf(mine: Starter): { juno: Starter; arlo: Starter } {
  const beats: Record<Starter["key"], Starter["key"]> = { grass: "fire", fire: "water", water: "grass" };
  const juno = STARTERS.find((item) => item.key === beats[mine.key]) as Starter;
  const arlo = STARTERS.find((item) => item !== mine && item !== juno) as Starter;
  return { juno, arlo };
}

const ENDING_NAMES = ["Picnic Pals", "Big Steps", "Best Friends"] as const;

/** What the Great Picnic is: two ingredients to fetch, then the Herba Mystica from the cliffs. */
export type Menu = {
  /** "the Great Picnic Sandwich". */
  dish: string;
  /** "sandwich", as in "the sandwich is on the roof". */
  noun: string;
  /** "sandwiches", as in "it rains sandwiches". */
  plural: string;
  /** How you make it: "build". */
  make: string;
  /** What you turn round to do when your partner eats it all. */
  serve: string;
  /** What Juno makes everyone after. */
  another: string;
  first: { food: string; place: string; sunny: string; spot: string; title: string; bit: string; pop: string };
  cave: { food: string; cave: string; spot: string; title: string; pop: string };
};

export const MENUS: readonly Menu[] = [
  {
    dish: "the Great Picnic Sandwich",
    noun: "sandwich",
    plural: "sandwiches",
    make: "build",
    serve: "cut the sandwich",
    another: "a second sandwich",
    first: { food: "tomatoes", place: "the orchard", sunny: "the sunny tomato orchard", spot: "the tomato patch", title: "The Tomato Orchard", bit: "a tomato", pop: "The tomatoes go pop." },
    cave: { food: "cheese", cave: "cheese cave", spot: "the biggest cheese of all", title: "The Cheese Cave", pop: "The cheese goes bang." },
  },
  {
    dish: "the Great Picnic Pizza",
    noun: "pizza",
    plural: "pizzas",
    make: "bake",
    serve: "cut the pizza",
    another: "a second pizza",
    first: { food: "peppers", place: "the vegetable garden", sunny: "the sunny vegetable garden", spot: "the pepper patch", title: "The Pepper Patch", bit: "a pepper", pop: "The peppers go pop." },
    cave: { food: "mushrooms", cave: "mushroom cave", spot: "the biggest mushroom of all", title: "The Mushroom Cave", pop: "The mushrooms go bang." },
  },
  {
    dish: "the Great Picnic Pancake Stack",
    noun: "pancake stack",
    plural: "pancakes",
    make: "stack up",
    serve: "pour the syrup",
    another: "a second stack",
    first: { food: "strawberries", place: "the strawberry field", sunny: "the sunny strawberry field", spot: "the strawberry patch", title: "The Strawberry Field", bit: "a strawberry", pop: "The strawberries go pop." },
    cave: { food: "honey", cave: "honey cave", spot: "the biggest honeycomb of all", title: "The Honey Cave", pop: "The honey goes splat." },
  },
  {
    dish: "the Great Picnic Curry",
    noun: "curry",
    plural: "bowls of curry",
    make: "cook",
    serve: "fetch the spoons",
    another: "a second pot",
    first: { food: "carrots", place: "the vegetable garden", sunny: "the sunny vegetable garden", spot: "the carrot patch", title: "The Carrot Patch", bit: "a carrot", pop: "The carrots go pop." },
    cave: { food: "mushrooms", cave: "mushroom cave", spot: "the biggest mushroom of all", title: "The Mushroom Cave", pop: "The mushrooms go bang." },
  },
];

export type PaldeaPlan = { seed: number; picks: Record<Starter["key"], { first: Foe; trick: Foe }>; menu: Menu };

export function planPaldea(seed: number): PaldeaPlan {
  const random = mulberry32((seed ^ 0x9a1dea) >>> 0);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const picks = Object.fromEntries(
    STARTERS.map((starter) => [starter.key, { first: pick(starter.first), trick: pick(starter.trick) }]),
  ) as PaldeaPlan["picks"];
  // The menu has its own draw, so the wild Pokémon for a seed stay the same.
  const menu = MENUS[Math.floor(mulberry32((seed ^ 0xf00d) >>> 0)() * MENUS.length)] as Menu;
  return { seed, picks, menu };
}

function an(word: string): string {
  return /^[AEIOU]/.test(word) ? `an ${word}` : `a ${word}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the friends say after a battle, by how the week is going. */
/** What the friends say after a battle, by how the week is going. Each card draws its own from each set. */
function cheer(stage: number, missed: boolean, misses: number, mine: Starter, seed = 0): string {
  const pick = (lines: readonly string[]) => lines[(seed + stage) % lines.length] as string;
  if (missed) {
    return misses >= MOST_MISSES
      ? pick([
          "Arlo nods. 'Don't worry. Every great trainer has wobbly days. That's how you learn.'",
          "Arlo pats your arm. 'My notebook says everyone gets this one wrong at first.'",
          "Juno shrugs. 'Even I get it wrong sometimes. Not often. But sometimes.'",
        ])
      : pick([
          "Juno smiles. '{cheerfully} Shake it off. You'll get the next one.'",
          "Arlo smiles. 'Now we know. That's how learning works.'",
          "Juno grins. 'Next one's yours. I can feel it.'",
        ]);
  }
  if (misses === 0) {
    return (
      [
        [`Juno smiles. 'You two are brilliant together.'`, `Arlo beams. 'Textbook. Absolutely textbook.'`],
        [`Arlo beams. '{excited} Not one wrong move. I'm writing that in my notebook.'`, `Juno gasps. '{gasps} How are you so good at this?'`],
        [`Juno grins. 'I've never seen ${an(mine.name)} that happy.'`, `Arlo grins. 'That's going straight in my notebook, with a star.'`],
      ][stage]?.[seed % 2] ?? ""
    );
  }
  return pick([
    "Juno beams. '{excited} That's more like it! Now you're cooking.'",
    "Arlo beams. 'Back on track!'",
    "Juno cheers. '{excited} Yes! That's the way!'",
  ]);
}

type Stage = { title: string; bed: StoryBed; foe: Foe; good: string; slip: string; ask: string; scene: string };

function stagesFor(mine: Starter, plan: PaldeaPlan, owner: string): Stage[] {
  const seed = Math.abs(plan.seed);
  const menu = plan.menu;
  const { first, trick } = plan.picks[mine.key];
  const titan = mine.titan;
  return [
    {
      title: menu.first.title,
      bed: { ambience: "grass", music: "adventure" },
      foe: first,
      good: mine.own,
      slip: mine.plain,
      scene: `[footsteps] ${seed % 2 ? `First, ${menu.first.food} from ${menu.first.place}.` : `First stop, ${menu.first.sunny}.`} But a wild ${first.name} is sitting in ${menu.first.spot}, and it won't let anyone near. [cry:${first.id}] Arlo grins. 'That's ${an(first.name)}. It's ${an(first.type)} type.' Juno turns to you. 'Your turn, ${owner}.'`,
      ask: `Which move should ${mine.name} use?`,
    },
    {
      title: menu.cave.title,
      bed: { ambience: "cave", music: "mysterious" },
      foe: trick,
      good: mine.plain,
      slip: mine.own,
      scene: `[footsteps] ${seed % 3 ? `Next, ${menu.cave.food} from the dark cave.` : `Next stop, the cool ${menu.cave.cave}.`} A wild ${trick.name} is curled up on ${menu.cave.spot}. [cry:${trick.id}] Arlo turns to you. 'It's ${an(trick.name)}. That's ${an(trick.type)} type. Think carefully.' ${mine.name} is already getting ready to use ${mine.own}, its favourite move.`,
      ask: `Which move should ${mine.name} use?`,
    },
    {
      title: "The Titan",
      bed: { ambience: "mountain", music: "tense" },
      foe: titan,
      good: mine.big,
      slip: mine.plain,
      scene: `Last, the Herba Mystica, a magical herb at the top of the cliffs. But guarding it is a huge Pokémon. The ground shakes. [cry:${titan.id}] Arlo leans in. '{whispers} That's ${titan.name}, ${titan.title}. It's ${titan.type} type.' ${mine.name} has just learnt a brand new move, ${mine.big}.`,
      ask: `Which move should ${mine.name} use?`,
    },
  ];
}

function goodText(stage: Stage, mine: Starter, happy: string): string {
  return `${mine.name} uses ${stage.good}. [hit] It's super effective! ${stage.foe.why} The ${stage.foe.name} wanders off, and the ingredient is yours. [cheer] ${happy}`;
}

function slipText(stage: Stage, mine: Starter, sulk: string, index: number, juno: Starter): string {
  const whyNot =
    index === 1
      ? stage.foe.why
      : `It works, but only just. ${stage.foe.why.replace(/,? so .*$/, ".")} ${mine.own === stage.slip ? "" : `${capitalise(an(mine.type))} move would have been super effective.`}`;
  return `${mine.name} uses ${stage.slip}. [fizzle] ${whyNot} ${sulk} Juno's ${juno.name} helps out, and you get the ingredient anyway.`;
}

/** Who drops in on the picnic: one for each card. */
const VISITORS = [
  "A Pawmi sneaks a crumb and runs off giggling. [cry:921]",
  "Two Tandemaus share one tiny crumb, very politely. [cry:924]",
  "A Smoliv rolls up, sniffs the picnic, and rolls away again. [cry:928]",
  "A Wiglett pops out of the ground to see what the fuss is about. [cry:960]",
  "A Flittle floats down and lands on Ms Olwen's clipboard. [cry:955]",
];

function endingText(band: number, mine: Starter, juno: Starter, arlo: Starter, owner: string, menu: Menu, visitor = ""): string {
  const intro = `At the top of the hill, on the biggest picnic blanket in Paldea, you ${menu.make} ${menu.dish}. It's enormous. Juno's ${juno.name} and Arlo's ${arlo.name} sit down beside ${mine.name}.`;
  if (band === 2) {
    return `${intro} And then ${mine.name} begins to glow. [cry:${mine.id}] Brighter, and brighter, until with a flash it becomes ${mine.mid.name}! [cry:${mine.mid.id}] And it doesn't stop. It glows again, and becomes ${mine.final.name}! [cry:${mine.final.id}] [fanfare] Then a crown of shining crystal appears above its head, sparkling every colour of the rainbow. It has Terastallised! Ms Olwen speaks very quietly. '{whispers} In thirty years at this academy, I have never seen a partner trust its trainer so much. ${owner ? `${owner}, you` : "You"} two are best friends.' Juno is so amazed she forgets to be jealous. ${visitor} [golden]`;
  }
  if (band === 1) {
    return `${intro} You share out the ${menu.noun}, and the moment ${mine.name} takes a bite, it begins to glow. [cry:${mine.id}] With a flash, it becomes ${mine.mid.name}! [cry:${mine.mid.id}] [fanfare] Ms Olwen is smiling. '{cheerfully} Look at that. Your partner is growing up, just like you.' Juno says hers is going to evolve tomorrow. Arlo writes it all down in his notebook. ${visitor} [ending]`;
  }
  return `${intro} You turn round to ${menu.serve}, and when you turn back, it's gone. ${mine.name} has eaten all of ${menu.dish} and is lying on its back with a very round tummy. [cry:${mine.id}] Everybody laughs so much that Lechonk falls over. Ms Olwen nods. 'It'll evolve when it's ready. And it will, you know. It's already very fond of you.' Juno makes everyone ${menu.another}. ${visitor} [ending]`;
}

/** What the picnic turns into when two of the same starter evolve together, and what ends up in Ms Olwen's hair. */
const TWIN_CHAOS: Record<Starter["key"], { ask: string; labels: [string, string]; opener: string; chaos: (menu: Menu) => string; bit: (menu: Menu) => string }> = {
  fire: {
    ask: "Do the two Skeledirge sing a little song, or a really big one?",
    labels: ["sing a little song", "sing a really big one"],
    opener: "It turns out Skeledirge only know one kind of song: the loudest kind.",
    chaos: (menu) =>
      `The two Skeledirge take a deep breath, and sing. ${menu.first.pop} ${menu.cave.pop} The Herba Mystica goes whoosh. And then ${menu.dish} explodes. [hit] It rains ${menu.plural}. Little ones, big ones, and one with a very surprised Lechonk riding on top of it. [cry:915] Ms Olwen's clipboard has caught fire, so one of the Skeledirge eats it. Juno has ${menu.first.bit} on her head. '{laughs} Best. Picnic. Ever!' [cheer] Everybody does the conga round the hill, with both Skeledirge at the front, singing, and setting fire to the odd twig, which they then eat.`,
    bit: (menu) => menu.first.bit,
  },
  grass: {
    ask: "Do the two Meowscarada do a small magic trick, or a really big one?",
    labels: ["do a small trick", "do a really big one"],
    opener: "It turns out Meowscarada only know one kind of trick: the biggest kind.",
    chaos: (menu) =>
      `The two Meowscarada bow, very politely, and throw a cloth over ${menu.dish}. They wave their paws. They count to three. And the ${menu.noun} explodes. [hit] Not into crumbs, but into flowers. Thousands of them, then millions, bursting out of the blanket and rolling down the hill in a great pink wave. Lechonk vanishes under the petals and pops back up wearing a daisy chain. [cry:915] Ms Olwen sneezes so hard that her hat flies off and lands on Arlo. Juno shouts. '{laughs} Do it again!' And they do. [cheer] Now the whole academy is a flower garden, the ${menu.noun} is on the roof, and nobody knows how it got there.`,
    bit: () => "a petal",
  },
  water: {
    ask: "Do the two Quaquaval do a little dance, or a really big one?",
    labels: ["dance a little", "dance a lot"],
    opener: "It turns out Quaquaval only know one kind of dance: the splashiest kind.",
    chaos: (menu) =>
      `The two Quaquaval stand up, stretch, and begin to dance. Left foot, right foot, a twirl and a splash. With every step, a fountain of water bursts out of the ground. The fountains get bigger, and bigger, and then the whole picnic goes up in one enormous watery explosion. [hit] When the spray clears, the top of the hill is a swimming pool. ${menu.dish.replace(/^the/, "The")} is floating across it like a little boat, and Lechonk is surfing on a tray. [cry:915] Juno jumps. '{laughs} Everyone in!' [cheer] Arlo jumps in with his notebook. Ms Olwen jumps in with her clipboard. The two Quaquaval keep on dancing on top of the water, which nobody can explain.`,
    bit: () => "a fish",
  },
};

/** The secret endings' names, from the fewest right answers to the most. */
const TWIN_NAMES = ["Secret: Twice the Trouble", "Secret: Kaboom", "Secret: The Great Picnic Explosion"];

/**
 * The secret ending: your partner from home is the very same Pokémon as the one you chose, so the two of
 * them evolve together, twice, and the picnic does not survive. How many you got right decides the finish.
 */
/** The twins evolve together, twice, just before the picnic, and look at you as if they have an idea. */
function twinChoiceText(mine: Starter, menu: Menu): string {
  return `At the top of the hill, you ${menu.make} ${menu.dish}. It's enormous. Your ${mine.name} from home sits down next to the new ${mine.name}. They look at each other, and both begin to glow. [cry:${mine.id}] Arlo gasps. '{gasps} Two of them? That isn't in any Pokédex!' Flash! Two ${mine.mid.name}! [cry:${mine.mid.id}] Flash! Two ${mine.final.name}! [cry:${mine.final.id}] [fanfare] ${TWIN_CHAOS[mine.key].ask}`;
}

/**
 * The secret ending: your partner from home is the very same Pokémon as the one you chose, so the two of
 * them evolve together, twice, and whatever you ask of them, the picnic does not survive. How many you got
 * right decides the finish.
 */
function twinEndingText(band: number, mine: Starter, owner: string, menu: Menu): string {
  const twin = TWIN_CHAOS[mine.key];
  const { opener } = twin;
  const chaos = twin.chaos(menu);
  const bit = twin.bit(menu);
  const finish = [
    `Arlo writes in his notebook, in very big letters: never let two ${mine.name} come to a picnic. Then he draws a little heart next to it. [ending]`,
    `Ms Olwen picks ${bit} out of her hair. '{laughs} Well, that is one way to have a picnic.' [ending]`,
    `Then both of them Terastallise at once, sparkling every colour of the rainbow. Ms Olwen picks ${bit} out of her hair. 'In thirty years, I have never seen anything like it. ${owner ? `${owner}, you` : "You"} three are best friends.' [golden]`,
  ][band] as string;
  return `${opener} ${chaos} ${finish}`;
}

const id = {
  stage: (p: string, stage: number, misses: number) => `${p}${stage}m${misses}`,
  good: (p: string, stage: number, misses: number) => `${p}${stage}g${misses}`,
  slip: (p: string, stage: number, misses: number) => `${p}${stage}b${misses}`,
  ending: (p: string, misses: number) => `${p}e${Math.min(misses, MOST_MISSES)}`,
  twin: (p: string, misses: number) => `${p}t${Math.min(misses, MOST_MISSES)}`,
};

/** Turns a plan into the story map, with the child's name where the friends call to them. */
export function buildPaldea(plan: PaldeaPlan, ownerName = "", partner?: Partner): StoryGraph {
  const owner = ownerName.trim();
  const P = partner?.name ?? "";
  const you = owner || "new student";
  const nodes: StoryNode[] = [];
  const pfx: Record<Starter["key"], string> = { grass: "g", fire: "f", water: "w" };
  // Juno tells a joke after the first battle: a different one for each starter, so none repeats on a card.
  const jokes = jokesFor(mulberry32((plan.seed ^ 0x70e) >>> 0));

  nodes.push({
    id: "start",
    kind: "scene",
    title: "The Academy",
    icon: { dexId: 915 },
    bed: { ambience: "house", music: "bright" },
    text: `Welcome to your first week at the academy, in sunny Paldea! The head, Ms Olwen, has a clipboard and a little pig Pokémon called Lechonk. [cry:915] Ms Olwen smiles. 'Good morning, ${you}. Meet Juno and Arlo.' Juno beams. '{excited} Hi! I'm going to be the best trainer here.' Arlo grins. 'I've read every Pokédex entry. Twice.' Ms Olwen opens a basket of three little Pokémon. ${partner ? `Your partner ${P} peeks in too. [cry:${partner.id}] ` : ""}'Choose your partner.'`,
    next: "pick1",
  });
  nodes.push({
    id: "pick1",
    kind: "choice",
    title: "Choose Your Partner",
    icon: { dexId: 906 },
    bed: { ambience: "house", music: "bright" },
    text: `The first is Sprigatito, a Grass type. [cry:906] ${STARTERS[0]?.meet}`,
    left: { to: "g0", label: "choose Sprigatito" },
    right: { to: "pick2", label: "meet the other two" },
  });
  nodes.push({
    id: "pick2",
    kind: "choice",
    title: "Choose Your Partner",
    icon: { dexId: 909 },
    bed: { ambience: "house", music: "bright" },
    text: `Next is Fuecoco, a Fire type. [cry:909] ${STARTERS[1]?.meet} And last is Quaxly, a Water type. [cry:912] ${STARTERS[2]?.meet}`,
    left: { to: "f0", label: "choose Fuecoco" },
    right: { to: "w0", label: "choose Quaxly" },
  });

  for (const mine of STARTERS) {
    const p = pfx[mine.key];
    const { juno, arlo } = friendsOf(mine);
    const stages = stagesFor(mine, plan, you);
    // The child's favourite is this very starter: two of the same, and a secret ending to match.
    const twin = partner?.id === mine.id;
    const meeting = twin
      ? `Your ${P} from home sniffs the new ${mine.name}, and they both do the same little happy dance. Two of them! `
      : partner
        ? `${P} sniffs ${mine.name}, and the two of them are friends at once. `
        : "";
    nodes.push({
      id: `${p}0`,
      kind: "scene",
      title: `${mine.name}!`,
      icon: { dexId: mine.id },
      bed: { ambience: "house", music: "bright" },
      text: `You choose ${mine.name}. [cry:${mine.id}] It jumps into your arms. ${meeting}Juno grabs ${juno.name}. Juno smirks. '{smugly} I'll have this one. It beats yours, obviously.' That leaves ${arlo.name} for Arlo. Arlo turns to you. 'Good. I wanted that one anyway.' Ms Olwen nods. 'This week is the Great Picnic. Fetch ${plan.menu.first.food}, ${plan.menu.cave.food} and Herba Mystica for ${plan.menu.dish}, and meet me at the top of the hill.'`,
      next: id.stage(p, 0, 0),
    });
    stages.forEach((stage, index) => {
      for (let misses = 0; misses <= Math.min(index, MOST_MISSES); misses += 1) {
        const after = Math.min(misses + 1, MOST_MISSES);
        const last = index === stages.length - 1;
        const good = { to: id.good(p, index, misses), label: `use ${stage.good}` };
        const slip = { to: id.slip(p, index, misses), label: `use ${stage.slip}` };
        // Which button is the right move changes from battle to battle, and from week to week.
        const goodLeft = (plan.seed + index) % 2 === 0;
        nodes.push({
          id: id.stage(p, index, misses),
          kind: "choice",
          title: stage.title,
          icon: { dexId: stage.foe.id },
          bed: stage.bed,
          text: `${stage.scene} ${stage.ask}`,
          left: goodLeft ? good : slip,
          right: goodLeft ? slip : good,
        });
        nodes.push({
          id: id.good(p, index, misses),
          kind: "scene",
          title: `${stage.title}: Got It`,
          icon: { dexId: mine.id },
          bed: stage.bed,
          text: [
            goodText(stage, mine, mine.happy[(index + plan.seed) % mine.happy.length] as string),
            partner && index === 1
              ? twin
                ? `Your ${P} from home cheers its twin on from right beside you.`
                : `${P} cheers ${mine.name} on from right beside you.`
              : "",
            index === 0 ? toldBy("Juno", jokes[STARTERS.indexOf(mine)] as Joke) : "",
            cheer(index, false, misses, mine, plan.seed),
          ]
            .filter(Boolean)
            .join(" "),
          next: last ? (twin ? id.twin(p, misses) : id.ending(p, misses)) : id.stage(p, index + 1, misses),
        });
        nodes.push({
          id: id.slip(p, index, misses),
          kind: "scene",
          title: `${stage.title}: Got It`,
          icon: { dexId: stage.foe.id },
          bed: stage.bed,
          text: `${slipText(stage, mine, mine.sulk[(index + plan.seed) % mine.sulk.length] as string, index, juno)} ${cheer(index, true, after, mine, plan.seed)}`,
          next: last ? (twin ? id.twin(p, after) : id.ending(p, after)) : id.stage(p, index + 1, after),
        });
      }
    });
    if (twin) {
      const [little, big] = TWIN_CHAOS[mine.key].labels;
      for (let misses = 0; misses <= MOST_MISSES; misses += 1) {
        nodes.push({
          id: id.twin(p, misses),
          kind: "choice",
          title: `Two ${mine.final.name}!`,
          icon: { dexId: mine.final.id },
          bed: { ambience: "grass", music: "magical" },
          text: twinChoiceText(mine, plan.menu),
          left: { to: id.ending(p, misses), label: little },
          right: { to: id.ending(p, misses), label: big },
        });
      }
    }
    for (let misses = MOST_MISSES; misses >= 0; misses -= 1) {
      const band = MOST_MISSES - misses;
      const name = (twin ? TWIN_NAMES : ENDING_NAMES)[band] as string;
      const number = STARTERS.indexOf(mine) * ENDING_NAMES.length + band + 1;
      nodes.push({
        id: id.ending(p, misses),
        kind: "ending",
        title: `Ending ${number}: ${mine.name}, ${name}`,
        icon: { dexId: twin || band === 2 ? mine.final.id : band === 1 ? mine.mid.id : mine.id },
        bed: { ambience: "grass", music: twin ? "champion" : band === 2 ? "magical" : "bright" },
        text: twin
          ? twinEndingText(band, mine, owner, plan.menu)
          : withPartner(endingText(band, mine, juno, arlo, owner, plan.menu, VISITORS[(plan.seed + band) % VISITORS.length]), band, mine, partner),
        ending: { number, name: twin ? name : `${mine.name}: ${name}`, golden: band === 2 },
      });
    }
  }

  return {
    id: `paldea-${plan.seed}`,
    title: "Paldea Picnic",
    description:
      "Choose Sprigatito, Fuecoco or Quaxly, and gather ingredients for the Great Picnic with your classmates Juno and Arlo. Every battle counts towards the picnic at the end.",
    start: "start",
    nodes,
    cast: PALDEA_CAST,
    slots: owner ? [owner] : [],
  };
}

/** Your partner at the picnic, just before the closing sound. */
function withPartner(text: string, band: number, mine: Starter, partner?: Partner): string {
  if (!partner) return text;
  const line = [
    `${partner.name} looks at ${mine.name}'s round tummy, and laughs so much it gets hiccups.`,
    `${partner.name} and ${mine.name} play tag round the picnic blanket until the sun goes down.`,
    `${partner.name} and ${mine.name} share the last bite, then nap in the sunshine. [cry:${partner.id}]`,
  ][band] as string;
  return text.replace(/ (\[(?:ending|golden)\])$/, ` ${line} $1`);
}

export function paldeaAdventure(input: AdventureInput): StoryGraph {
  return buildPaldea(planPaldea(input.seed), input.owner ?? "", input.partner);
}
