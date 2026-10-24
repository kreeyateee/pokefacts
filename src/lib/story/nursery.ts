/**
 * Pokémon Nursery: a cosy adventure for younger children, about three to five. Your favourite Pokémon
 * (Pikachu without one) and you help Nurse Poppy look after five baby Pokémon. Each baby needs
 * something: it is sleepy, hungry, chilly, bored, muddy, can't find its toy, or the thunder is too loud.
 * Both buttons are kind ways to help, one cosy and one playful, and every baby ends up happy. Poppy
 * tells one simple fact about each baby, and how you helped picks the happy ending.
 *
 * Sentences are short, there are no battles, and the first question comes in a few seconds.
 */
import { mulberry32 } from "@/lib/kid-cards";
import type { AdventureInput } from "@/lib/story/adventure-route";
import { DEFAULT_PARTNER } from "@/lib/story/lost";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import type { StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";
import { YOTO_ICONS } from "@/lib/yoto-icons";

/** Babies to look after. */
export const NURSERY_ROUNDS = 5;

/** Cosy choices are counted up to this. Four or more is a cuddle pile. */
const MOST_COSY = 4;

export const NURSERY_ENDINGS = ["Nursery Party", "Best of Both", "Cuddle Pile"] as const;

export const NURSERY_CAST: StoryCharacter[] = [
  // Laura, then Jessica: soft and kind.
  { id: "poppy", name: "Poppy", pronoun: "she", voices: ["FGY2WhTYpPnrIDTdsKH5", "cgSgspJ2msm6clMCkdW9"], tempo: 0.95, piper: { pitch: 3, tempo: 0.95 }, mood: "cheerfully" },
];

/** Baby Pokémon, with something sweet they do and one simple fact. */
const BABIES = [
  { id: 172, name: "Pichu", does: "Its little ears twitch.", fact: "Pichu is so small, its own sparks make it jump." },
  { id: 173, name: "Cleffa", does: "It twinkles like a little star.", fact: "Cleffa is shaped like a star. Some say it came from space." },
  { id: 174, name: "Igglybuff", does: "It bounces like a jelly.", fact: "Igglybuff is soft and squishy, so it bounces everywhere." },
  { id: 175, name: "Togepi", does: "It wobbles in its shell.", fact: "Togepi's shell is full of happiness. It shares it with kind people." },
  { id: 298, name: "Azurill", does: "It bounces on its big round tail.", fact: "Azurill can bounce on its tail like a ball." },
  { id: 440, name: "Happiny", does: "It cuddles a round white stone.", fact: "Happiny carries a round stone. It looks after it like an egg." },
  { id: 446, name: "Munchlax", does: "It pats its round tummy.", fact: "Munchlax hides snacks in its long fur." },
  { id: 447, name: "Riolu", does: "It waves a little paw.", fact: "Riolu can tell how you are feeling." },
  { id: 406, name: "Budew", does: "Its green bud wiggles.", fact: "Budew's bud opens when the weather gets warm." },
  { id: 238, name: "Smoochum", does: "It blows you a kiss.", fact: "Smoochum touches things with its lips to find out about them." },
  { id: 360, name: "Wynaut", does: "It sways and smiles.", fact: "Wynaut lives in big groups and loves to cuddle up close." },
  { id: 438, name: "Bonsly", does: "It pretends to be a little tree.", fact: "Bonsly likes dry places. It sways like a tree to hide." },
  { id: 433, name: "Chingling", does: "It jingles like a bell.", fact: "Chingling has a little ball in its mouth that rings." },
] as const;

type Baby = (typeof BABIES)[number];

/** What a baby needs, and two kind ways to help: one cosy, one playful. */
type Need = {
  key: string;
  problem: (name: string) => string;
  cosy: { label: string; text: (name: string) => string };
  fun: { label: string; text: (name: string) => string };
};

const NEEDS: readonly Need[] = [
  {
    key: "sleepy",
    problem: (name) => `${name} rubs its eyes and yawns. It's sleepy.`,
    cosy: { label: "tuck it in", text: (name) => `You tuck ${name} under a soft blanket. Snug as a bug. ${name} snuggles down.` },
    fun: { label: "sing a lullaby", text: (name) => `You sing a soft lullaby. La la lu. ${name} sways, then its eyes close.` },
  },
  {
    key: "hungry",
    problem: (name) => `${name}'s tummy goes rumble, rumble. It's hungry.`,
    cosy: { label: "share a sweet berry", text: (name) => `You share a sweet berry. Munch, munch. ${name} licks its lips.` },
    fun: { label: "make tiny pancakes", text: (name) => `You make tiny pancakes. Flip, flip! ${name} gobbles them up.` },
  },
  {
    key: "toy",
    problem: (name) => `${name} looks all around. It can't find its favourite toy.`,
    cosy: { label: "look under the cushions", text: (name) => `You look under the cushions. There it is! A squishy teddy. ${name} hugs it tight.` },
    fun: { label: "look in the toy box", text: (name) => `You dig in the toy box. Rattle, rattle. There it is! A squeaky ball. ${name} hugs it tight.` },
  },
  {
    key: "chilly",
    problem: (name) => `${name} shivers. Brrr! It's chilly.`,
    cosy: { label: "give it a cuddle", text: (name) => `You give ${name} a big warm cuddle. Ahh. Toasty and warm.` },
    fun: { label: "do a warm-up dance", text: (name) => `You do a warm-up dance together. Hop, hop, hop! Now ${name} is nice and warm.` },
  },
  {
    key: "bored",
    problem: (name) => `${name} sighs a big sigh. It wants something to do.`,
    cosy: { label: "read a picture book", text: (name) => `You read a picture book together. ${name} points at every Pokémon.` },
    fun: { label: "blow bubbles", text: (name) => `You blow big bubbles. Pop, pop, pop! ${name} chases every one.` },
  },
  {
    key: "thunder",
    problem: (name) => `Rumble! Thunder outside. ${name} hides its face.`,
    cosy: { label: "hold its paw", text: (name) => `You hold ${name}'s paw. Poppy whispers. '{whispers} It's only noise.' ${name} feels brave.` },
    fun: { label: "build a blanket fort", text: (name) => `You build a blanket fort. ${name} creeps inside. Safe and snug.` },
  },
  {
    key: "muddy",
    problem: (name) => `${name} has been playing in the mud. Splodge!`,
    cosy: { label: "brush it clean", text: (name) => `You brush ${name} with a soft brush. Swish, swish. All clean and fluffy.` },
    fun: { label: "give it a bubble bath", text: (name) => `You run a bubble bath. Splish, splash! ${name} wears a bubble hat.` },
  },
];

const THANKS = ["Thank you!", "Lovely!", "So kind!", "Well done!", "Aww!"];

export type NurseryPlan = {
  seed: number;
  owner: string;
  partner: { id: number; name: string };
  babies: Baby[];
  needs: Need[];
  /** For each round, whether the cosy choice is the left button. */
  cosyLeft: boolean[];
};

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap] as T, out[index] as T];
  }
  return out;
}

