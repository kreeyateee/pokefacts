/**
 * Everything said in the Gym Challenge, written by hand. The adventure picks the Pokémon and the lines.
 *
 * Ronnie Rumble commentates every battle from a little booth with a very loud microphone. The eight gym
 * leaders each have one thing they love and one way of talking. Champion Aurelia is calm, kind and
 * terrifyingly good. The child is "you". Dialogue goes in single quotes, with the speaker named next to
 * it, so each line is read in that character's voice.
 *
 * Gaps look like {name}:
 *   {mine} {myType}          the Pokémon you sent out, and its type; {aMyType} is "an Ice"
 *   {theirs} {theirTypes}    the leader's Pokémon, and its types ("Rock and Ground")
 *   {aTheirTypes}            the same with "a" or "an": "an Ice"
 *   {why}                    one sentence on why that type matchup goes the way it does
 *   {other}                  the second type that spoils an obvious choice
 *   {gymType}                the gym's type
 *   {count}                  "three badges"
 *   {cry}                    where a Pokémon's cry plays
 */
import type { PokemonType } from "@/lib/type-chart";

/** Your team's six types. Between them they beat every gym, and each gym has a trap for one of them. */
export const TEAM_TYPES = ["Water", "Grass", "Fire", "Electric", "Ground", "Ice"] as const;

/** Well-known Pokémon of a single type for your team, one drawn per type each card. */
export const TEAM_CHOICES: Record<(typeof TEAM_TYPES)[number], readonly number[]> = {
  Water: [7, 158, 258, 393, 501, 656, 816, 912, 54, 134],
  Grass: [152, 252, 387, 495, 650, 810, 906, 470],
  Fire: [4, 155, 255, 390, 498, 653, 813, 909, 37, 58, 136],
  Electric: [25, 179, 403, 417, 135, 921, 309, 522],
  Ground: [27, 104, 231, 50, 529, 449, 749, 328],
  Ice: [361, 471, 582, 613, 712, 974, 875],
};

export type Gym = {
  type: PokemonType;
  leader: string;
  /** Who reads the leader's lines. */
  voices: readonly string[];
  badge: string;
  /** Arriving at the gym, meeting the leader, and the first Pokémon going out. Ends just before its name. */
  intro: string;
  /** Before the ace's cry. */
  ace: string;
  /** The leader, when you send out the wrong Pokémon. */
  tease: string;
  /** The leader, handing over the badge. */
  farewell: string;
};

/** Ronnie is cast first, so a line no one else claims is his. */
export const RONNIE = { id: "ronnie", name: "Ronnie", voices: ["IKne3meq5aSn9XLyUdCD", "TX3LPaxmHKxFdv7VOQHJ"] };
export const AURELIA = { id: "aurelia", name: "Aurelia", voices: ["XrExE9yKIg1WjnnlVkGX", "Xb7hH8MSUJpSbSDYk0k2"] };

