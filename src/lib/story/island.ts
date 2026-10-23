/**
 * Island Adventure: help Mabel, a young Wailord lost on the beach, swim home across the sea to her
 * family on Moonshell Island, with Captain Brine and his grumpy Pelipper, Gulliver.
 *
 * Every voyage reaches the island. The seven choices on the way test sea sense and Pokémon know-how,
 * and a wrong one never ends the story: it costs time, and Brine says so. When you arrive decides how
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
  "Then the sea starts to glow red. Clouds swirl up into the sky in a great red ring, and something rises out of the water, bigger than anything you've ever seen.";
const LORE =
  "'{whispers} Gigantamax,' whispers Brine. 'Sailors from Galar tell of it. Near a place of power, a Pokémon can grow giant, glowing red, with clouds over its head. And there's an old story that something under Moonshell Island glows like that.'";

const BEACH: Stage = {
  key: "beach",
  title: "Driftwood Beach",
  icon: { dexId: 321 },
  bed: { ambience: "sea", music: "bright" },
  text: `[footsteps] It's early in the morning on Driftwood Beach, and something enormous is lying on the sand. It's a Wailord, as big as a house, and she's singing. ${MABEL} Next to her stands an old sailor with a white beard and a Pelipper sitting on his hat. 'Morning,' says Captain Brine. 'This here is Mabel. She got lost in the night, and the tide went out without her. Her family lives on Moonshell Island, far across the sea, and every evening when the moon comes up, they sing and leap in the lagoon. If we get her home before moonrise, she'll be leaping with them.' Mabel blinks one huge, gentle eye at you, and blows a little fountain of hello. {partner}The Pelipper flaps its wings crossly. 'And that's Gulliver,' says Brine. 'He delivers the post. Don't call him a seagull. Now then, {shipmate}, first things first. How do we get her back in the water?'`,
  good: {
    label: "wait for high tide",
    text: `So you wait. You build a sandcastle, and Gulliver knocks it over. Mabel watches the whole time, humming. Then, slowly, the sea comes creeping back up the beach until she is floating. She sings for joy. ${MABEL} 'All aboard!' says Brine. You climb up her side and sit on her broad blue back, and off you go.`,
  },
  slip: {
    label: "ask some Machamp to push",
    text: `Four Machamp march down the beach and push with all sixteen arms. Mabel giggles, because she's very ticklish, but she doesn't move an inch. A Wailord is one of the heaviest Pokémon there is. In the end you wait for the tide anyway, and half the morning has gone. ${MABEL} 'All aboard!' says Brine. 'And no more Machamp.'`,
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
      text: "The Wingull lead you straight to a busy harbour, because that's where Wingull like to be: anywhere with boats and leftover chips. Mabel tries to squeeze in between the fishing boats. She does not fit. A little girl gives her an ice cream, which she swallows, cone and all, and then it takes ages to turn her round and swim back out to the deep water.",
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
      text: "Mabel races the Mantine, flippers going like windmills. The Mantine wins, of course, by a mile, and does a loop the loop to show off. Mabel is so puffed out that she has to float on her back for ages before she can swim again.",
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
      text: "Mabel swims straight through the Tentacruel. Her skin is ever so thick, so she hardly notices, but they get tangled round her flippers, and untangling them takes forever. One reaches up and stings Brine right on the hat. [fizzle] 'My best hat!' says Brine. 'Sixty years I've had this hat!'",
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
      text: "Round and round you go, faster and faster, Mabel spinning like a top, Brine holding his hat, Gulliver squawking. You come out the other side so dizzy that Mabel swims in circles for an hour, and you're not entirely sure which way is up.",
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
    text: "A thick white fog rolls in, so thick you can't see Gulliver on the end of Brine's hat. Down in the water, a little light begins to glow. It's a Lanturn, a friendly Pokémon with a lamp on its head, blinking hello. And far, far away, so quiet you can hardly hear it, there's a song. '{whispers} Is that Mabel's family?' whispers Brine. 'Or a trick of the fog? Your call.'",
    good: {
      label: "follow the far-off song",
      text: `You listen hard, and steer towards the song. Mabel sings back, ${MABEL} and the Lanturn swims alongside for a while, lighting up the fog like a little lantern, before it waves goodbye and dives back to the deep.`,
    },
    slip: {
      label: "follow the Lanturn's light",
      text: "Mabel follows the Lanturn as it dives, down, down, into the dark. Then up she shoots again like a cork, spluttering and blowing bubbles. Lanturn live in the deep sea, but a Wailord is a whale, and whales have to come up to breathe. [fizzle] By the time she's got her breath back, the song has gone quiet, and you drift in the fog until you hear it again.",
    },
    goodLeft: false,
  },
  {
    key: "starmie",
    title: "Lights in the Mist",
    icon: { dexId: 121 },
    bed: { ambience: "sea", music: "mysterious" },
    text: "A silver mist comes down over the sea, and in it, lights start to flash, red and gold and purple, spinning round and round. They're Starmie, dozens of them, twirling on the waves, and Mabel watches them with wide, shining eyes. And underneath the twinkling, very faint, there's a song. 'Starmie lights are pretty,' says Brine, 'but they go wherever the dance takes them. What'll it be?'",
    good: {
      label: "follow the song",
      text: `You follow the song, and the Starmie twirl out of the way to let Mabel through, flashing goodbye. Mabel sings to them as she passes, ${MABEL} and they spin so fast they glow like little stars.`,
    },
    slip: {
      label: "follow the flashing lights",
      text: "You follow the flashing lights, round to the left, round to the right, round and round, until you realise the Starmie are just dancing in a great big circle, and so are you. Mabel gets so dizzy she starts to hiccup, and it takes ages to find the song again.",
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
      text: `${GLOW} [cry:131] It's a Lapras, but a Lapras as big as a castle, with a shining shell like the northern lights. ${LORE} Mabel isn't scared at all. She swims right up and looks at it, as if she knows it. The giant Lapras bends its long neck down towards you.`,
      good: {
        label: "sing to it with Mabel",
        text: `You sing, and Mabel sings, ${MABEL} and the giant Lapras sings back, a deep, shimmering song that makes the whole sea glow. Then it points its great head towards the horizon, and a path of light opens up across the water, all the way to Moonshell Island.`,
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
      text: `${GLOW} [cry:834] At first you think it's an island, with rocks on top and moss and even a tree. Then the island opens one enormous eye. It's a Drednaw, a giant one, as big as a hill. ${LORE} The giant Drednaw yawns. It looks very sleepy. Mabel looks up at it, and whispers a tiny song.`,
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
      text: `${GLOW} [cry:143] On a sandbank in the middle of the sea lies a Snorlax, a Snorlax so big that a whole little forest is growing on its tummy, and Wingull are nesting in the trees. It's fast asleep, and every snore makes a wave. ${LORE} Mabel giggles. She has never seen anything so silly.`,
      good: {
        label: "tiptoe past and let it sleep",
        text: `You tiptoe past. Well, Mabel tiptoes, which for a Wailord means swimming very, very slowly. Just as you get by, the giant Snorlax lets out the biggest snore of all, and the gust blows you along like a sailing boat. ${MABEL}`,
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
      text: `${GLOW} [cry:12] Out of the red clouds flutters a Butterfree, a giant one, with wings that shimmer like stained glass windows, every colour you can think of. Glittering scales drift down from its wings like snow. ${LORE} 'Careful,' says Brine. 'Butterfree scales make you sleepy.' Mabel gazes up, enchanted.`,
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
      text: `${GLOW} [cry:99] Out of the sea rises a Kingler, a giant one, with one enormous claw that bubbles and foams. Every time it clacks the claw, a cloud of foam bubbles floats up into the sky, each one as big as a house. ${LORE} One huge bubble drifts down towards Mabel. She sniffs it.`,
      good: {
        label: "let the bubble lift you up",
        text: `You let the bubble float down over you, and it lifts Mabel right up out of the water, Brine and Gulliver and all, and carries you across the sea, high over the waves. Mabel is so surprised that she sings the whole way. ${MABEL}`,
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
    text: "The sea turns calm and clear. Below you is a coral reef, full of pink Corsola and silver fish, and Mabel peers down at it, fascinated. Somewhere through it is the way to Moonshell Island. On the sea bed, an old grey Pokémon with a stony face is resting. 'A Relicanth,' says Brine, in a whisper. 'They've been around for a hundred million years. If anyone knows the old way through, it's that one.' But the Corsola are waving at you, and they look like they know everything.",
    good: {
      label: "ask the Relicanth",
      text: "The Relicanth looks at you with one old eye. Then it swims ahead, slowly, through a secret gap in the reef that you would never have found, and out the other side. '{gasps} Well I never,' says Brine. 'A shortcut a hundred million years old.'",
    },
    slip: {
      label: "ask the Corsola",
      text: "The Corsola are delighted to help. They're so delighted that they throw a party, with music and dancing and seaweed cake, and by the end of it nobody can remember what the question was. [cheer] Mabel dances too, which makes a very big wave. In the end, the Relicanth sighs and shows you the way through anyway.",
    },
    goodLeft: true,
  },
  {
    key: "rest",
    title: "Tired Flippers",
    icon: { dexId: 321 },
    bed: { ambience: "sea", music: "calm" },
    text: "Mabel is slowing down. Her flippers are drooping, and her song has gone very quiet. She's only young, and it's been a long day. '{sighs} She's tuckered out,' says Brine, patting her side. 'We could let her float for a bit and sing her a lullaby. Or we could keep going and hope she gets her second wind.'",
    good: {
      label: "sing her a lullaby",
      text: `Mabel floats on the gentle swell, and you sing her the softest song you know. Brine hums along, and even Gulliver tucks his head under his wing. Mabel closes her eyes, just for a few minutes. When she opens them again, she's full of beans, and she swims faster than ever. ${MABEL}`,
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
  text: "The sun is going down, and the sea is turning dark. Far away, you hear the song again, but you can't tell where it's coming from. Mabel stops swimming and listens, her whole huge body still. 'I know an old saying,' says Brine, 'older than me. Where the sea is darkest, sing, and the island will answer.' He clears his throat. 'Well? Do we sing back, or stay quiet and listen?'",
  good: {
    label: "sing back",
    text: `You sing as loudly as you can. Brine sings too, very badly, and Gulliver squawks along. Mabel sings the loudest of all. ${MABEL} From the darkness ahead, a song comes back, and then a light comes on: a lighthouse, on a little island shaped like a moon. Moonshell Island! [fanfare]`,
  },
  slip: {
    label: "stay quiet and listen",
    text: "You stay very quiet and listen. The song gets louder, and then you see them: a whole family of Wailord, gliding past in the dusk, heading home. Mabel calls after them, too late, and too quietly. They don't hear her, and soon they're gone. You follow their trail for a long, long time, until at last a light comes on: a lighthouse, on a little island shaped like a moon. Moonshell Island!",
  },
  goodLeft: true,
};

const ISLAND: Stage = {
  key: "island",
  title: "Moonshell Island",
  icon: { dexId: 357 },
  bed: { ambience: "grass", music: "bright" },
  text: "Waiting on the jetty is a woman with a lantern. '{cheerfully} Hello there!' says Nell. 'I'm the lighthouse keeper. Mabel's family is in the lagoon, on the far side of the island. There are two ways round. There's the jungle path, which is quicker, and there are Tropius in the trees with the sweetest fruit you've ever tasted. Or there's the long way, along the beach, by the water.' Of course, Mabel can't walk through a jungle. Mabel can only swim.",
  good: {
    label: "go the long way, along the beach",
    text: "You walk along the beach, and Mabel swims right beside you, all the way round the island, splashing you every few steps on purpose. On the way, three Sharpedo come circling, with very pointy teeth, but you stay close to Mabel, and they decide she's far too big to bother with.",
  },
  slip: {
    label: "take the jungle path",
    text: "You take the jungle path. The Tropius share their fruit, and it really is the sweetest fruit you've ever tasted. But when you come out on the other side, there's no Mabel. She couldn't follow you through the trees. You have to run all the way back to the jetty to fetch her, and go round by the beach after all.",
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
          "'{excited} Not one wrong turn,' says Brine. 'At this rate, we'll be there before the moon comes up.'",
          "'Right on time,' says Brine, checking his pocket watch.",
          "'Smooth sailing,' says Brine. 'Mabel will be leaping with her family tonight, you mark my words.'",
          "'We're making cracking time,' says Brine.",
          "'{proudly} Still not a single wrong turn,' says Brine. 'Sixty years at sea, and I've never had a better first mate.'",
          "'The sun's still up,' says Brine, 'and so are we.'",
          "'Nearly there,' says Brine. 'And the moon's not up yet.'",
        ][stage] ?? ""
      );
    }
    return "'{cheerfully} That's more like it,' says Brine. 'We're catching up.'";
  }
  return (
    [
      "",
      "'We've lost a bit of time,' says Brine. 'No matter. Plenty of day left.'",
      "'{nervously} The sun's getting low,' says Brine. 'We'd best hurry, or we'll miss the moonrise.'",
      "'{sighs} It'll be dark before we get there,' says Brine. 'But we'll get there. Mabel's not giving up, and neither are we.'",
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

function endingText(slips: number, owner: string, giant: Giant): string {
  const captain = owner ? `you're Captain ${owner}` : "you're a real sea captain";
  return [
    `You come into the lagoon just as the moon rises over Moonshell Island, and there they are: Mabel's family, six huge Wailord, waiting for her. They crowd round, singing and splashing, and blowing fountains into the air. [cheer] Then the water deep below the island begins to glow red, and ${giant.finale}. All at once, the whole Wailord family leaps, Mabel too, right up out of the water and into the moonlight: the biggest Pokémon in the sea, flying, with you on top. Down they come, with the biggest splash there has ever been. Captain Brine is very quiet. 'Sixty years at sea,' says Brine, 'and I've never seen that.' He takes off his old captain's hat and puts it on your head. 'From now on,' says Brine, '${captain}.' Mabel sings to you, and her whole family sings too. ${MABEL} [golden]`,
    `The moon is just coming up as you sail into the lagoon. Mabel's family has already started to leap, but when they hear her song they stop, and turn, and swim to meet her. ${MABEL} Then they sing all together, the loveliest song you've ever heard, while the moon climbs up into the sky, and far out at sea, a red glow answers. Nell brings you a mug of hot chocolate. 'I've never heard them sing like that,' says Nell. 'That's for you, that is.' [ending]`,
    `It's late at night when you get to the lagoon, and Mabel's family is fast asleep, floating like islands in the moonlight. Mabel swims in among them and gives the smallest one a nudge. One by one they wake, and when they see her, they sing so loudly that every light on the island comes on. ${MABEL} 'Well,' says Brine, wiping his eyes, 'that was worth staying up for.' Gulliver delivers a letter. It says thank you, in very big writing. [ending]`,
    `The sky is getting light by the time you reach the lagoon. You've been sailing all night, and everybody is very, very tired, even Gulliver. But Mabel's family has waited up for her, every one of them, and when they see her, they sing a quiet morning song. ${MABEL} Mabel is home. Nell makes you breakfast, and you fall asleep on the beach in the sunshine, with Mabel humming in the water beside you. 'Long way round,' says Brine, with a big yawn. 'But we got her home. That's what counts.' [ending]`,
  ][Math.min(slips, MOST_SLIPS)] as string;
}

/** Turns a plan into the voyage, with the child's name where Brine calls to them. */
export function buildIsland(plan: IslandPlan, seed: number, ownerName = "", partner?: Partner): StoryGraph {
  const owner = ownerName.trim();
  const named = (line: string) => (partner ? line.replaceAll("{P}", partner.name) : "");
  const greeting = partner
    ? `${partner.name} peeks out from behind your legs, then waves hello. [cry:${partner.id}] Mabel blows another fountain, just for ${partner.name}. `
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
        text: [stage.good.text, moment, named(PARTNER_MOMENTS[index] ?? ""), index === 4 ? toldBy("Brine", joke) : "", progressLine(index, false, slips)]
          .filter(Boolean)
          .join(" "),
        next: index < last ? id.choice(index + 1, slips) : id.ending(slips),
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
