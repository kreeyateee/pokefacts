/**
 * Island Adventure: help Mabel, a young Wailord lost on the beach, swim home across the sea to her
 * family on Moonshell Island, with Captain Brine and his grumpy Pelipper, Gulliver.
 *
 * Gentle on purpose: no score and no whistle. The choices test sea sense and Pokémon know-how (whales
 * breathe air, a Wailord pod keeps to deep water, a Wailord cannot walk through a jungle). Two slips are
 * detours that rejoin the voyage; the rest end it early somewhere funny. Nine endings, one golden.
 *
 * Every word is written here. The child's name, when given, is the only thing that changes.
 * Dialogue goes in single quotes with the speaker named beside it, so each line is read in their voice.
 */
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import type { StoryCharacter } from "@/lib/story/story-voices";

export const ISLAND_CAST: StoryCharacter[] = [
  // George, then Bill: an old sailor who tells tall tales that turn out to be true.
  { id: "brine", name: "Brine", voices: ["JBFqnCBsd6RMkjVDRZzb", "pqHfZKP75CvOlQylNhV4"], tempo: 0.94, piper: { pitch: -3, tempo: 0.9 } },
  // Alice, then Matilda: the lighthouse keeper on Moonshell Island.
  { id: "nell", name: "Nell", voices: ["Xb7hH8MSUJpSbSDYk0k2", "XrExE9yKIg1WjnnlVkGX"], tempo: 1.02, piper: { pitch: 2.5, tempo: 1.06 } },
];

/** Mabel's song is the Wailord cry. */
const MABEL = "[cry:321]";

export const ISLAND_ENDINGS = [
  "Harbour Holiday",
  "Bubbles",
  "Lost in the Fog",
  "The Reef Party",
  "Almost Home",
  "Jungle Picnic",
  "Sharpedo Escort",
  "Home at Last",
  "The Big Splash",
] as const;

function ending(number: number, text: string, icon: number, golden = false): StoryNode {
  const name = ISLAND_ENDINGS[number - 1] ?? "The End";
  return {
    id: `end${number}`,
    kind: "ending",
    title: `Ending ${number}: ${name}`,
    icon: { dexId: icon },
    text: `${text} ${golden ? "[golden]" : "[ending]"}`,
    ending: { number, name, golden },
  };
}