export const GYMS: readonly Gym[] = [
  {
    type: "Rock",
    leader: "Basil",
    voices: ["pqHfZKP75CvOlQylNhV4", "JBFqnCBsd6RMkjVDRZzb"],
    badge: "Boulder",
    intro:
      "The first gym is an old quarry at the edge of town. The floor is gravel, the walls are cliffs, and every footstep crunches. Leader Basil is sitting on a boulder, polishing a pebble with his sleeve. 'Afternoon,' says Basil, very slowly. 'Rocks don't rush. Neither do I.' He stands up, and up, and up. He is enormous. 'Let's see what you're made of.' Basil sends out",
    ace: "Basil nods, very slowly. 'Not bad,' says Basil. 'But this one has been sitting in my quarry for a hundred years.' The ground rumbles, and out rolls",
    tease: "'Hmm,' says Basil. 'Pebble trouble. Have another think. I've got all day. I've got all week.'",
    farewell:
      "'You're solid,' says Basil, and from Basil, that's the biggest compliment there is. He pins the Boulder Badge on your jacket with his huge fingers.",
  },
  {
    type: "Water",
    leader: "Coral",
    voices: ["hpp4J3VqNfWAUOO0d1Us", "EXAVITQu4vr4xnSDxMaL"],
    badge: "Cascade",
    intro:
      "The second gym is a swimming pool with a wave machine, and everything smells of chlorine. Leader Coral bounces off the diving board, does three somersaults, and lands right in front of you, dripping. 'Welcome to my pool!' says Coral. 'Are you ready to make a splash? Oh, I love saying that. I say it every day.' Coral sends out",
    ace: "Coral wrings out her ponytail. 'Okay, okay, that went swimmingly,' says Coral. 'Get it? Swimmingly? Now meet my best friend.' The water in the pool heaves, and up surges",
    tease: "'Ooh, that sank like a stone,' says Coral. 'Dive back in and try again!'",
    farewell:
      "'You were brilliant,' says Coral. 'Absolutely making waves.' She fishes the Cascade Badge out of her goggles case, gives it a quick polish on her towel, and hands it over.",
  },
  {
    type: "Grass",
    leader: "Fern",
    voices: ["EXAVITQu4vr4xnSDxMaL", "FGY2WhTYpPnrIDTdsKH5"],
    badge: "Rainbow",
    intro:
      "The third gym is a huge glass greenhouse, warm and green, buzzing with bees. Leader Fern is watering a sunflower and humming to it. 'Oh, hello,' says Fern, softly. 'Sorry. I was just telling this sunflower how tall it's getting. Shall we battle? Gently, mind. The plants are listening.' Fern sends out",
    ace: "Fern smiles at you, as if you were a seedling that had just sprouted. 'You're growing so fast,' says Fern. 'Now, careful. This one has very deep roots.' The leaves on the floor shiver, and out steps",
    tease: "'Oh dear,' says Fern, patting a fern. 'Never mind. Everything grows if you give it another go.'",
    farewell:
      "'Thank you for a lovely battle,' says Fern. She takes the Rainbow Badge from a flowerpot, where it was growing, apparently, and presses it into your hand.",
  },
  {
    type: "Electric",
    leader: "Volta",
    voices: ["FGY2WhTYpPnrIDTdsKH5", "cgSgspJ2msm6clMCkdW9"],
    badge: "Thunder",
    intro:
      "The fourth gym is a workshop full of whirring machines, and the air smells like a thunderstorm. Leader Volta skids round a corner on roller skates, with her hair standing straight up. 'Hi hi hi!' says Volta, very fast. 'You're the challenger, brilliant, love it, I've just invented a toaster that makes the toast go faster, anyway, battle time!' Volta sends out",
    ace: "Volta's eyes light up, quite literally. 'Ooh, you're quick,' says Volta. 'But are you quicker than THIS?' Every light in the gym flickers, and with a crackle, out zaps",
    tease: "'Bzzzt! Wrong wire!' says Volta. 'Don't worry, I blow things up all the time. Try again!'",
    farewell:
      "'You're electrifying,' says Volta, and she means it. She pulls the Thunder Badge out of a machine that goes ding, and it's still slightly warm.",
  },
  {
    type: "Flying",
    leader: "Skye",
    voices: ["cgSgspJ2msm6clMCkdW9", "hpp4J3VqNfWAUOO0d1Us"],
    badge: "Gale",
    intro:
      "The fifth gym is on top of a very tall tower, and the wind up here could blow your hat off. Leader Skye swoops down on a glider and lands on the railing. 'Wahoo!' says Skye. 'Don't look down. Actually, do look down, it's amazing. Ready to fly?' Skye sends out",
    ace: "Skye whistles, a long high whistle, and the clouds seem to whistle back. 'Here comes the big one,' says Skye. A great shadow sweeps over the tower, and down dives",
    tease: "'Whoops, that one got lost in the clouds,' says Skye. 'Try again, quick, before the wind changes!'",
    farewell:
      "'You've got wings,' says Skye. 'Well, you haven't, but you know what I mean.' She clips the Gale Badge onto your collar so it doesn't blow away.",
  },
  {
    type: "Fire",
    leader: "Pepper",
    voices: ["cjVigY5qzO86Huf0OWal", "iP95p4xoKVk53GoZ742B"],
    badge: "Volcano",
    intro:
      "The sixth gym is a gigantic kitchen, with ovens as big as garages and pans that sizzle on their own. Chef Pepper, the leader, flips a pancake so high it sticks to the ceiling. 'Welcome to my kitchen,' says Pepper. 'Today's special: one challenger, lightly toasted.' He winks. 'Only joking. Mostly.' Pepper sends out",
    ace: "Pepper turns every oven up to the highest number. 'Time for the main course,' says Pepper. Flames roar up from the hob, and out of them strides",
    tease: "'Ooh, that's undercooked,' says Pepper. 'Pop it back in the oven and try again.'",
    farewell:
      "'Chef's kiss,' says Pepper, and he does one. He takes the Volcano Badge out of a cake tin and blows on it, because it's still hot.",
  },
  {
    type: "Ground",
    leader: "Clay",
    voices: ["CwhRBWXzGAHq8TQ4Fs17", "pqHfZKP75CvOlQylNhV4"],
    badge: "Earth",
    intro:
      "The seventh gym is a desert arena. The sand is hot, the sky is huge, and a little whirlwind of dust spins past. Leader Clay is lying in a hammock with his hat over his eyes. 'Oh, hey,' says Clay, without moving. 'Didn't hear you come in. Battle? Sure. Why not.' He doesn't get up. He just points. Clay sends out",
    ace: "For the first time, Clay sits up. 'Huh,' says Clay. 'You're actually good.' He stretches, yawns, and stamps once on the sand. The whole arena shakes, and up from under the ground bursts",
    tease: "'Nah,' says Clay, from under his hat. 'Have another go. No rush. Nothing's ever a rush.'",
    farewell:
      "Clay climbs out of his hammock, which takes a while. 'Respect,' says Clay. He tips his hat, and the Earth Badge was under it the whole time.",
  },
  {
    type: "Dragon",
    leader: "Wyn",
    voices: ["SOYHLrjzK2X1ezoPC6cr", "N2lVS1w4EtoT3dr4eOWO"],
    badge: "Rising",
    intro:
      "The eighth gym is a castle on a cliff, with banners snapping in the wind and torches flickering on the walls. Leader Wyn waits at the end of a long hall, in shining armour. 'Challenger,' says Wyn, and the word echoes off the stone. 'Seven badges. Impressive. But dragons do not bow to badges.' Wyn raises a sword made of wood, because it's a gym, and sends out",
    ace: "Wyn lowers the wooden sword, and nods with respect. 'Now you face my oldest friend,' says Wyn. A roar shakes the dust from the ceiling, and out of the shadows comes",
    tease: "'A dragon is not so easily beaten,' says Wyn. 'Think, challenger. Then try again.'",
    farewell:
      "Wyn kneels, which is very hard to do in armour. 'You have the heart of a dragon,' says Wyn. Wyn places the Rising Badge in your hand. It's the eighth one. It's the last one.",
  },
];

