/**
 * Paldea Picnic: your first week at a Paldea academy. You choose Sprigatito, Fuecoco or Quaxly, and
 * set off with your classmates Juno and Arlo to gather the ingredients for the Great Picnic Sandwich.
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
import { jokesFor, toldBy } from "@/lib/jokes";
import type { AdventureInput, Partner } from "@/lib/story/adventure-route";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import type { StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";

export const PALDEA_CAST: StoryCharacter[] = [
  // Jessica, then Laura: loud, kind and very competitive.
  { id: "juno", name: "Juno", voices: ["cgSgspJ2msm6clMCkdW9", "FGY2WhTYpPnrIDTdsKH5"], tempo: 1.06, piper: { pitch: 3, tempo: 1.1 } },
  // Liam, then Will: knows every Pokédex entry by heart.
  { id: "arlo", name: "Arlo", voices: ["TX3LPaxmHKxFdv7VOQHJ", "bIHbv24MWmeRgasZH58o"], tempo: 1.02, piper: { pitch: 1, tempo: 1.04 } },
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
    meet: "It's a little green cat Pokémon, and the moment it sees you, it turns its nose up and starts washing its paw. Then it peeks, to check you're still watching.",
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
    meet: "It's a little red crocodile Pokémon with a big happy grin, and it's chewing something. It's your backpack strap.",
    happy: [
      "Fuecoco does a happy dance, and accidentally sets fire to a twig, which it then eats.",
      "Fuecoco grins so widely that you can count all its teeth.",
      "Fuecoco sings a little song. It's mostly the word Fuecoco, over and over.",
    ],
    sulk: [
      "Fuecoco shrugs, and eats a pine cone to cheer itself up. It works.",
      "Fuecoco looks puzzled, then eats your sandwich bag. It feels much better.",
    ],
    first: [
      { name: "Smoliv", id: 928, type: "Grass", why: "Fire burns plants, so a Fire move hits it hard." },
      { name: "Snom", id: 972, type: "Ice and Bug", why: "Fire melts ice, and bugs keep away from fire, so a Fire move hits it four times as hard!" },
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
    meet: "It's a little duck Pokémon with a neat blue quiff, and it's checking its reflection in a puddle. It straightens a feather, and quacks at you, very politely.",
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

export type PaldeaPlan = { seed: number; picks: Record<Starter["key"], { first: Foe; trick: Foe }> };

export function planPaldea(seed: number): PaldeaPlan {
  const random = mulberry32((seed ^ 0x9a1dea) >>> 0);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const picks = Object.fromEntries(
    STARTERS.map((starter) => [starter.key, { first: pick(starter.first), trick: pick(starter.trick) }]),
  ) as PaldeaPlan["picks"];
  return { seed, picks };
}

function an(word: string): string {
  return /^[AEIOU]/.test(word) ? `an ${word}` : `a ${word}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the friends say after a battle, by how the week is going. */
function cheer(stage: number, missed: boolean, misses: number, mine: Starter): string {
  if (missed) {
    return misses >= MOST_MISSES
      ? "'Don't worry,' says Arlo. 'Every great trainer has wobbly days. That's how you learn.'"
      : "'{cheerfully} Shake it off,' says Juno. 'You'll get the next one.'";
  }
  if (misses === 0) {
    return (
      [
        `'You two are brilliant together,' says Juno, sounding a tiny bit jealous.`,
        `'{excited} Not one wrong move,' says Arlo. 'I'm writing that in my notebook.'`,
        `'I've never seen ${an(mine.name)} that happy,' says Juno.`,
      ][stage] ?? ""
    );
  }
  return "'{excited} That's more like it!' says Juno. 'Now you're cooking.'";
}

type Stage = { title: string; bed: StoryBed; foe: Foe; good: string; slip: string; ask: string; scene: string };

