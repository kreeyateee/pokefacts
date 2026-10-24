/**
 * Everything the Safari Zone narrator says, written by hand. The adventure only picks lines and fills gaps.
 *
 * A cue in square brackets plays a sound there: [catch] is the Poké Ball's three wobbles and click.
 * Dialogue goes in single quotes, and each character's lines are read in their own voice.
 *
 * Gaps look like {name}. Each pool lists the gaps it may use:
 *   {home} {homeAt}     where the Pokémon lives: "the lake", "by the lake"
 *   {decoy} {decoyAt}   the wrong place
 *   {Home} {HomeAt} {Decoy}  the same with a capital, to start a sentence
 *   {type}              "Fire"
 *   {a}                 the Pokémon with "a" or "an": "a Snorlax"
 *   {colour} {other}    spot stop colours: the one you crept up on, and the other one
 *   {owner}             the child's name, or "trainer"
 *
 * Marigold is the head warden: forty years in the job, a hat that is far too big, mud to the knees,
 * and no patience for show-offs. Barnaby is the rival: spotless jacket, gold Safari Ball, always one step
 * ahead and always telling you so. The child is "you". Every line is short enough to say in one breath.
 */
import type { SafariArea, SafariThrow } from "@/lib/story/safari";

export type AreaWords = {
  /** "the lake", after "head for". */
  place: string;
  /** "by the lake". */
  at: string;
  /** What you notice on arriving. One is picked per visit. */
  arrive: readonly string[];
  /** Searching it when nothing is there. */
  empty: readonly string[];
};

export const AREAS: Record<SafariArea, AreaWords> = {
  cave: {
    place: "the dark cave",
    at: "in the dark cave",
    arrive: [
      "Inside the cave it's cold and drippy. Plink. Plonk. Your torch makes the shadows jump.",
      "The cave breathes out cold air at you. Every footstep echoes back three times.",
      "Deep in the cave, the walls glitter with crystals, and somewhere water is dripping into a pool.",
    ],
    empty: [
      "You search the dark cave. You find dripping water, a lot of echoes, and one very cold nose.",
      "You feel your way into the dark cave. You find a low bit of ceiling, with your head. Ouch.",
    ],
  },
  forest: {
    place: "the forest",
    at: "in the forest",
    arrive: [
      "The forest is green and gold and full of birdsong, and sunlight drops through the leaves in patches.",
      "Under the trees it smells of moss and mushrooms. A woodpecker is drumming somewhere.",
      "Deep in the forest, the old trees creak like doors.",
    ],
    empty: [
      "You search the forest. You find a great many leaves, and a sticky web in your hair.",
      "You search the forest. You find an acorn. Then another acorn. Then a truly enormous number of acorns.",
    ],
  },
  grassland: {
    place: "the long grass",
    at: "in the long grass",
    arrive: [
      "The long grass is taller than you, and it hums with crickets.",
      "The meadow is bright with flowers, and the grass swishes against your knees.",
      "A warm breeze sends ripples through the long grass, like waves on a green sea.",
    ],
    empty: [
      "You search the long grass. You find grass up to your nose, and a very big sneeze.",
      "You search the long grass. You find someone's picnic, and a line of ants who got there first.",
    ],
  },
  mountain: {
    place: "the mountain path",
    at: "up on the mountain",
    arrive: [
      "The mountain path is steep and stony, and the wind up here tugs at your coat.",
      "Up on the mountain the air is thin and cold, and pebbles skitter away under your boots.",
      "Halfway up the mountain, the whole Safari Zone is spread out below you like a map.",
    ],
    empty: [
      "You climb the mountain path. You find rocks, more rocks, and a gust of wind that nearly steals Marigold's hat.",
      "You climb the mountain path. Halfway up, you remember your sandwiches are at the bottom.",
    ],
  },
  "rough-terrain": {
    place: "the dusty canyon",
    at: "in the dusty canyon",
    arrive: [
      "The canyon is hot and dry, and the red rocks are warm to touch.",
      "In the canyon, the dust gets in your teeth, and the sun bounces off every rock.",
      "Your boots crunch on the canyon floor, and a hot wind whistles through the gaps in the rocks.",
    ],
    empty: [
      "You search the dusty canyon. You find dust, more dust, and a boulder that looks a bit like Marigold.",
      "You search the dusty canyon. You find a cactus. The hard way.",
    ],
  },
  sea: {
    place: "the seashore",
    at: "by the sea",
    arrive: [
      "Waves are rolling up the beach, and the air tastes of salt.",
      "The wind by the sea is wild, and the rock pools are full of tiny crabs.",
      "The sea is sparkling, and seaweed pops under your boots.",
    ],
    empty: [
      "You search the seashore. You find a lot of splashing, and one very wet sock.",
      "You search the seashore. You find a shell. There's a tiny crab in it, and the crab would like you to go away.",
    ],
  },
  urban: {
    place: "the old rest house",
    at: "by the old rest house",
    arrive: [
      "The old rest house has a mossy roof, a wonky chimney, and a sign that says No Running.",
      "Round the back of the old rest house there are bins, a washing line, and a smell of toast.",
      "The old rest house is quiet. A kettle is whistling somewhere inside.",
    ],
    empty: [
      "You search the old rest house. You find a kettle, a comfy chair, and a sign that says No Running.",
      "You search the old rest house. You find Marigold's spare hat. It's even bigger than her normal one.",
    ],
  },
  "waters-edge": {
    place: "the lake",
    at: "by the lake",
    arrive: [
      "The lake is calm and glassy, and dragonflies zip between the reeds.",
      "At the edge of the lake the mud squelches, and frogs plop into the water as you pass.",
      "Mist hangs over the lake, and the reeds whisper in the breeze.",
    ],
    empty: [
      "You search the lake. You find squelchy mud, a lost bucket, and a frog who thinks you're very rude.",
      "You search the lake. Your boot gets stuck in the mud, and it takes both of you to pull it out.",
    ],
  },
};