// ---------------------------------------------------------------------------
// The start

/** `owner` is the child's name, or "" for none. */
export function introText(owner: string, team: readonly string[]): string {
  return [
    "Welcome to the Gym Challenge!",
    "A huge banner flaps over the road: Eight Gyms. Eight Badges. One Champion.",
    `A young man in a shiny tracksuit leaps out from behind it. 'And here they are, folks!' says Ronnie, into a microphone that isn't plugged in. 'Ronnie Rumble here, and ${owner ? `this is ${owner}, ` : "here comes "}our newest challenger!'`,
    `'Your team,' says Ronnie, counting your six Poké Balls. 'You've got ${team.join(", ")}.'`,
    "'Here's how it works,' says Ronnie. 'Every gym leader sends out a Pokémon. You pick which of yours to send out. Get the type right, and boom! Get it wrong, and the leader lets you try again, because they're nice like that.'",
    "'Then it's the Champion. And the Champion,' says Ronnie, lowering his voice, 'does not let you try again.'",
    "'Want my quick lesson on types first?'",
  ].join(" ");
}

export const LESSON_TEXT = [
  "Ronnie pulls a whiteboard out of nowhere. 'Types!' says Ronnie. 'Every Pokémon has one or two.'",
  "'Water puts out Fire. Fire burns Grass. Grass drinks up Water. Round and round. When a type is strong against another, that's super effective, and it hits twice as hard.'",
  "'But it works the other way too,' says Ronnie. 'Fire on a Water type? Pfft. Not very effective. And some things do nothing at all. Electric on a Ground type? The ground just swallows it.'",
  "'Last thing, and this is the clever bit,' says Ronnie. 'Some Pokémon have two types. Then you have to think about both. Something that looks easy might have a second type that changes everything.'",
  "He caps his pen. 'Right. Let's go and get some badges!'",
].join(" ");