function stagesFor(mine: Starter, plan: PaldeaPlan, owner: string): Stage[] {
  const { first, trick } = plan.picks[mine.key];
  const titan = mine.titan;
  return [
    {
      title: "The Tomato Orchard",
      bed: { ambience: "grass", music: "adventure" },
      foe: first,
      good: mine.own,
      slip: mine.plain,
      scene: `[footsteps] The first thing on Ms Olwen's list is tomatoes, the juiciest in Paldea, from the orchard on the hill. But a wild ${first.name} is sitting right in the middle of the tomato patch, and it won't let anyone near. [cry:${first.id}] 'That's ${an(first.name)},' says Arlo, reading his Pokédex. 'It's ${an(first.type)} type.' 'Your turn, ${owner},' says Juno.`,
      ask: `Which move should ${mine.name} use?`,
    },
    {
      title: "The Cheese Cave",
      bed: { ambience: "cave", music: "mysterious" },
      foe: trick,
      good: mine.plain,
      slip: mine.own,
      scene: `[footsteps] Next on the list is cheese, from the cool, dark cave where the cheese makers keep their wheels. Inside, a wild ${trick.name} has curled up on top of the biggest cheese of all. [cry:${trick.id}] 'It's ${an(trick.name)},' says Arlo. 'And that's ${an(trick.type)} type. Think carefully about this one.' ${mine.name} is already getting ready to use ${mine.own}, its favourite move.`,
      ask: `Which move should ${mine.name} use?`,
    },
    {
      title: "The Titan",
      bed: { ambience: "mountain", music: "tense" },
      foe: titan,
      good: mine.big,
      slip: mine.plain,
      scene: `The last ingredient is the most special of all: Herba Mystica, a magical herb that only grows at the top of the cliffs, and that makes any sandwich taste like a feast. But guarding it is a huge Pokémon. The ground shakes. [cry:${titan.id}] '{whispers} That's ${titan.name},' whispers Arlo, '${titan.title}. It's ${titan.type} type.' ${mine.name} looks up at you. It has just learnt a brand new move, ${mine.big}.`,
      ask: `Which move should ${mine.name} use?`,
    },
  ];
}

function goodText(stage: Stage, mine: Starter, happy: string): string {
  return `${mine.name} uses ${stage.good}. [hit] It's super effective! ${stage.foe.why} The wild ${stage.foe.name} decides it's had enough, and wanders off, and the ingredient is yours. [cheer] ${happy}`;
}

function slipText(stage: Stage, mine: Starter, sulk: string, index: number, juno: Starter): string {
  const whyNot =
    index === 1
      ? stage.foe.why
      : `It works, but only just. ${stage.foe.why.replace(/,? so .*$/, ".")} ${mine.own === stage.slip ? "" : `${capitalise(an(mine.type))} move would have been super effective.`}`;
  return `${mine.name} uses ${stage.slip}. [fizzle] ${whyNot} ${sulk} In the end, Juno's ${juno.name} helps out, and between them you get the ingredient. But ${mine.name} looks a little less sure of itself.`;
}

function endingText(band: number, mine: Starter, juno: Starter, arlo: Starter, owner: string): string {
  const intro = `At the top of the hill, Ms Olwen has laid out the biggest picnic blanket in Paldea, and her Lechonk is already sitting on it. You put the tomatoes, the cheese and the Herba Mystica together into the Great Picnic Sandwich. It's enormous. Juno's ${juno.name} and Arlo's ${arlo.name} sit down beside ${mine.name}.`;
  if (band === 2) {
    return `${intro} And then ${mine.name} begins to glow. [cry:${mine.id}] Brighter, and brighter, until with a flash it becomes ${mine.mid.name}! [cry:${mine.mid.id}] And it doesn't stop. It glows again, and becomes ${mine.final.name}! [cry:${mine.final.id}] [fanfare] Then a crown of shining crystal appears above its head, sparkling every colour of the rainbow. It has Terastallised! '{whispers} In thirty years at this academy,' says Ms Olwen, very quietly, 'I have never seen a partner trust its trainer so much. ${owner ? `${owner}, you` : "You"} two are best friends.' Juno is so amazed she forgets to be jealous. [golden]`;
  }
  if (band === 1) {
    return `${intro} You share the sandwich out, and the moment ${mine.name} takes a bite, it begins to glow. [cry:${mine.id}] With a flash, it becomes ${mine.mid.name}! [cry:${mine.mid.id}] [fanfare] '{cheerfully} Look at that,' says Ms Olwen, smiling. 'Your partner is growing up, just like you.' Juno says hers is going to evolve tomorrow. Arlo writes it all down in his notebook. [ending]`;
  }
  return `${intro} You turn round to cut the sandwich, and when you turn back, it's gone. ${mine.name} has eaten the entire Great Picnic Sandwich, in one go, and is lying on its back with a very round tummy. [cry:${mine.id}] Everybody laughs so much that Lechonk falls over. 'It'll evolve when it's ready,' says Ms Olwen. 'And it will, you know. It's already very fond of you.' Juno makes everyone a second sandwich. It's not quite as big. [ending]`;
}