/**
 * The clue that starts an area stop: what the Pokémon left behind, and its type.
 * Only types whose home is easy to reason about are here, each with the places they would never be.
 */
export const TYPE_SIGNS: Readonly<Record<string, { signs: readonly string[]; never: readonly SafariArea[] }>> = {
  Normal: {
    signs: [
      "There are paw prints in the mud, and a half-eaten berry. Nothing fancy. A Normal type came this way.",
      "Something has chewed a hole in the fence. Marigold sniffs. 'Normal type,' she says. 'No doubt about it.'",
    ],
    never: ["sea", "waters-edge"],
  },
  Fire: {
    signs: [
      "A patch of ground is scorched black, and the stones in the middle are still warm. A Fire type has been here.",
      "There's a smell of bonfires, and a curl of smoke rising from a burnt log. A Fire type has passed by.",
    ],
    never: ["sea", "waters-edge", "cave"],
  },
  Water: {
    signs: [
      "There are wet footprints on a dry rock, still dripping. A Water type was here moments ago.",
      "A trail of puddles leads away from the path, and it hasn't rained all week. Something Water type.",
    ],
    never: ["mountain", "rough-terrain"],
  },
  Grass: {
    signs: [
      "The flowers by the path have all turned to face the same way, and there's a sweet smell in the air. A Grass type is near.",
      "A trail of leaves and seeds leads off the path. Marigold whispers, '{whispers} Grass type.'",
    ],
    never: ["cave", "mountain"],
  },
  Bug: {
    signs: [
      "There's a silky thread across the path, and a leaf with neat little bites out of it. A Bug type has been here.",
      "You hear buzzing, and chirping, and a tiny click, click, click. 'Bug type,' says Marigold.",
    ],
    never: ["sea", "cave", "rough-terrain"],
  },
  Rock: {
    signs: [
      "There's a trail of crumbly gravel, as if a rock went for a walk. A Rock type.",
      "A boulder on the path has moved. Boulders don't usually move. 'Rock type,' says Marigold.",
    ],
    never: ["grassland"],
  },
  Ground: {
    signs: [
      "Someone has dug a big hole, and there's fresh soil everywhere. A Ground type has been digging.",
      "The earth is all churned up, as if something tunnelled underneath. Ground type.",
    ],
    never: ["sea"],
  },
  Ice: {
    signs: [
      "There's frost on the leaves, in the middle of the day. An Ice type has been through here.",
      "Your breath turns to clouds, and a puddle has frozen solid. 'Ice type,' says Marigold, shivering.",
    ],
    never: ["rough-terrain", "grassland"],
  },
  Fighting: {
    signs: [
      "A tree trunk has been thumped so hard there's a fist-shaped dent in it. A Fighting type has been training.",
      "A log has been chopped clean in half. With a hand. Marigold whistles. 'Fighting type.'",
    ],
    never: ["sea", "cave"],
  },
  Ghost: {
    signs: [
      "It goes cold all of a sudden, and you hear a giggle with nobody there. A Ghost type is about.",
      "Something taps you on the shoulder. Nobody's there. '{nervously} Ghost type,' says Marigold, not quite calmly.",
    ],
    never: ["grassland", "sea"],
  },
};