export function planNursery(input: AdventureInput): NurseryPlan {
  const random = mulberry32((input.seed ^ 0xb4b7) >>> 0);
  const partner = input.partner ?? DEFAULT_PARTNER;
  return {
    seed: input.seed,
    owner: input.owner ?? "",
    partner,
    babies: shuffled(BABIES.filter((baby) => baby.id !== partner.id), random).slice(0, NURSERY_ROUNDS),
    needs: shuffled(NEEDS, random).slice(0, NURSERY_ROUNDS),
    cosyLeft: Array.from({ length: NURSERY_ROUNDS }, () => random() < 0.5),
  };
}

const id = {
  round: (round: number, cosy: number) => (round === 0 ? "start" : `r${round}c${cosy}`),
  cosy: (round: number, cosy: number) => `r${round}c${cosy}a`,
  fun: (round: number, cosy: number) => `r${round}c${cosy}b`,
  ending: (number: number) => `end${number}`,
};

function endingFor(cosy: number): number {
  return cosy <= 1 ? 1 : cosy <= 3 ? 2 : 3;
}

/** Turns a plan into the nursery day. Pure: the same plan always gives the same story. */
export function buildNursery(plan: NurseryPlan): StoryGraph {
  const P = plan.partner.name;
  const owner = plan.owner.trim();
  const you = owner || "friend";
  const nodes: StoryNode[] = [];
  const bed: StoryBed = { ambience: "house", music: "homely" };
  const opening = `Hello! [cry:${plan.partner.id}] You and ${P} visit the Pokémon Nursery. [footsteps] Nurse Poppy smiles. '{cheerfully} Hello, ${you}! The baby Pokémon need some help today.'`;

  for (let round = 0; round < NURSERY_ROUNDS; round += 1) {
    const baby = plan.babies[round] as Baby;
    const need = plan.needs[round] as Need;
    const last = round === NURSERY_ROUNDS - 1;
    for (let cosy = 0; cosy <= Math.min(round, MOST_COSY); cosy += 1) {
      const more = Math.min(cosy + 1, MOST_COSY);
      const meet = `[cry:${baby.id}] Aww, it's baby ${baby.name}! ${baby.does} ${need.problem(baby.name)} Poppy asks. 'How shall we help?'`;
      const cosyChoice = { to: id.cosy(round, cosy), label: need.cosy.label };
      const funChoice = { to: id.fun(round, cosy), label: need.fun.label };
      const left = plan.cosyLeft[round] as boolean;
      nodes.push({
        id: id.round(round, cosy),
        kind: "choice",
        title: `Baby ${baby.name}`,
        icon: { dexId: baby.id },
        bed,
        text: round === 0 ? `${opening} ${meet}` : meet,
        left: left ? cosyChoice : funChoice,
        right: left ? funChoice : cosyChoice,
      });
      // Milk and biscuits after the third baby: a little treat on the way.
      const treat = round === 2 ? ` Then it's milk and biscuits for everyone. Slurp, slurp.` : "";
      const happy = (tag: string) =>
        `[cry:${baby.id}] ${baby.name} is happy. [cheer] ${P} gives it a gentle nuzzle. Poppy smiles. '${tag}${THANKS[round] ?? "Thank you!"} Did you know? ${baby.fact}'${treat}`;
      nodes.push({
        id: id.cosy(round, cosy),
        kind: "scene",
        title: `${baby.name}: All Cosy`,
        icon: { dexId: baby.id },
        bed,
        text: `${need.cosy.text(baby.name)} ${happy("")}`,
        next: last ? id.ending(endingFor(more)) : id.round(round + 1, more),
      });
      nodes.push({
        id: id.fun(round, cosy),
        kind: "scene",
        title: `${baby.name}: What Fun`,
        icon: { dexId: baby.id },
        bed,
        text: `${need.fun.text(baby.name)} ${happy("{giggles} ")}`,
        next: last ? id.ending(endingFor(cosy)) : id.round(round + 1, cosy),
      });
    }
  }

  const babyCries = plan.babies.map((baby) => `[cry:${baby.id}]`).slice(0, 3).join(" ");
  const endings = [
    `The babies want a party! Everyone dances round the nursery. ${babyCries} [cheer] Poppy gives ${P} a party hat. '{laughs} What fun!' Bye bye, little ones. [ending]`,
    `Poppy has two stickers. A heart for cuddles, and a star for fun. [badge] They are both for you and ${P}! [cry:${plan.partner.id}] '{proudly} You did everything!' Bye bye, little ones. [golden]`,
    `The babies all snuggle up in one big cuddle pile. ${babyCries} Poppy whispers. '{whispers} Shh. They're fast asleep. Thank you, ${you}.' [badge] Bye bye, little ones. [ending]`,
  ];
  endings.forEach((text, index) => {
    const number = index + 1;
    const golden = number === 2;
    nodes.push({
      id: id.ending(number),
      kind: "ending",
      title: `Ending ${number}: ${NURSERY_ENDINGS[index]}`,
      icon: golden ? { yoto: YOTO_ICONS.celebrate } : { dexId: plan.partner.id },
      bed: { ambience: "house", music: golden ? "magical" : "calm" },
      text,
      ending: { number, name: NURSERY_ENDINGS[index] as string, ...(golden ? { golden: true } : {}) },
    });
  });

  return {
    id: `nursery-${plan.seed}`,
    title: "Pokémon Nursery",
    description: `${P} and you help Nurse Poppy look after five baby Pokémon. Every choice is a kind one.`,
    start: "start",
    nodes,
    cast: NURSERY_CAST,
    slots: [P, ...plan.babies.map((baby) => baby.name), ...(owner ? [owner] : [])],
  };
}

export function nurseryAdventure(input: AdventureInput): StoryGraph {
  return buildNursery(planNursery(input));
}