/** The voyage, with the child's name where Brine calls to them. */
export function islandAdventure(input: { seed: number; owner?: string }): StoryGraph {
  const owner = (input.owner ?? "").trim();
  const shipmate = owner || "shipmate";
  const captain = owner ? `you're Captain ${owner}` : "you're a real sea captain";

  const nodes: StoryNode[] = [
    {
      id: "start",
      kind: "choice",
      title: "Driftwood Beach",
      icon: { dexId: 321 },
      bed: { ambience: "sea", music: "bright" },
      text: `[footsteps] It's early in the morning on Driftwood Beach, and something enormous is lying on the sand. It's a Wailord, as big as a house, and she's singing. ${MABEL} Next to her stands an old sailor with a white beard and a Pelipper sitting on his hat. 'Morning,' says Captain Brine. 'This here is Mabel. She got lost in the night, and the tide went out without her. Her family lives on Moonshell Island, far across the sea, and she's missing them something terrible.' The Pelipper flaps its wings crossly. 'And that's Gulliver,' says Brine. 'He delivers the post. Don't call him a seagull.' Brine scratches his beard. 'First things first. We need to get her back in the water. How shall we do it, ${shipmate}?'`,
      left: { to: "tide", label: "wait for high tide" },
      right: { to: "push", label: "ask some Machamp to push" },
    },
    {
      id: "push",
      kind: "choice",
      title: "Heave!",
      icon: { dexId: 68 },
      bed: { ambience: "sea", music: "bright" },
      text: "Four Machamp march down the beach and push with all sixteen arms. Mabel giggles, because she's very ticklish. But she doesn't move an inch. A Wailord is one of the heaviest Pokémon there is. 'Told you,' says Brine. 'Heavier than a lighthouse, that one.' The Machamp sit down for a rest. 'Shall we try something else?' says Brine.",
      left: { to: "tide", label: "wait for high tide" },
      right: { to: "push", label: "ask the Machamp to push again" },
    },
    {
      id: "tide",
      kind: "scene",
      title: "All Aboard",
      icon: { dexId: 321 },
      bed: { ambience: "sea", music: "adventure" },
      text: `So you wait. You build a sandcastle, and Gulliver knocks it over. Then, slowly, the sea comes creeping back up the beach, higher and higher, until Mabel is floating. She sings for joy. ${MABEL} 'All aboard!' says Brine. You climb up her side and sit on her broad blue back, and off you go. Brine unrolls an old map. 'Moonshell Island,' says Brine, tapping it. 'Where the Wailord sing. Three days by boat, or one day by Wailord.'`,
      next: "leg1",
    },
    {
      id: "leg1",
      kind: "choice",
      title: "Open Sea",
      icon: { dexId: 278 },
      bed: { ambience: "sea", music: "adventure" },
      text: "Soon there's no land anywhere, just sea and sky. A flock of Wingull swoops past, calling and diving. 'Which way, then?' says Brine. 'Those Wingull are heading somewhere in a hurry. But Mabel keeps looking out towards the deep blue water.'",
      left: { to: "end1", label: "follow the Wingull" },
      right: { to: "deep", label: "head for the deep blue water" },
    },
    {
      id: "deep",
      kind: "choice",
      title: "The Fog",
      icon: { dexId: 171, shadow: true },
      bed: { ambience: "sea", music: "mysterious" },
      text: "Out in the deep blue water, Mabel swims faster and happier. Then a thick white fog rolls in, so thick you can't see Gulliver on the end of Brine's hat. Down in the water, a little light begins to glow. And far, far away, so quiet you can hardly hear it, there's a song. 'Is that Mabel's family?' whispers Brine. 'Or a trick of the fog? Your call.'",
      left: { to: "lamp", label: "follow the light" },
      right: { to: "storm", label: "follow the far-off song" },
    },
    {
      id: "lamp",
      kind: "choice",
      title: "A Light Below",
      icon: { dexId: 171 },
      bed: { ambience: "sea", music: "mysterious" },
      text: "The light belongs to a Lanturn, a friendly Pokémon with a lamp on its head. It blinks hello. Then it swims down, down, into the dark, as if to say, follow me. 'Lanturn live in the deep, deep sea,' says Brine. 'But Mabel's a whale, remember. She has to come up to breathe.'",
      left: { to: "end2", label: "dive after it" },
      right: { to: "end3", label: "say thank you and swim up" },
    },
    {
      id: "storm",
      kind: "choice",
      title: "The Storm",
      icon: { dexId: 73 },
      bed: { ambience: "sea", music: "tense" },
      text: "You follow the song. It gets louder, and the fog melts away. But now the sky turns dark, the wind starts to howl, and straight ahead the sea is full of Tentacruel, hundreds of them, with long stinging arms. 'We could go round them,' says Brine. 'It's further, mind. Or we could go straight through.'",
      left: { to: "sting", label: "go straight through" },
      right: { to: "reef", label: "go round them" },
    },
    {
      id: "sting",
      kind: "scene",
      title: "Ouch",
      icon: { dexId: 73 },
      bed: { ambience: "sea", music: "tense" },
      text: "Mabel swims straight through the Tentacruel. She hardly notices, because a Wailord's skin is ever so thick. But one Tentacruel reaches up and stings Brine right on the hat. [fizzle] 'My best hat!' says Brine. 'Sixty years I've had this hat!' Gulliver laughs so much that he falls off. Next time, maybe go round.",
      next: "reef",
    },
    {
      id: "reef",
      kind: "choice",
      title: "The Reef",
      icon: { dexId: 369 },
      bed: { ambience: "lake", music: "calm" },
      text: "The storm passes, and the sea turns calm and clear. Below you is a coral reef, full of pink Corsola and silver fish. On the sea bed, an old grey Pokémon with a stony face is resting. 'A Relicanth,' says Brine, in a whisper. 'They've been around for a hundred million years. If anyone knows the old way to Moonshell Island, it's that one.' But the Corsola are waving at you, and they look like they know everything.",
      left: { to: "riddle", label: "ask the Relicanth" },
      right: { to: "end4", label: "ask the Corsola" },
    },
    {
      id: "riddle",
      kind: "choice",
      title: "The Old Saying",
      icon: { dexId: 369 },
      bed: { ambience: "sea", music: "magical" },
      text: "The Relicanth looks at you with one old eye. Then it swims a slow circle and points its stony nose at the setting sun. 'I know that one,' says Brine. 'It's an old saying, older than me. Where the sea is darkest, sing, and the island will answer.' As the sun goes down, the sea turns dark, and far away you hear the song again. 'Well?' says Brine. 'Do we sing back, or stay quiet and listen?'",
      left: { to: "island", label: "sing back" },
      right: { to: "end5", label: "stay quiet and listen" },
    },
    {
      id: "island",
      kind: "scene",
      title: "Moonshell Island",
      icon: { dexId: 279 },
      bed: { ambience: "sea", music: "magical" },
      text: `You sing as loudly as you can. Brine sings too, very badly, and Gulliver squawks along. Mabel sings the loudest of all. ${MABEL} From the darkness ahead, a song comes back. Then a light comes on: a lighthouse, on a little island shaped like a moon. It's Moonshell Island! [fanfare] Waiting on the jetty is a woman with a lantern. 'Hello there!' says Nell. 'I'm the lighthouse keeper. I heard you singing all the way from here. Mabel's family is in the lagoon, on the far side of the island.'`,
      next: "path",
    },
    {
      id: "path",
      kind: "choice",
      title: "Two Paths",
      icon: { dexId: 357 },
      bed: { ambience: "grass", music: "bright" },
      text: "Nell knows two ways round the island. 'There's the jungle path,' says Nell. 'It's quicker, and there are Tropius in the trees with the sweetest fruit you've ever tasted. Or there's the long way, along the beach, by the water.' Of course, Mabel can't walk through a jungle. Mabel can only swim.",
      left: { to: "end6", label: "take the jungle path" },
      right: { to: "lagoon", label: "go the long way, along the beach" },
    },
    {
      id: "lagoon",
      kind: "choice",
      title: "The Lagoon",
      icon: { dexId: 319 },
      bed: { ambience: "lake", music: "tense" },
      text: "You walk along the beach, and Mabel swims right beside you, all the way round the island. On the far side is a calm blue lagoon. And in the lagoon is Mabel's family! Six huge Wailord, singing hello. But between you and them, three Sharpedo are circling, with very pointy teeth. 'Steady now,' says Brine, picking up an oar.",
      left: { to: "moon", label: "stay close to Mabel" },
      right: { to: "end7", label: "shoo them away with the oar" },
    },
    {
      id: "moon",
      kind: "choice",
      title: "Full Moon",
      icon: { dexId: 321 },
      bed: { ambience: "lake", music: "magical" },
      text: "You stay close to Mabel, and the Sharpedo decide she's far too big to bother with. They swim away. Mabel glides into the lagoon, and her family crowds round her, singing, splashing, and blowing fountains into the air. [cheer] The full moon rises over Moonshell Island, and the whole family gets ready for something. 'Oh my,' says Nell. 'They're going to jump.'",
      left: { to: "end9", label: "hold on tight" },
      right: { to: "end8", label: "jump in and swim" },
    },
    ending(
      1,
      "You follow the Wingull, and they lead you straight to a busy harbour, because that's where Wingull like to be: anywhere with boats and leftover chips. Mabel tries to squeeze in between the fishing boats. She does not fit. Everybody comes out to look, and a little girl gives her an ice cream, which she swallows, cone and all. 'Well,' says Brine, 'she's having a lovely holiday. Tomorrow we'll set off again, out where the water's deep, where Wailord live.'",
      278,
    ),
    ending(
      2,
      "Mabel dives after the Lanturn. Down she goes, with you holding on to her back, and then up she shoots again like a cork, spluttering and blowing bubbles. Whales need air, after all. [fizzle] You land with a bump on a little sandbank, soaking wet, and Gulliver brings you a towel. 'Well,' says Brine, wringing out his beard, 'at least we're clean.'",
      171,
    ),
    ending(
      3,
      "You wave goodbye to the Lanturn, and Mabel comes up into the fog. But now you can't hear the song at all. You drift all night, round and round, until you bump into a big red buoy. So you have a cosy night there instead, Mabel humming, Brine telling stories, and Gulliver snoring. 'Tomorrow,' says Brine, with a big yawn, 'we listen for the song.'",
      321,
    ),
    ending(
      4,
      "The Corsola are delighted to help. They're so delighted that they throw a party, with music and dancing and seaweed cake, and by the end of it, nobody can remember what the question was. [cheer] Mabel dances too, which makes a very big wave. 'Best party I've been to in fifty years,' says Brine. 'We'll ask the Relicanth in the morning.'",
      222,
    ),
    ending(
      5,
      "You stay very quiet and listen. The song gets louder and louder, and then you see them: a whole family of Wailord, gliding past in the moonlight, heading home. But they don't hear you, and soon they're gone. Mabel lets out a huge sigh. 'Tomorrow,' says Brine, giving her a pat. 'Tomorrow, we sing.'",
      321,
    ),
    ending(
      6,
      "You take the jungle path. The Tropius share their fruit, and it really is the sweetest fruit you've ever tasted. But when you come out on the other side, there's no Mabel. She couldn't follow you through the trees. You find her floating sadly by the jetty, and you give her the biggest bunch of fruit to say sorry. 'The long way round, tomorrow,' says Nell. 'With Mabel.'",
      357,
    ),
    ending(
      7,
      "You wave the oar at the Sharpedo, and they think it's a game! They grab the oar and race off across the lagoon with it. You chase them, they chase you, and by the time everyone is tired out, it's morning. Mabel's family has gone fishing, but Mabel doesn't mind one bit. She's found three new friends with very pointy teeth. 'Never seen a Sharpedo smile before,' says Brine.",
      319,
    ),
    ending(
      8,
      `You jump into the warm water and swim. Mabel and her family leap, and the splash washes you all the way back to the beach, laughing. Mabel is home, and she sings goodnight to you. ${MABEL} Nell brings you a mug of hot chocolate, and Gulliver delivers a letter. It says thank you, in very big writing.`,
      321,
    ),
    ending(
      9,
      `You hold on tight. All at once, the whole family leaps, Mabel too, right up out of the water and into the moonlight: the biggest Pokémon in the sea, flying, with you on top. [cheer] Then down they come, with the biggest splash there has ever been. And for a moment, deep below, something huge and red glows, and then it's gone. Captain Brine is very quiet. 'Sixty years at sea,' says Brine, 'and I've never seen that.' He takes off his old captain's hat and puts it on your head. 'From now on,' says Brine, '${captain}.' Mabel sings to you, and this time her whole family sings too. ${MABEL}`,
      321,
      true,
    ),
  ];

  return {
    id: `island-${input.seed}`,
    title: "Island Adventure",
    description:
      "Ride Mabel the Wailord across the sea with Captain Brine, through fog, storms and coral reefs, to the island where her family sings. Nine endings to find.",
    start: "start",
    nodes,
    cast: ISLAND_CAST,
    slots: owner ? [owner] : [],
  };
}