/** How it moves, from its Speed. Fast ones bolt; slow ones don't. */
export const FAST_LINES = [
  "It flinches at every little sound. One snap of a twig and it would be gone.",
  "It's never still for more than a second.",
  "Every time the wind blows, it twitches, ready to be off like a shot.",
  "A leaf drops nearby, and it spins round before the leaf even lands.",
  "It looks ready to bolt at the slightest noise.",
  "Its eyes keep darting about, quick as a flash.",
];

export const SLOW_LINES = [
  "It's in no hurry at all. Nothing about it is in a hurry.",
  "It moves as if it has all the time in the world.",
  "A twig snaps behind it, and it turns round. Slowly. Very slowly.",
  "It takes a whole minute to scratch its nose.",
  "It doesn't look as if it could run if it wanted to, and it doesn't want to.",
  "A leaf lands on its head, and it takes a long while to notice.",
];

// ---------------------------------------------------------------------------
// The start

/** `partner` is the child's partner Pokémon, if they have one. It walks the Safari with them. */
export function introText(owner: string, partner?: { id: number; name: string }): string {
  return [
    "Welcome to the Safari Zone! [gate] The big wooden gate creaks open.",
    `A woman in an enormous hat stomps over. 'Marigold,' she says. 'Head warden. Morning, ${owner}.'`,
    partner ? `She spots ${partner.name}. [cry:${partner.id}] 'Your partner can come, as long as it stays close.'` : "",
    "Behind her, a boy in a spotless jacket is polishing a gold Safari Ball.",
    "'That's Barnaby,' Marigold mutters. 'He says he'll catch more than you today.'",
    "'{smugly} I don't say it,' says Barnaby. 'I know it.'",
    "'Five stops,' says Marigold. 'Finish the day ahead of Barnaby, and something very special comes out to meet you. Want my quick lesson on throwing first?'",
  ].join(" ");
}

export const LESSON_TEXT = [
  "Marigold takes you to a pond. A small Pokémon is nibbling a crust, not caring who's watching. She lobs a ball. [throw] [catch]",
  "'Common ones, just throw the ball,' she says. 'Rare ones are shy. Rare and fast? Bait. Nobody runs while they're chewing. Rare and slow? A rock beside it. Off you go.'",
].join(" ");

/** The lesson choice. Replays skip straight in. */
export const LESSON_LABELS = { hear: "hear the lesson", skip: "skip it and set off" };

// ---------------------------------------------------------------------------
// Getting to each stop

export const FIRST_OPENERS = [
  "Marigold marches off down the path. You jog to keep up.",
  "The gate clangs shut behind you. 'Right,' says Marigold. 'Stop one.'",
  "You set off down the first path. Barnaby has already gone, of course.",
];