export const LESSON_LABELS = { hear: "hear Ronnie's lesson", skip: "go to the first gym" };

// ---------------------------------------------------------------------------
// Between gyms

export const TRAVEL_LINES = [
  "The next town is a short bus ride away. Ronnie sits behind you and commentates the whole journey, including the traffic lights.",
  "You walk to the next town along a river path. Ronnie practises his commentator voice on a family of ducks.",
  "A train takes you to the next gym. You watch the fields go by, and Ronnie eats four sandwiches.",
  "You cycle to the next town. Ronnie cycles next to you, shouting 'And they're taking the corner!' at every corner.",
  "The road to the next gym winds over a hill. At the top, you can see the castle where the last gym waits, far away.",
  "You get to the next gym early, so you sit on a bench and give your team a snack. They are very pleased about this.",
  "Ronnie is waiting outside the next gym with a sign that says GO GO GO in glitter. Some of the glitter is on his face.",
];

/** A badge count after a win: "That's three badges." */
export function badgeCount(count: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  if (count === 8) return "That's all eight badges!";
  return `That's ${words[count] ?? count} ${count === 1 ? "badge" : "badges"}.`;
}

// ---------------------------------------------------------------------------
// Sending out and battling

/** A gym's Pokémon comes out. The cry plays where {cry} is. */
export const SEND_OUT_LINES = [
  "{cry} {theirs}! It's {aTheirTypes} type.",
  "{cry} {theirs}, {aTheirTypes} type!",
];

/** The question before you choose. */
export const WHICH_LINES = [
  "'Who are you sending out?' says Ronnie, holding his breath.",
  "'Choose carefully,' whispers Ronnie, a bit too loudly.",
  "'The crowd goes quiet,' says Ronnie. 'Which Pokémon will it be?'",
  "Your hand hovers over your Poké Balls.",
];

/** It worked. */
export const WIN_LINES = [
  "You send out {mine}. It lets fly with {aMyType} attack. [hit] It's super effective! {why} {theirs} faints. [cheer]",
  "Out comes {mine}, and its {myType} attack hits with a WHAM. [hit] Super effective! {why} {theirs} is out cold. [cheer]",
  "{mine} bursts out of its Poké Ball and goes straight in with {aMyType} attack. [hit] Super effective! {why} {theirs} faints. [cheer]",
];

/** It worked, four times over. */
export const BIG_WIN_LINES = [
  "You send out {mine}, and its {myType} attack lands so hard the whole gym shakes. [hit] It's four times as strong! {why} {theirs} faints before it knows what happened. [cheer]",
];