/** What the picnic turns into when two of the same starter evolve together, and what ends up in Ms Olwen's hair. */
const TWIN_CHAOS: Record<Starter["key"], { chaos: string; bit: string }> = {
  fire: {
    chaos:
      "The two Skeledirge take a deep breath, and sing. It is the loudest song in the whole history of Paldea. The tomatoes go pop. The cheese goes bang. The Herba Mystica goes whoosh. And then the Great Picnic Sandwich explodes. [hit] For a moment, nothing happens. Then it starts to rain sandwiches. Little ones, big ones, and one with a very surprised Lechonk riding on top of it. [cry:915] Ms Olwen's clipboard has caught fire, so one of the Skeledirge eats it. '{laughs} Best. Picnic. Ever!' shouts Juno, who has a tomato on her head. [cheer] Everybody does the conga round the hill, with both Skeledirge at the front, singing, and setting fire to the odd twig, which they then eat.",
    bit: "a tomato",
  },
  grass: {
    chaos:
      "The two Meowscarada bow, very politely, and throw a cloth over the Great Picnic Sandwich. They wave their paws. They count to three. And the sandwich explodes. [hit] Not into crumbs, but into flowers. Thousands of them, then millions, bursting out of the blanket and rolling down the hill in a great pink wave. Lechonk vanishes under the petals and pops back up wearing a daisy chain. [cry:915] Ms Olwen sneezes so hard that her hat flies off and lands on Arlo. '{laughs} Do it again!' shouts Juno, and they do. [cheer] Now the whole academy is a flower garden, the sandwich is on the roof, and nobody knows how it got there.",
    bit: "a petal",
  },
  water: {
    chaos:
      "The two Quaquaval stand up, stretch, and begin to dance. Left foot, right foot, a twirl and a splash. With every step, a fountain of water bursts out of the ground. The fountains get bigger, and bigger, and then the whole picnic goes up in one enormous watery explosion. [hit] When the spray clears, the top of the hill is a swimming pool. The Great Picnic Sandwich is floating across it like a little boat, and Lechonk is surfing on a tray. [cry:915] '{laughs} Everyone in!' shouts Juno, and jumps. [cheer] Arlo jumps in with his notebook. Ms Olwen jumps in with her clipboard. The two Quaquaval keep on dancing on top of the water, which nobody can explain.",
    bit: "a fish",
  },
};

/** The secret endings' names, from the fewest right answers to the most. */
const TWIN_NAMES = ["Secret: Twice the Trouble", "Secret: Kaboom", "Secret: The Great Picnic Explosion"];

/**
 * The secret ending: your partner from home is the very same Pokémon as the one you chose, so the two of
 * them evolve together, twice, and the picnic does not survive. How many you got right decides the finish.
 */
function twinEndingText(band: number, mine: Starter, juno: Starter, arlo: Starter, owner: string): string {
  const { chaos, bit } = TWIN_CHAOS[mine.key];
  const intro = `At the top of the hill, Ms Olwen has laid out the biggest picnic blanket in Paldea, and her Lechonk is already sitting on it. You put the tomatoes, the cheese and the Herba Mystica together into the Great Picnic Sandwich. It's enormous. Juno's ${juno.name} and Arlo's ${arlo.name} sit down to wait. Your ${mine.name} from home sits down next to the new ${mine.name}. They look at the sandwich. They look at each other. Then, at exactly the same moment, they both begin to glow. [cry:${mine.id}] '{gasps} Two of them?' says Arlo, dropping his notebook. 'That isn't in any Pokédex!' Flash! Two ${mine.mid.name}! [cry:${mine.mid.id}] Flash! Two ${mine.final.name}! [cry:${mine.final.id}] [fanfare]`;
  const finish = [
    `Arlo picks up his notebook and writes, in very big letters: never let two ${mine.name} come to a picnic. Then he underlines it twice, and draws a little heart next to it. [ending]`,
    `'{laughs} Well,' says Ms Olwen, picking ${bit} out of her hair, 'that is one way to have a picnic.' [ending]`,
    `Then two crowns of shining crystal appear, one above each head, and both of them Terastallise at once, sparkling every colour of the rainbow. 'In thirty years at this academy,' says Ms Olwen, picking ${bit} out of her hair, 'I have never seen anything like it. ${owner ? `${owner}, you` : "You"} three are best friends. And you are all helping to tidy up.' [golden]`,
  ][band] as string;
  return `${intro} ${chaos} ${finish}`;
}

const id = {
  stage: (p: string, stage: number, misses: number) => `${p}${stage}m${misses}`,
  good: (p: string, stage: number, misses: number) => `${p}${stage}g${misses}`,
  slip: (p: string, stage: number, misses: number) => `${p}${stage}b${misses}`,
  ending: (p: string, misses: number) => `${p}e${Math.min(misses, MOST_MISSES)}`,
};