export const MIDDLE_OPENERS = [
  "The path winds on, past a signpost nibbled almost in half.",
  "Marigold stops so suddenly that you walk into her. She points at the ground.",
  "You cross a wobbly wooden bridge. It creaks the whole way.",
  "A breeze picks up, and Marigold grabs her hat just in time.",
  "The path forks. One sign says This Way. The other says No, This Way.",
  "You climb over a stile. Marigold climbs over it faster than you.",
];

export const LAST_OPENERS = [
  "The sun is getting low. 'Last stop,' says Marigold. 'Make it count.'",
  "The shadows are long now. 'One more,' says Marigold.",
  "You can see the gate from here. But Marigold is pointing. One last stop.",
];

/** Barnaby, always one step ahead. Shown at some of the stops. */
export const BARNABY_LINES = [
  "Barnaby jogs past. '{smugly} Got another one!' he calls, and nearly drops his gold Safari Ball.",
  "There's a splash up ahead. Barnaby has fallen in a stream. 'Meant to do that,' he says, and squelches off.",
  "A note on a tree says: Barnaby was here first. Ha ha. Marigold tears it down.",
  "Barnaby zooms past on a bike. '{shouts} I'm winning!' he shouts. Bikes are not allowed.",
  "Barnaby is sitting on a log with a sandwich. '{smugly} Oh, are you still going?' he says.",
  "Barnaby pops up from behind a bush. '{laughs} Boo,' he says, and pops back down again.",
];

/** The end of an area stop's clue, just before the choice. */
export const WHERE_LINES = [
  "'So,' says Marigold. 'Where would a {type} type go?'",
  "'Which way would a {type} type pick?' says Marigold.",
  "'You tell me,' says Marigold. 'Where does a {type} type live?'",
  "'{whispers} Think like a {type} type,' whispers Marigold.",
];

/** A spot stop: two Pokémon, and only one is rare. The cry plays first. */
export const SPOT_LINES = [
  "Two Pokémon are {homeAt}, and one is rare.",
  "{HomeAt}, two Pokémon are minding their own business.",
  "Marigold pulls you down behind a bush. {HomeAt}, there are two Pokémon.",
];

/** The tell: a rare one is shy, a common one doesn't care. Marigold says so at every spot stop. */
export const SPOT_ASK = [
  "'{whispers} Rare ones are shy,' whispers Marigold.",
  "'{whispers} Creep up on the shy one,' whispers Marigold.",
  "'Rare ones peek,' whispers Marigold. 'Which one?'",
];

/** How the rare one at a spot stop behaves: shy. Said after its colour and what it's doing. */
export const SHY_LINES = ["and it's peeking at you, shy", "and it ducks down when you move", "and it's watching you, shy"];

/** How the common one at a spot stop behaves: it couldn't care less. */
export const CARELESS_LINES = ["and it doesn't care who's watching", "and it hasn't noticed you", "and it's too busy to look up"];

// ---------------------------------------------------------------------------
// Close up, and throwing

/** Straight after the cry, when you picked the right place. */
export const FOUND_LINES = [
  "That was its cry. You've come to the right place.",
  "You hear it before you see it. Good choice.",
  "Marigold grins at you. 'Well found.'",
];

/** At an area stop, whether the one you found is common or rare, so the throw is fair. */
export const RARITY_LINES: Record<"common" | "rare", readonly string[]> = {
  common: ["'Oh, you see those everywhere,' says Marigold. 'A common one.'", "It doesn't care one bit who's watching. A common one."],
  rare: ["'{gasps} A rare one,' whispers Marigold.", "It peeks at you, very shy. A rare one."],
};

/** Marigold's rule, said before every throw. */
export const RULE_LINES = [
  "'{whispers} Common, ball. Rare and fast, bait. Rare and slow, rock,' whispers Marigold.",
  "Remember Marigold's rule: common, ball. Rare and fast, bait. Rare and slow, rock.",
];

/** After picking the rare one at a spot stop. {colour} is the rare one. */
export const SPOTTED_LINES = [
  "Good eye. The {colour} one is the rare one. You creep closer.",
  "The {colour} one it is, and it's rare. You creep in, one careful step at a time.",
];