export const RONNIE_WINS = [
  "'WHAT a choice!' says Ronnie. 'The crowd is on its feet!'",
  "'Textbook!' says Ronnie. 'Absolutely textbook!'",
  "'Did you SEE that?' says Ronnie, to nobody in particular.",
  "'Oh, I need to sit down,' says Ronnie. 'That was beautiful.'",
  "'Ten out of ten,' says Ronnie. 'Eleven out of ten!'",
];

/** It did nothing at all. */
export const IMMUNE_LINES = [
  "You send out {mine}. It uses {aMyType} attack, and [fizzle] nothing happens. Nothing at all. {why}",
  "{mine} tries its very best {myType} attack. [fizzle] It doesn't even tickle. {why}",
];

/** It barely worked. */
export const RESISTED_LINES = [
  "You send out {mine}. Its {myType} attack bounces off. [fizzle] It's not very effective. {why}",
  "{mine} throws {aMyType} attack. [fizzle] {theirs} barely notices. Not very effective. {why}",
];

/** The leader's Pokémon hit back far too hard. */
export const BLASTED_LINES = [
  "You send out {mine}, but {theirs} hits back with {aTheirType} attack. [fizzle] {mine} is knocked flat. {why}",
  "{mine} hardly gets started before {theirs} lands {aTheirType} attack. [fizzle] Ouch. {why}",
];

/** The trap: a type that beats the gym's type, spoiled by the Pokémon's other type. */
export const TRAP_LINES = [
  "You send out {mine}. {myType} is great against {gymType} types. But {theirs} is part {other} too, [fizzle] and the {other} side shrugs it off. {why}",
  "{mine} goes in with {aMyType} attack. Good thinking, against {aGymType} type. But {theirs} is also {other}, [fizzle] and that changes everything. {why}",
];

export const BACK_IN_LINES = [
  "{mine} trots back to its Poké Ball, a bit dizzy but fine.",
  "{mine} is fine, just embarrassed. Back in the ball it goes.",
];

export const RONNIE_MISSES = [
  "'Oof,' says Ronnie. 'Happens to the best of us. Mostly to me.'",
  "'Not to worry, folks,' says Ronnie. 'The challenger gets another go!'",
  "'I'd have done exactly the same,' says Ronnie. 'Which is why I'm a commentator.'",
];

/**
 * One sentence on why a type hits another hard, keyed "Attack>Defence". Also used, the other way
 * round, for why the leader's Pokémon hit yours.
 */
export const STRONG_REASONS: Record<string, string> = {
  "Water>Rock": "Water wears rock away.",
  "Water>Ground": "Water turns the ground to mud.",
  "Water>Fire": "Water puts fire out.",
  "Grass>Rock": "Roots crack rocks apart.",
  "Grass>Water": "Plants drink water right up.",
  "Grass>Ground": "Roots break up the ground.",
  "Ground>Rock": "The ground shakes rocks loose.",
  "Ground>Electric": "The ground soaks electricity up.",
  "Ground>Fire": "Sand smothers fire.",
  "Ground>Poison": "Earth buries poison.",
  "Ground>Steel": "The ground knocks metal off its feet.",
  "Electric>Water": "Electricity zaps right through water.",
  "Electric>Flying": "Lightning strikes anything up in the sky.",
  "Fire>Grass": "Fire burns plants.",
  "Fire>Ice": "Fire melts ice.",
  "Fire>Bug": "Bugs keep well away from fire.",
  "Fire>Steel": "Fire melts metal.",
  "Ice>Grass": "Frost withers plants.",
  "Ice>Flying": "Ice freezes wings.",
  "Ice>Dragon": "Dragons hate the cold more than anything.",
  "Ice>Ground": "Ice freezes the ground solid.",
  "Rock>Fire": "Rocks smother flames.",
  "Rock>Ice": "Rock smashes ice.",
  "Rock>Flying": "A rock knocks a flyer out of the sky.",
  "Flying>Grass": "Flyers swoop down on plants.",
  "Dragon>Dragon": "Only a dragon can really beat a dragon.",
  "Steel>Ice": "Metal smashes ice.",
  "Steel>Rock": "Metal cracks rock.",
  "Fighting>Ice": "A good punch shatters ice.",
  "Fighting>Rock": "A karate chop splits rock.",
};