/** Turns a plan into the story map, with the child's name where the friends call to them. */
export function buildPaldea(plan: PaldeaPlan, ownerName = "", partner?: Partner): StoryGraph {
  const owner = ownerName.trim();
  const P = partner?.name ?? "";
  const you = owner || "new student";
  const nodes: StoryNode[] = [];
  const pfx: Record<Starter["key"], string> = { grass: "g", fire: "f", water: "w" };
  const joke = jokesFor(mulberry32((plan.seed ^ 0x70e) >>> 0))[0] as NonNullable<ReturnType<typeof jokesFor>[number]>;

  nodes.push({
    id: "start",
    kind: "scene",
    title: "The Academy",
    icon: { dexId: 915 },
    bed: { ambience: "house", music: "bright" },
    text: `Welcome to your first week at the academy, in the sunny land of Paldea! The head of the academy, Ms Olwen, is a tall woman with a clipboard, and a little pig Pokémon called Lechonk is following her everywhere. [cry:915] 'Good morning, ${you},' says Ms Olwen. 'This is Juno, and this is Arlo. You three are in the same class.' Juno waves so hard she nearly falls over. '{excited} Hi! I'm going to be the best trainer in the whole academy,' says Juno. Arlo pushes up his glasses. 'I've read every Pokédex entry there is,' says Arlo. 'Twice.' 'This week,' says Ms Olwen, 'there is the Great Picnic. Each of you will choose a partner Pokémon, and together you will gather the ingredients for the Great Picnic Sandwich: tomatoes from the orchard, cheese from the cave, and Herba Mystica from the top of the cliffs.' She opens a basket. Inside are three little Pokémon, looking up at you. ${partner ? `Your partner ${P}, who came with you from home, peeks into the basket too. [cry:${partner.id}] ` : ""}'You choose first,' says Ms Olwen.`,
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
      ? `Your ${P} from home sniffs the new ${mine.name}. They look at each other. They look at you. Then, at exactly the same moment, they both do a little happy dance. Two of them! `
      : partner
        ? `${P} sniffs ${mine.name}, and the two of them are friends at once. `
        : "";
    nodes.push({
      id: `${p}0`,
      kind: "scene",
      title: `${mine.name}!`,
      icon: { dexId: mine.id },
      bed: { ambience: "house", music: "bright" },
      text: `You choose ${mine.name}. [cry:${mine.id}] It jumps into your arms. ${meeting}Straight away, Juno grabs ${juno.name}. '{smugly} I'll have this one,' says Juno. 'It's the one that beats yours, obviously.' That leaves ${arlo.name} for Arlo. 'Good,' says Arlo. 'That's the one I wanted anyway.' Ms Olwen ticks something on her clipboard. 'Off you go, then,' says Ms Olwen. 'Meet me at the top of the hill for the picnic, with all three ingredients.'`,
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
            goodText(stage, mine, mine.happy[index % mine.happy.length] as string),
            partner && index === 1
              ? twin
                ? `Your ${P} from home cheers its twin on from right beside you.`
                : `${P} cheers ${mine.name} on from right beside you.`
              : "",
            index === 0 ? toldBy("Juno", joke) : "",
            cheer(index, false, misses, mine),
          ]
            .filter(Boolean)
            .join(" "),
          next: last ? id.ending(p, misses) : id.stage(p, index + 1, misses),
        });
        nodes.push({
          id: id.slip(p, index, misses),
          kind: "scene",
          title: `${stage.title}: Got It`,
          icon: { dexId: stage.foe.id },
          bed: stage.bed,
          text: `${slipText(stage, mine, mine.sulk[index % mine.sulk.length] as string, index, juno)} ${cheer(index, true, after, mine)}`,
          next: last ? id.ending(p, after) : id.stage(p, index + 1, after),
        });
      }
    });
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
          ? twinEndingText(band, mine, juno, arlo, owner)
          : withPartner(endingText(band, mine, juno, arlo, owner), band, mine, partner),
        ending: { number, name: twin ? name : `${mine.name}: ${name}`, golden: band === 2 },
      });
    }
  }

  return {
    id: `paldea-${plan.seed}`,
    title: "Paldea Picnic",
    description:
      "Choose Sprigatito, Fuecoco or Quaxly, and gather ingredients for the Great Picnic Sandwich with your classmates Juno and Arlo. Every battle counts towards the picnic at the end.",
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
    `${partner.name} and ${mine.name} share the very last bite, and fall asleep in the sunshine, side by side. [cry:${partner.id}]`,
  ][band] as string;
  return text.replace(/ (\[(?:ending|golden)\])$/, ` ${line} $1`);
}

export function paldeaAdventure(input: AdventureInput): StoryGraph {
  return buildPaldea(planPaldea(input.seed), input.owner ?? "", input.partner);
}