export const THROW_ASK = ["What will you throw?", "One go. What will it be?", "Quietly now. What will you throw?"];

export const THROW_LABEL: Record<SafariThrow, string> = {
  ball: "throw a Safari Ball",
  bait: "throw some bait",
  rock: "throw a rock",
};

/** The right throw. Then the name. */
export const CAUGHT_LINES: Record<SafariThrow, readonly string[]> = {
  ball: [
    "You don't wait. The Safari Ball flies, bonks it on the head, and swallows it in a flash of red. [throw] [catch] Gotcha!",
    "Straight in with the ball. It shakes once, it shakes twice, it shakes three times. [throw] [catch] Gotcha!",
    "You throw the ball before you can talk yourself out of it. [throw] [catch] Got it!",
    "No fuss. One Safari Ball, one perfect throw. [throw] [catch] Gotcha!",
  ],
  bait: [
    "You toss a handful of bait. It sniffs. It nibbles. Then it's munching so happily that it doesn't even see the ball coming. [throw] [catch] Gotcha!",
    "The bait lands right under its nose. It freezes, starts chewing, and while its cheeks are full, your ball drops neatly on top. [throw] [catch] Got it!",
    "One handful of bait, and it forgets all about running. Chomp, chomp, chomp. Then the ball. [throw] [catch] Gotcha!",
    "It's about to bolt, but the bait smells too good. It stops for one bite, and one bite is all you need. [throw] [catch] Gotcha!",
  ],
  rock: [
    "You plop a rock down right beside it. Not at it. Beside it. It jumps, spins round, gets in a terrible fluster, and while it's still flustering, your ball lands. [throw] [catch] Gotcha!",
    "Your rock lands with a thud next to it. It huffs and puffs and turns in a slow circle, far too flustered to wriggle out of the ball. [throw] [catch] Got it!",
    "Thunk. The rock lands beside it, and it gets such a surprise that it sits down. The ball is already flying. [throw] [catch] Gotcha!",
    "You drop a rock beside it, and it's so busy being cross about the rock that it never notices the ball. [throw] [catch] Gotcha!",
  ],
};

/** A wrong throw, then the right one: "ball-bait" is a ball thrown at a Pokémon that wanted bait. */
export type WrongThrow = Exclude<`${SafariThrow}-${SafariThrow}`, "ball-ball" | "bait-bait" | "rock-rock">;

export const FLED_LINES: Record<WrongThrow, readonly string[]> = {
  "ball-bait": [
    "You throw a Safari Ball. [throw] [escape] Out it bursts, and whoosh, it's gone, quicker than a sneeze. [run]",
    "The ball lands. [escape] Out it pops, and it's off before you can blink. [run] All that's left is a swirl of dust.",
    "Your ball flies. [throw] [escape] The Pokémon shoots out like a cork from a bottle. [run] Gone.",
  ],
  "ball-rock": [
    "You throw a Safari Ball. [throw] [escape] It breaks free, has an enormous yawn, and wanders off at its own slow pace.",
    "The ball lands. [escape] Out it climbs. It gives you a long, disappointed look, and plods away.",
    "Your ball flies. [throw] [escape] It wriggles out easily, and strolls off, very slowly, without looking back.",
  ],
  "bait-ball": [
    "You throw some bait. It eats every crumb, does an enormous burp, and toddles off home.",
    "It gobbles your bait, licks its lips, and then, very politely, walks away.",
    "It eats all your bait. Then it looks at your bag as if it would like some more. Then it leaves.",
  ],
  "bait-rock": [
    "You throw some bait. It eats it all very slowly, dozes off, then wakes up and plods away.",
    "It eats your bait, very slowly, has a nap, and plods off somewhere quieter.",
    "It munches the bait so slowly that you nearly fall asleep yourself. Then it plods off, still chewing.",
  ],
  "rock-ball": [
    "You throw a rock. It lands with a thud right next to it. It gets a terrible fright and scampers off. [run]",
    "Thud! The rock lands beside it, and it leaps about a mile in the air and runs for it. [run]",
    "Your rock makes it jump out of its skin. [run] It's gone before the rock stops rolling.",
  ],
  "rock-bait": [
    "You throw a rock. But before it even lands, the Pokémon has zipped away in a cloud of dust. [run]",
    "Your rock is still in the air when it bolts. [run] The rock lands on an empty patch of ground.",
    "It hears the rock coming and is gone in a flash. [run] You didn't even see which way it went.",
  ],
};

