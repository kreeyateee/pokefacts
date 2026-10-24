/**
 * Island Adventure: help Mabel, a young Wailord lost on the beach, swim home across the sea to her
 * family on Moonshell Island, with Captain Brine and his grumpy Pelipper, Gulliver.
 *
 * Every voyage reaches the island. The seven choices on the way test sea sense and Pokémon know-how,
 * and a wrong one never ends the story: it costs time, and Brine says so. A good answer after a bad patch
 * wins some of it back, so every ending can be reached, but only a voyage with no slips is golden. When you arrive decides how
 * it ends: before the moon rises (the golden Big Splash), as it rises, late at night, or at dawn.
 *
 * Each voyage is different. The seed picks what you meet on the open water, in the fog and before
 * dark, which Gigantamax Pokémon rises out of the sea (drawn by the red glow under Moonshell Island),
 * and what Mabel gets up to between the choices.
 *
 * A Yoto card cannot count, so the voyage is laid out once for each number of slips so far (none, one,
 * two, three or more), and each choice moves you along the right copy. That fits in 92 tracks.
 *
 * Every word is written here. Dialogue goes in single quotes with the speaker named beside it, so each
 * line is read in that character's voice.
 */
import { drawSample, mulberry32 } from "@/lib/kid-cards";
import { jokesFor, toldBy } from "@/lib/jokes";
import type { AdventureInput, Partner } from "@/lib/story/adventure-route";
import type { StoryGraph, StoryIcon, StoryNode } from "@/lib/story/story-graph";
import type { StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";

export const ISLAND_CAST: StoryCharacter[] = [
  // George, then Bill: an old sailor who tells tall tales that turn out to be true.
  { id: "brine", name: "Brine", voices: ["JBFqnCBsd6RMkjVDRZzb", "pqHfZKP75CvOlQylNhV4"], tempo: 0.94, piper: { pitch: -3, tempo: 0.9 } },
  // Alice, then Matilda: the lighthouse keeper on Moonshell Island.
  { id: "nell", name: "Nell", voices: ["Xb7hH8MSUJpSbSDYk0k2", "XrExE9yKIg1WjnnlVkGX"], tempo: 1.02, piper: { pitch: 2.5, tempo: 1.06 } },
];

/** Mabel's song is the Wailord cry. */
const MABEL = "[cry:321]";

/** Slips are counted up to this; three or more all arrive at dawn. */
export const MOST_SLIPS = 3;

/** By slips at the end: three or more, two, one, none. The golden ending is a voyage with no slips. */
export const ISLAND_ENDINGS = ["The Long Way Home", "Home at Last", "The Moonlight Song", "The Big Splash"] as const;

/** One stop on the voyage: what happens, the question, and what each answer leads to. */
export type Stage = {
  key: string;
  title: string;
  icon: StoryIcon;
  bed: StoryBed;
  text: string;
  good: { label: string; text: string };
  slip: { label: string; text: string };
  /** The good answer is on the left button. */
  goodLeft: boolean;
};

/** A Gigantamax Pokémon that can rise out of the sea. */
export type Giant = { name: string; formId: number; dexId: number; stage: Stage; finale: string };

const GLOW =
  "Then the sea glows red, clouds swirl up in a red ring, and something enormous rises out of the water.";
const LORE =
  "'{whispers} Gigantamax,' whispers Brine. 'Near a place of power, a Pokémon can grow giant and glowing. They say something under Moonshell Island glows just like that.'";

const BEACH: Stage = {
  key: "beach",
  title: "Driftwood Beach",
  icon: { dexId: 321 },
  bed: { ambience: "sea", music: "bright" },
  text: `[footsteps] Early one morning on Driftwood Beach, there's a Wailord on the sand, as big as a house, singing. ${MABEL} Beside her stands an old sailor with a Pelipper on his hat. 'Morning,' says Captain Brine. 'This is Mabel. The tide went out without her. Her family sings in the lagoon on Moonshell Island when the moon comes up. Get her home by moonrise, and she'll sing with them.' Mabel blows a little fountain of hello. {partner}'That's Gulliver on my hat,' says Brine. 'Don't call him a seagull. Now then, {shipmate}, how do we get her back in the water?'`,
  good: {
    label: "wait for high tide",
    text: `So you wait. You build a sandcastle, and Gulliver knocks it over. Then, slowly, the sea creeps back up the beach until Mabel is floating. ${MABEL} 'All aboard!' says Brine, and off you go on her broad blue back.`,
  },
  slip: {
    label: "ask some Machamp to push",
    text: `Four Machamp push with all sixteen arms. Mabel giggles, but doesn't move an inch: a Wailord is one of the heaviest Pokémon there is. In the end you wait for the tide anyway. ${MABEL} 'All aboard!' says Brine. 'And no more Machamp.'`,
  },
  goodLeft: true,
};

/** The open water: one of these, chosen for each voyage. */
const OPEN_WATER: Stage[] = [
  {
    key: "wingull",
    title: "Open Sea",
    icon: { dexId: 278 },
    bed: { ambience: "sea", music: "adventure" },
    text: "Soon there's no land anywhere, just sea and sky. A flock of Wingull swoops past, calling and diving. '{curious} Which way, then?' says Brine. 'Those Wingull are heading somewhere in a hurry. But Mabel keeps looking out towards the deep blue water.'",
    good: {
      label: "head for the deep blue water",
      text: "You point Mabel at the deep blue water, and she's off like a rocket. Wailord live far out in the open sea, where the water is deep enough for a Pokémon their size.",
    },
    slip: {
      label: "follow the Wingull",
      text: "The Wingull lead you to a busy harbour, because Wingull love boats and leftover chips. Mabel does not fit between the fishing boats, and it takes ages to turn her round.",
    },
    goodLeft: false,
  },
  {
    key: "mantine",
    title: "The Race",
    icon: { dexId: 226 },
    bed: { ambience: "sea", music: "adventure" },
    text: "Out on the open sea, a Mantine comes gliding alongside, skimming the waves like a great blue kite. It flaps a fin, as if to say, race you! Mabel's eyes light up. 'Mantine know every current in the sea,' says Brine. 'They ride them like a slide. But that one wants a race.'",
    good: {
      label: "let the Mantine show you the current",
      text: "You let the Mantine lead, and it takes you to a warm current that runs like a river through the sea. Mabel slides into it and whoosh, you're flying along without her lifting a flipper. She sings all the way.",
    },
    slip: {
      label: "race the Mantine",
      text: "Mabel races the Mantine, flippers going like windmills. The Mantine wins by a mile, and Mabel is so puffed out she has to float on her back for ages.",
    },
    goodLeft: true,
  },
  {
    key: "tentacruel",
    title: "The Storm",
    icon: { dexId: 73 },
    bed: { ambience: "sea", music: "tense" },
    text: "The sky turns dark, the wind starts to howl, and straight ahead the sea is full of Tentacruel, hundreds of them, with long stinging arms. Mabel stops, and looks back at you nervously. '{nervously} We could go round them,' says Brine. 'It's further, mind. Or we could go straight through.'",
    good: {
      label: "go round them",
      text: "You go the long way round, and it turns out not to be that long at all. The Tentacruel drift past in the rain, waving their arms, and nobody gets stung. 'Never argue with a Tentacruel,' says Brine.",
    },
    slip: {
      label: "go straight through",
      text: "Mabel swims straight through. The Tentacruel tangle round her flippers, and untangling them takes forever. One stings Brine right on the hat. [fizzle] 'My best hat!' says Brine.",
    },
    goodLeft: false,
  },
  {
    key: "gyarados",
    title: "The Whirlpool",
    icon: { dexId: 130 },
    bed: { ambience: "sea", music: "tense" },
    text: "Ahead, the sea is spinning. A grumpy Gyarados has stirred up an enormous whirlpool, round and round and down, and is lying in the middle of it, sulking. 'We could ride it,' says Brine, 'round the edge and out the other side, quick as you like. Or we could go the long way round.' Mabel looks at the whirlpool. Mabel looks at you.",
    good: {
      label: "go the long way round",
      text: "You steer well clear. The Gyarados watches you go with one cross eye, then goes back to sulking. '{laughs} Never get between a Gyarados and its sulk,' says Brine.",
    },
    slip: {
      label: "ride the whirlpool",
      text: "Round and round you go, Mabel spinning like a top, Gulliver squawking. You come out so dizzy that Mabel swims in circles for an hour.",
    },
    goodLeft: true,
  },
];

/** The fog: one of these. */
const FOG: Stage[] = [
  {
    key: "lanturn",
    title: "The Fog",
    icon: { dexId: 171 },
    bed: { ambience: "sea", music: "mysterious" },
    text: "A thick white fog rolls in. Down in the water, a little light glows: a Lanturn, a friendly Pokémon with a lamp on its head. And far, far away, there's a song. '{whispers} Is that Mabel's family?' whispers Brine. 'Or a trick of the fog? Your call.'",
    good: {
      label: "follow the far-off song",
      text: `You steer towards the song. Mabel sings back, ${MABEL} and the Lanturn lights your way for a while, then waves goodbye.`,
    },
    slip: {
      label: "follow the Lanturn's light",
      text: "Mabel follows the Lanturn down into the dark, then shoots up again like a cork, spluttering. Lanturn live in the deep sea, but a Wailord is a whale, and whales have to come up to breathe. [fizzle] By then the song has gone quiet, and you drift in the fog for ages.",
    },
    goodLeft: false,
  },
  {
    key: "starmie",
    title: "Lights in the Mist",
    icon: { dexId: 121 },
    bed: { ambience: "sea", music: "mysterious" },
    text: "A silver mist comes down, and in it, lights flash red and gold: Starmie, dozens of them, twirling on the waves, and Mabel watches with shining eyes. Underneath, very faint, there's a song. 'Starmie lights are pretty,' says Brine, 'but they go wherever the dance takes them. What'll it be?'",
    good: {
      label: "follow the song",
      text: `You follow the song, and the Starmie twirl aside to let Mabel through. She sings to them as she passes, ${MABEL} and they glow like little stars.`,
    },
    slip: {
      label: "follow the flashing lights",
      text: "You follow the flashing lights, round and round, until you realise the Starmie are dancing in a circle, and so are you. Mabel gets the hiccups, and it takes ages to find the song again.",
    },
    goodLeft: true,
  },
];

/** The giants: one rises out of the sea on every voyage. */
export const GIANTS: Giant[] = [
  {
    name: "Gigantamax Lapras",
    formId: 10204,
    dexId: 131,
    stage: {
      key: "lapras",
      title: "The Giant",
      icon: { formId: 10204 },
      bed: { ambience: "sea", music: "magical" },
      text: `${GLOW} [cry:131] It's a Lapras as big as a castle, with a shell like the northern lights. ${LORE} The giant Lapras bends its long neck down towards Mabel.`,
      good: {
        label: "sing to it with Mabel",
        text: `You sing, and Mabel sings, ${MABEL} and the giant Lapras sings back, so deep the whole sea glows. Then a path of light opens up across the water, all the way to Moonshell Island.`,
      },
      slip: {
        label: "climb onto its giant shell",
        text: "You try to climb onto the giant shell. It's like climbing a slippery mountain. You get halfway up, and then whoosh, you slide all the way down and splash into the sea. Mabel fishes you out with her flipper, and the giant Lapras chuckles and sinks slowly back into the deep.",
      },
      goodLeft: true,
    },
    finale: "the giant Lapras rises up beside them, glowing red and gold, and sings with them",
  },
  {
    name: "Gigantamax Drednaw",
    formId: 10214,
    dexId: 834,
    stage: {
      key: "drednaw",
      title: "The Giant",
      icon: { formId: 10214 },
      bed: { ambience: "sea", music: "magical" },
      text: `${GLOW} [cry:834] At first it looks like an island, with a tree on top. Then the island opens one enormous eye. It's a giant Drednaw. ${LORE} The giant Drednaw yawns at Mabel. It looks very sleepy.`,
      good: {
        label: "sail round it quietly",
        text: `You sail round it ever so quietly. As you pass, the giant Drednaw opens its eye again and gives Mabel a slow, friendly nod, and the swirl of water from its flipper pushes you along, faster than ever. ${MABEL}`,
      },
      slip: {
        label: "land on it for a rest",
        text: "You land on the island for a rest, and Brine puts the kettle on. Then the island dives. Down goes the Drednaw, kettle and all, and up comes everyone else, soaking wet. Mabel has to swim round and round collecting things: Brine's hat, Gulliver's post bag, and the kettle.",
      },
      goodLeft: true,
    },
    finale: "the giant Drednaw lifts up out of the lagoon like a mountain, glowing red, and roars a happy roar",
  },
  {
    name: "Gigantamax Snorlax",
    formId: 10206,
    dexId: 143,
    stage: {
      key: "snorlax",
      title: "The Giant",
      icon: { formId: 10206 },
      bed: { ambience: "sea", music: "magical" },
      text: `${GLOW} [cry:143] On a sandbank lies a Snorlax so big that a little forest grows on its tummy. Every snore makes a wave. ${LORE} Mabel giggles.`,
      good: {
        label: "tiptoe past and let it sleep",
        text: `Mabel tiptoes past, which for a Wailord means swimming very slowly. Then the giant Snorlax lets out its biggest snore, and the gust blows you along like a sailing boat. ${MABEL}`,
      },
      slip: {
        label: "tickle its tummy",
        text: "You tickle its tummy. The giant Snorlax giggles in its sleep, and rolls over, and the wave it makes picks up Mabel and carries her, with all of you on top, all the way back the way you came. It takes a very long time to get back.",
      },
      goodLeft: true,
    },
    finale: "the giant Snorlax wakes up on the beach, glowing red, and claps its enormous hands",
  },
  {
    name: "Gigantamax Butterfree",
    formId: 10198,
    dexId: 12,
    stage: {
      key: "butterfree",
      title: "The Giant",
      icon: { formId: 10198 },
      bed: { ambience: "sea", music: "magical" },
      text: `${GLOW} [cry:12] Out of the clouds flutters a giant Butterfree, with wings like stained glass. Glittering scales drift down like snow. ${LORE} Mabel gazes up. 'Careful,' says Brine. 'Butterfree scales make you sleepy.'`,
      good: {
        label: "cover your eyes and keep going",
        text: `You cover your eyes, and Mabel keeps her head down and swims. The glittering scales settle on her back like stars, and she starts to glow, faintly, all over. She feels so light that she swims twice as fast. ${MABEL}`,
      },
      slip: {
        label: "look up at the sparkles",
        text: "You look up at the sparkles. They're so beautiful. They're so sparkly. They're so... Everyone falls fast asleep, Mabel, Brine, Gulliver and you, floating in the middle of the sea, and you don't wake up until the afternoon.",
      },
      goodLeft: false,
    },
    finale: "the giant Butterfree flutters down over the lagoon, glowing red, and sprinkles the water with stars",
  },
  {
    name: "Gigantamax Kingler",
    formId: 10203,
    dexId: 99,
    stage: {
      key: "kingler",
      title: "The Giant",
      icon: { formId: 10203 },
      bed: { ambience: "sea", music: "magical" },
      text: `${GLOW} [cry:99] Out of the sea rises a giant Kingler. Every clack of its enormous claw sends up foam bubbles as big as houses. ${LORE} One huge bubble drifts down towards Mabel.`,
      good: {
        label: "let the bubble lift you up",
        text: `The bubble floats down over you and lifts Mabel right out of the water, Brine and all, and carries you high over the waves. ${MABEL}`,
      },
      slip: {
        label: "swim through the foam",
        text: "You swim straight into the foam. It's everywhere: up your nose, in your ears, all over Mabel, who looks like a giant cloud. Nobody can see a thing, and it takes ages to blow your way out.",
      },
      goodLeft: true,
    },
    finale: "the giant Kingler rises at the edge of the lagoon, glowing red, and blows bubbles that shine in the moonlight",
  },
];

/** Before dark: one of these. */
const BEFORE_DARK: Stage[] = [
  {
    key: "reef",
    title: "The Reef",
    icon: { dexId: 369 },
    bed: { ambience: "lake", music: "calm" },
    text: "Mabel peers down at a coral reef full of pink Corsola. Somewhere through it is the way to the island. On the sea bed rests an old grey Pokémon. 'A Relicanth,' says Brine, in a whisper. 'If anyone knows the way, it's that one.' But the Corsola are waving, as if they know everything.",
    good: {
      label: "ask the Relicanth",
      text: "The Relicanth looks at Mabel with one old eye, then leads her slowly through a secret gap in the reef. '{gasps} Well I never,' says Brine. 'A shortcut a hundred million years old.'",
    },
    slip: {
      label: "ask the Corsola",
      text: "The Corsola are so delighted to help that they throw a party, with seaweed cake. Mabel dances, which makes a very big wave, and nobody remembers the question. [cheer] In the end, the Relicanth sighs and shows you the way anyway.",
    },
    goodLeft: true,
  },
  {
    key: "rest",
    title: "Tired Flippers",
    icon: { dexId: 321 },
    bed: { ambience: "sea", music: "calm" },
    text: "Mabel is slowing down. Her flippers droop, and her song has gone quiet. '{sighs} She's tuckered out,' says Brine. 'We could let her float and sing her a lullaby. Or we could keep going, and hope she gets her second wind.'",
    good: {
      label: "sing her a lullaby",
      text: `You sing her the softest song you know, and Mabel closes her eyes for a few minutes. When she opens them, she's full of beans. ${MABEL}`,
    },
    slip: {
      label: "keep going",
      text: "You keep going, but Mabel gets slower, and slower, and slower, until she's barely moving at all, and you have to stop and let her rest anyway, for much longer than if you'd stopped in the first place.",
    },
    goodLeft: true,
  },
];

const DARK_SEA: Stage = {
  key: "dark",
  title: "The Dark Sea",
  icon: { dexId: 321 },
  bed: { ambience: "sea", music: "magical" },
  text: "The sun goes down, and the sea turns dark. Far away, you hear the song again. Mabel stops and listens. 'There's an old saying,' says Brine. 'Where the sea is darkest, sing, and the island will answer. Well? Do we sing back, or stay quiet and listen?'",
  good: {
    label: "sing back",
    text: `You all sing as loudly as you can, Brine very badly. ${MABEL} From the darkness, a song comes back, and a light comes on: a lighthouse, on an island shaped like a moon. Moonshell Island! [fanfare]`,
  },
  slip: {
    label: "stay quiet and listen",
    text: "You stay quiet. A family of Wailord glides past in the dusk, and Mabel calls after them, too late. You follow their trail for a long time, until at last a light comes on: a lighthouse, on an island shaped like a moon. Moonshell Island!",
  },
  goodLeft: true,
};

const ISLAND: Stage = {
  key: "island",
  title: "Moonshell Island",
  icon: { dexId: 357 },
  bed: { ambience: "grass", music: "bright" },
  text: "On the jetty waits a woman with a lantern. '{cheerfully} Hello there!' says Nell. 'I'm the lighthouse keeper. Mabel's family is in the lagoon, round the far side. The jungle path is quicker, with the sweetest fruit. Or there's the long way, along the beach.' Of course, Mabel can't walk through a jungle. She can only swim.",
  good: {
    label: "go the long way, along the beach",
    text: "You walk along the beach, and Mabel swims beside you, splashing you on purpose. Three Sharpedo come circling, but you stay close to Mabel, and they decide she's far too big to bother with.",
  },
  slip: {
    label: "take the jungle path",
    text: "You take the jungle path, and the fruit really is the sweetest ever. But on the other side, there's no Mabel. She couldn't follow you through the trees, so you run all the way back and go round by the beach after all.",
  },
  goodLeft: false,
};

/** Little things Mabel does along the way, one after each good choice. */
const MABEL_MOMENTS = [
  "Mabel blows a fountain out of the top of her head, and for a moment there's a little rainbow over you.",
  "Mabel rolls gently onto her side so you can slide down into the sea for a swim, then scoops you back up with her flipper.",
  "Mabel hums a happy tune that makes your toes tingle.",
  "Mabel sneezes. It's like a thunderstorm, only wetter.",
  "Mabel nudges a little pink Luvdisc towards you, as if to say, look, a friend.",
  "Gulliver lands on top of Mabel's head, and she giggles so much the whole sea wobbles.",
  "Mabel does one slow, enormous roll, and everyone holds on tight, laughing.",
  "Mabel turns and looks at you with her huge, kind eye, and blinks, very slowly. Brine says that's how a Wailord says thank you.",
  "Mabel balances Gulliver on the tip of her nose and tosses him up into the air. He pretends to be cross, but he isn't.",
];

/** The child's partner Pokémon on the voyage, after some of the good choices. {P} is its name. */
const PARTNER_MOMENTS: Record<number, string> = {
  1: "{P} sits right at the front of Mabel's head, like a tiny captain.",
  3: "{P} and Gulliver have a staring contest. {P} wins.",
  5: "{P} leans over the side to watch the fish, and Mabel blows a bubble just for it.",
};

/** What Brine says after each choice, by how the voyage is going. */
function progressLine(stage: number, slipped: boolean, slips: number): string {
  if (!slipped) {
    if (slips === 0) {
      return (
        [
          "'{excited} Not one wrong turn,' says Brine.",
          "'Right on time,' says Brine, checking his pocket watch.",
          "'Smooth sailing,' says Brine. 'Mabel will be leaping with her family tonight, you mark my words.'",
          "'We're making cracking time,' says Brine.",
          "'{proudly} Still not a single wrong turn,' says Brine.",
          "'The sun's still up,' says Brine, 'and so are we.'",
          "'Nearly there,' says Brine. 'And the moon's not up yet.'",
        ][stage] ?? ""
      );
    }
    return slips >= 2
      ? "'{cheerfully} That's more like it,' says Brine. 'We're catching up.'"
      : "'{cheerfully} Steady as she goes,' says Brine.";
  }
  return (
    [
      "",
      "'We've lost a bit of time,' says Brine. 'No matter.'",
      "'{nervously} The sun's getting low,' says Brine. 'We'd best hurry.'",
      "'{sighs} It'll be dark before we get there,' says Brine. 'But we'll get there.'",
    ][Math.min(slips, MOST_SLIPS)] ?? ""
  );
}

/** What this voyage meets, chosen from the seed. */
export type IslandPlan = { stages: Stage[]; giant: Giant; moments: string[] };

export function planIsland(seed: number): IslandPlan {
  const random = mulberry32((seed ^ 0x15a1d) >>> 0);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const giant = pick(GIANTS);
  return {
    stages: [BEACH, pick(OPEN_WATER), pick(FOG), giant.stage, pick(BEFORE_DARK), DARK_SEA, ISLAND],
    giant,
    moments: drawSample(MABEL_MOMENTS, MABEL_MOMENTS.length, random),
  };
}

const id = {
  choice: (stage: number, slips: number) => (stage === 0 && slips === 0 ? "start" : `s${stage}m${slips}`),
  good: (stage: number, slips: number) => `s${stage}g${slips}`,
  slip: (stage: number, slips: number) => `s${stage}b${slips}`,
  ending: (slips: number) => `end${ISLAND_ENDINGS.length - Math.min(slips, MOST_SLIPS)}`,
};

/** A good answer after two or more slips makes up one of them. One slip stays: the golden ending needs none. */
function caughtUp(slips: number): number {
  return slips >= 2 ? slips - 1 : slips;
}

function endingText(slips: number, owner: string, giant: Giant): string {
  const captain = owner ? `you're Captain ${owner}` : "you're a real sea captain";
  return [
    `You come into the lagoon just as the moon rises, and there they are: Mabel's family, six huge Wailord, singing and splashing. [cheer] Then the water below the island glows red, and ${giant.finale}. All at once the whole family leaps, Mabel too, up into the moonlight, with you on top, and down they come with the biggest splash there has ever been. Brine takes off his captain's hat and puts it on your head. 'From now on,' says Brine, '${captain}.' ${MABEL} [golden]`,
    `The moon is just coming up as you sail into the lagoon. Mabel's family stops leaping, and swims to meet her. ${MABEL} They sing all together while the moon climbs, and far out at sea, a red glow answers. Nell brings you hot chocolate. 'I've never heard them sing like that,' says Nell. 'That's for you, that is.' [ending]`,
    `It's late at night when you get to the lagoon, and Mabel's family is fast asleep, floating like islands. Mabel nudges the smallest one. One by one they wake, and sing so loudly that every light on the island comes on. ${MABEL} 'Well,' says Brine, wiping his eyes, 'that was worth staying up for.' [ending]`,
    `The sky is getting light when you reach the lagoon. Everybody is very tired, even Gulliver. But Mabel's family has waited up, and they sing a quiet morning song. ${MABEL} Mabel is home. You fall asleep on the beach in the sunshine. 'Long way round,' says Brine, yawning. 'But we got her home. That's what counts.' [ending]`,
  ][Math.min(slips, MOST_SLIPS)] as string;
}

/** Turns a plan into the voyage, with the child's name where Brine calls to them. */
export function buildIsland(plan: IslandPlan, seed: number, ownerName = "", partner?: Partner): StoryGraph {
  const owner = ownerName.trim();
  const named = (line: string) => (partner ? line.replaceAll("{P}", partner.name) : "");
  const greeting = partner
    ? `${partner.name} waves hello. [cry:${partner.id}] `
    : "";
  const shipmate = owner || "shipmate";
  const nodes: StoryNode[] = [];
  const last = plan.stages.length - 1;
  // One joke from Brine on the way, different for each voyage.
  const joke = jokesFor(mulberry32((seed ^ 0x70e) >>> 0))[0] as NonNullable<ReturnType<typeof jokesFor>[number]>;

  plan.stages.forEach((stage, index) => {
    const moment = plan.moments[index] ?? "";
    // At stage n you can have slipped at most n times, counted up to MOST_SLIPS.
    for (let slips = 0; slips <= Math.min(index, MOST_SLIPS); slips += 1) {
      const after = Math.min(slips + 1, MOST_SLIPS);
      const good = { to: id.good(index, slips), label: stage.good.label };
      const slip = { to: id.slip(index, slips), label: stage.slip.label };
      nodes.push({
        id: id.choice(index, slips),
        kind: "choice",
        title: stage.title,
        icon: stage.icon,
        bed: stage.bed,
        text: stage.text.replace("{shipmate}", shipmate).replace("{partner}", greeting),
        left: stage.goodLeft ? good : slip,
        right: stage.goodLeft ? slip : good,
      });
      nodes.push({
        id: id.good(index, slips),
        kind: "scene",
        title: `${stage.title}: Onwards`,
        icon: { dexId: 321 },
        bed: stage.bed,
        // Brine's joke takes the place of Mabel's moment, so the scene stays short.
        text: [stage.good.text, index === 4 ? toldBy("Brine", joke) : moment, named(PARTNER_MOMENTS[index] ?? ""), progressLine(index, false, slips)]
          .filter(Boolean)
          .join(" "),
        // A good answer after a bad patch wins a little time back, but only a perfect voyage is golden.
        next: index < last ? id.choice(index + 1, caughtUp(slips)) : id.ending(caughtUp(slips)),
      });
      nodes.push({
        id: id.slip(index, slips),
        kind: "scene",
        title: `${stage.title}: Onwards`,
        icon: stage.icon,
        bed: stage.bed,
        text: [stage.slip.text, progressLine(index, true, after)].filter(Boolean).join(" "),
        next: index < last ? id.choice(index + 1, after) : id.ending(after),
      });
    }
  });

  for (let slips = MOST_SLIPS; slips >= 0; slips -= 1) {
    const number = ISLAND_ENDINGS.length - slips;
    const name = ISLAND_ENDINGS[number - 1] as string;
    nodes.push({
      id: id.ending(slips),
      kind: "ending",
      title: `Ending ${number}: ${name}`,
      icon: slips === 0 ? { formId: plan.giant.formId } : { dexId: 321 },
      bed: { ambience: "lake", music: slips === 0 ? "magical" : "calm" },
      text: withPartner(endingText(slips, owner, plan.giant), partner, slips === 0),
      ending: { number, name, golden: slips === 0 },
    });
  }

  return {
    id: `island-${seed}`,
    title: "Island Adventure",
    description:
      "Ride Mabel the Wailord across the sea with Captain Brine, past a giant Gigantamax Pokémon, to the island where her family sings. Every voyage is different, and every choice changes when you arrive.",
    start: "start",
    nodes,
    cast: ISLAND_CAST,
    slots: owner ? [owner] : [],
  };
}

/** The partner at the very end, just before the closing sound. */
function withPartner(text: string, partner: Partner | undefined, golden: boolean): string {
  if (!partner) return text;
  const line = golden
    ? `And ${partner.name}, right there beside you, has the best night of its whole life. [cry:${partner.id}]`
    : `${partner.name} curls up beside you, very happy, and very sleepy.`;
  return text.replace(/ (\[(?:ending|golden)\])$/, ` ${line} $1`);
}

export function islandAdventure(input: AdventureInput): StoryGraph {
  return buildIsland(planIsland(input.seed), input.seed, input.owner ?? "", input.partner);
}