/** One sentence on why a type hardly hurts another, keyed "Attack>Defence". */
export const WEAK_REASONS: Record<string, string> = {
  "Fire>Rock": "Rocks don't burn.",
  "Fire>Water": "Water just puts the fire out.",
  "Fire>Fire": "You can't burn fire.",
  "Fire>Dragon": "Dragons shrug off fire.",
  "Water>Water": "Water doesn't mind getting wet.",
  "Water>Grass": "Plants just drink the water.",
  "Water>Dragon": "Dragons shrug off water.",
  "Grass>Fire": "Fire burns the leaves up.",
  "Grass>Grass": "Plants don't mind plants.",
  "Grass>Flying": "Flyers just float above it.",
  "Grass>Dragon": "Dragons shrug off leaves.",
  "Grass>Poison": "Poison withers plants.",
  "Grass>Bug": "Bugs eat leaves for breakfast.",
  "Grass>Steel": "Leaves can't cut metal.",
  "Electric>Ground": "The ground swallows electricity whole.",
  "Electric>Electric": "Electricity doesn't zap electricity.",
  "Electric>Grass": "Plants don't conduct electricity well.",
  "Electric>Dragon": "Dragons shrug off sparks.",
  "Ground>Flying": "You can't shake the ground under something that's flying.",
  "Ground>Grass": "Roots hold the ground together.",
  "Ground>Bug": "Bugs just dig their way out.",
  "Ice>Fire": "Fire melts the ice.",
  "Ice>Water": "Ice just melts in water.",
  "Ice>Ice": "Ice doesn't mind the cold.",
  "Ice>Steel": "Ice can't dent metal.",
};

export function strongReason(attack: string, defence: string): string {
  return STRONG_REASONS[`${attack}>${defence}`] ?? `${attack} is strong against ${defence}.`;
}

export function weakReason(attack: string, defence: string): string {
  return WEAK_REASONS[`${attack}>${defence}`] ?? `${attack} isn't much use against ${defence}.`;
}

// ---------------------------------------------------------------------------
// The badge

export const BADGE_LINES = [
  "[badge] [cheer] {count}",
  "[badge] The crowd goes wild. [cheer] {count}",
];

// ---------------------------------------------------------------------------
// The Champion

export const CHAMPION_INTRO = [
  "The Champion's stadium is the biggest place you have ever seen. Thousands of people are cheering, and the floor is polished so bright you can see yourself in it. [cheer]",
  "'Eight badges, folks!' says Ronnie, and his voice echoes round the whole stadium. 'And now, the Champion!'",
  "Champion Aurelia walks out slowly, in a long cloak, and the crowd goes silent. She smiles at you, kindly. 'You've come a long way,' says Aurelia. 'I'm going to give you my very best, because you deserve it.'",
  "'Three Pokémon,' says Aurelia. 'And at this level, there are no second chances.'",
].join(" ");

/** Aurelia's three send-outs, round by round, each ending just before the Pokémon's cry. */
export const CHAMPION_SEND_OUTS = [
  "Aurelia lifts her first Poké Ball, and the lights dim. Out comes",
  "Aurelia nods, as if she expected nothing less. 'Good,' says Aurelia. 'Very good.' Her second Poké Ball spins through the air. Out comes",
  "The crowd is on its feet. Aurelia takes a deep breath. 'This is my oldest friend,' says Aurelia. 'We've never lost together.' Out comes",
];