/** Marigold, after a wrong throw, keyed by the throw that was right. */
export const RIGHT_THROW_LINES: Record<SafariThrow, readonly string[]> = {
  ball: [
    "'Common as crumbs, that one,' says Marigold. 'Just throw the ball.'",
    "'Common ones, straight in with the ball,' says Marigold.",
    "'Don't overthink the common ones,' says Marigold. 'Ball.'",
  ],
  bait: [
    "'Rare and quick,' says Marigold. 'That's a job for bait.'",
    "Marigold sighs. '{sighs} A rare one that fast? Bait.'",
    "'Fidgety and rare,' says Marigold. 'Bait keeps them busy.'",
  ],
  rock: [
    "'Rare, but slow,' says Marigold. 'A rock beside it would have done it.'",
    "Marigold pats your arm. 'Rare and slow? Rock.'",
    "'That one couldn't hurry if it tried,' says Marigold. 'Rock, next time.'",
  ],
};

// ---------------------------------------------------------------------------
// When it goes wrong

/** Searching the wrong place, then the true place. */
export const GONE_LINES = [
  "By the time you get to {home}, there's nothing there but fresh tracks. 'That was {a},' says Marigold.",
  "You hurry over to {home}, just in time to see {a} disappear over a hill.",
  "At {home}, Barnaby is walking away, tossing a Safari Ball. '{laughs} Thanks!' he calls. 'He's only gone and caught {a},' says Marigold.",
];

export const HOME_LINES = [
  "'{type} types love {home},' says Marigold. '{Decoy}? Hardly ever.'",
  "'{type} type? You want {home},' says Marigold. 'Not {decoy}.'",
  "'A {type} type, {decoyAt}?' says Marigold. 'No. {Home}.'",
];

/** At a spot stop, after creeping up on the common one. {colour} is the one you picked. */
export const COMMON_LINES = [
  "You creep up on the {colour} one. It's {a}! Lovely, but you could find one under any bush.",
  "You creep up on the {colour} one, and it's {a}. Marigold shrugs. 'Seen a hundred of those.'",
];

/** Then the rare one slips away. {other} is its colour. */
export const RARE_GONE_LINES = [
  "Behind you, the {other} one slips away. '{sighs} That was {a},' sighs Marigold.",
  "When you look round, the {other} one has gone. '{sadly} That,' says Marigold sadly, 'was {a}.'",
];

/** One gone, and the day goes on. */
export const FIRST_SLIP_LINES = [
  "That's one gone, and Barnaby's ahead. '{sighs} It happens,' says Marigold.",
  "One got away. 'They're wild,' says Marigold. 'Catch the next one.'",
];

/** Another gone, after the first. The day still goes on. */
export const SECOND_SLIP_LINES = [
  "Another one gone. 'Never mind,' says Marigold. 'The day's not over yet.'",
  "That one was quick. Marigold pats your shoulder. 'On to the next.'",
  "Gone. 'The Pokémon have to win sometimes,' says Marigold.",
];

/** A slip at the last stop with nothing else lost. */
export const LAST_SLIP_LINES = [
  "It got away. But the sun is going down, and that was the last stop anyway.",
  "Gone. Still, the sun is setting, and that was the last stop of the day.",
];

// ---------------------------------------------------------------------------
// When it goes right