/** Losing to the Champion, round by round. Endings 1 to 3. */
export const CHAMPION_LOSSES = [
  "Aurelia's Pokémon wins the round, and that's the battle. The crowd claps anyway, a long, warm clap. Aurelia shakes your hand. 'You made it all the way here,' says Aurelia. 'Most people never do. Come back when you're ready.' 'What a run!' says Ronnie. 'What a RUN!'",
  "So close. Aurelia's second Pokémon wins the round, and Ronnie drops his microphone. 'One more!' says Ronnie. 'One more and it'd be the final round!' Aurelia smiles. 'That was the best start anyone's made in years,' says Aurelia. 'I'll be waiting.'",
  "It's the very last round, and Aurelia's oldest friend holds on, just. The stadium goes completely silent. Then it erupts. [cheer] Everyone is cheering for you anyway. 'One step away,' says Aurelia, and she looks impressed. 'Next time, I think you'll take that step.'",
];

export const CHAMPION_WIN =
  "Aurelia's last Pokémon faints, and for a second nobody makes a sound. Then the whole stadium explodes. [fanfare] [cheer] 'A NEW CHAMPION!' yells Ronnie, so loud his microphone squeaks. Aurelia walks over and hangs a golden medal round your neck. 'Well done, Champion,' says Aurelia. 'I haven't had a battle like that in a very long time.'";

/** A legendary Pokémon arrives. Its cry plays where {cry} is. */
export const LEGEND_ARRIVES =
  "Then a shadow falls across the whole stadium, and a cry rings out from the sky. {cry} Everyone looks up. A legendary Pokémon is circling the roof, huge and shining. {about} It lands, very gently, right in front of you, and bows its head. 'It came to see the new Champion,' whispers Aurelia. 'That's only happened twice before.' Ronnie is too amazed to speak, for once.";

export const LEGEND_LABELS = { throwBall: "throw a Poké Ball", letRest: "let it rest" };

/** What the legendary Pokémon looks like. Never names it, so its cry and picture do the telling. */
export const LEGENDS: Record<number, { about: string; name: string }> = {
  144: { name: "Articuno", about: "Its long blue tail glitters, and snow falls from its wings, even though it's summer." },
  145: { name: "Zapdos", about: "Its yellow feathers crackle, and every light in the stadium flickers." },
  146: { name: "Moltres", about: "Its wings are made of flame, and the whole stadium goes warm." },
  249: { name: "Lugia", about: "It is silver and white, and the air smells suddenly of the sea." },
  250: { name: "Ho-Oh", about: "Its feathers shine every colour of the rainbow." },
  384: { name: "Rayquaza", about: "It is long and green, like a dragon made of sky." },
};

export function throwEnding(legend: string, owner: string): string {
  return [
    `You throw a Poké Ball. [throw] [escape] It pops straight open. ${legend} isn't cross. It just looks at you, as if to say, not today.`,
    "Then it spreads its wings and flies away, into the sunset, and the whole stadium waves goodbye.",
    `'Still,' says Ronnie, wiping his eyes. '${owner ? `Champion ${owner}` : "Our new Champion"}! What a day! WHAT a day!'`,
  ].join(" ");
}

export function restEnding(legend: string, owner: string): string {
  return [
    `You don't throw anything. You just let it rest. ${legend} looks at you for a long moment, and then it lowers its great head, very gently, until it touches your hand.`,
    "When it flies away, it leaves something behind: a tiny shining stone, warm to the touch.",
    `Aurelia gasps. 'It chose you,' says Aurelia. 'It will come back${owner ? `, ${owner}` : ""}. Whenever you need it.'`,
    "'I'm not crying,' says Ronnie, crying. 'Ladies and gentlemen, the Champion!'",
  ].join(" ");
}

export const ENDING_NAMES = ["So Close", "Runner-Up", "One Step Away", "Champion", "Friend of Legends"];