/** After a catch, by how the race with Barnaby stands now: level or ahead, or still catching up. */
export const RACE_LINES: Record<"ahead" | "closer", readonly string[]> = {
  ahead: ["You're ahead of Barnaby!", "Barnaby is going to hate this.", "Marigold does a tiny, secret fist pump."],
  closer: ["That pulls you closer to Barnaby.", "You're catching Barnaby up.", "Into the bag it goes. Barnaby had better watch out."],
};

// ---------------------------------------------------------------------------
// The secret stop

export const GOLDEN_FIND = [
  "You're nearly at the gate when Marigold goes very still. '{gasps} You beat Barnaby,' she whispers.",
  "'And that cry is the rarest Pokémon in my whole Safari Zone. It only comes out for a trainer like you.'",
  "Through her binoculars, you can just see it, {glimpse}.",
].join(" ");

export const GOLDEN_WHERE = "'{whispers} If you know who that is,' says Marigold, 'you know where to look.'";

export const GOLDEN_MEET = "And there it is, right in front of you.";

export const GOLDEN_ASK = "Your hands are shaking. Marigold isn't even breathing. One throw. What will it be?";

export const GOLDEN_GONE =
  "When you get back, Marigold is looking at one perfect footprint. 'That was {a},' she says softly. 'They live {homeAt}. Next time.'";

export const GOLDEN_FLED_AFTER =
  "Marigold puts a hand on your shoulder. 'Beating Barnaby is still the best day anyone has had here in years.'";

// ---------------------------------------------------------------------------
// Endings, by how the day went: two or more got away, one got away, none got away but the secret
// Pokémon did, and the golden one, where you catch it.

export const ENDING_NAMES = ["A Good Day Out", "Barnaby's Bad Day", "Safari Master", "Golden Legend"];

/** Marigold's parting tip at the gate, after a day when a few got away. Chosen by seed. */
export const PARTING_TIPS = [
  "'Next time,' she says, 'listen to the cry first. It tells you more than your eyes do.'",
  "'Remember,' she says. 'Common ones, just throw the ball. Don't overthink it.'",
  "'Fidgety and rare?' says Marigold. 'Bait. Nobody runs off while they're chewing.'",
  "'Slow and rare?' says Marigold. 'A rock beside it. Never at it. Beside it.'",
  "'Follow the signs,' she says. 'Footprints, feathers, scorch marks. A Pokémon always leaves a clue.'",
  "'Think about where it would like to live,' she says. 'A Fire type won't be paddling in the sea.'",
];

/** Ending 1: Barnaby finished ahead, and you still saw all five stops. */
export function goodDayText(owner: string): string {
  return [
    "The sun sets, and Marigold walks you back to the gate.",
    "A few Pokémon got away today, but you saw every one of them up close.",
    "Barnaby is waiting at the gate, looking very pleased with himself.",
    `'Tomorrow, ${owner},' says Marigold, 'you'll beat him. I've seen how you think.'`,
  ].join(" ");
}

export function dayEndText(owner: string): string {
  return [
    "The sun sets, and Marigold walks you back to the gate.",
    "Barnaby holds up his Safari Balls. Then he sees your bag, and goes very quiet. He only just beat you.",
    `'Not bad at all, ${owner},' says Marigold. 'Finish ahead of him, and someone very special comes to visit.'`,
  ].join(" ");
}

export function masterText(owner: string): string {
  return [
    "The sun sets, gold and pink, and you walk back to the gate ahead of Barnaby. Barnaby has to sit down.",
    `Marigold shakes your hand like an old friend. 'You're a proper Safari Master, ${owner},' she says.`,
    "'And you saw it. Most trainers never even see it. Next time, you catch it.'",
  ].join(" ");
}

export function goldenText(owner: string): string {
  return [
    "Marigold takes off her enormous hat, which she has never done for anyone, and bows.",
    "Barnaby sees what you've caught, and drops his gold Safari Ball. It rolls all the way down the hill and into the lake. Plop.",
    `'{excited} What a day,' says Marigold. '${owner}, I'm putting your name on the gate.'`,
  ].join(" ");
}
