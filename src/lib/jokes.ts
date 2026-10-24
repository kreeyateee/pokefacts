/**
 * Pokémon jokes, written for children: a question and a punchline, each with a Pokémon to show and play the
 * cry of. Some are about that Pokémon; some are about Pokémon in general (ghosts, Poké Balls, Ice types). Used by the Joke
 * Book card, the joke box on the page, and the characters in the adventures. Each is plain enough to be
 * read aloud and to sit inside a character's quote (no quotation marks of its own).
 */
export type Joke = { dexId: number; setup: string; punchline: string };

export const JOKES: readonly Joke[] = [
  // Puns on names and types, the kind a six-year-old tells at breakfast all week.
  { dexId: 25, setup: "What's Pikachu's favourite day of the week?", punchline: "Thunder-sday!" },
  { dexId: 143, setup: "Which letter does Snorlax like best?", punchline: "Zzzzzz!" },
  { dexId: 132, setup: "Why did the teacher tell Ditto off?", punchline: "It copied everybody's homework!" },
  { dexId: 79, setup: "How do you make Slowpoke laugh on Saturday?", punchline: "Tell it a joke on Monday!" },
  { dexId: 129, setup: "Why is Magikarp scared of playing football?", punchline: "It doesn't want to end up in the net!" },
  { dexId: 92, setup: "Why are Ghost Pokémon so bad at telling fibs?", punchline: "You can see right through them!" },
  { dexId: 94, setup: "What's Gengar's favourite pudding?", punchline: "I scream!" },
  { dexId: 93, setup: "Where do Ghost Pokémon send their letters from?", punchline: "The ghost office!" },
  { dexId: 58, setup: "What do you call Growlithe on a really hot day?", punchline: "A hot dog!" },
  { dexId: 128, setup: "What do you call a Tauros that's fast asleep?", punchline: "A bull-dozer!" },
  { dexId: 241, setup: "Where does Miltank go on holiday?", punchline: "Moo York!" },
  { dexId: 77, setup: "What's wrong with Ponyta when it has a sore throat?", punchline: "It's a little hoarse!" },
  { dexId: 831, setup: "Where does Wooloo go for a haircut?", punchline: "The baa-baa shop!" },
  { dexId: 179, setup: "Why does Mareep's wool always stick up?", punchline: "It's having a shocking hair day!" },
  { dexId: 172, setup: "What do Electric Pokémon wear on their feet?", punchline: "Shocks!" },
  { dexId: 361, setup: "What do Ice Pokémon sing at a birthday party?", punchline: "Freeze a jolly good fellow!" },
  { dexId: 43, setup: "What does Oddish say when it's time to go home?", punchline: "I'd better leaf now!" },
  { dexId: 111, setup: "Why did Rhyhorn go to school?", punchline: "To get a little boulder!" },
  { dexId: 12, setup: "What's Butterfree's best subject at school?", punchline: "Moth-ematics!" },
  { dexId: 23, setup: "What does Ekans do after school?", punchline: "Its hiss-tory homework!" },
  { dexId: 151, setup: "What kind of songs does Mew like best?", punchline: "Mew-sic!" },
  { dexId: 118, setup: "Why is Goldeen so good at music?", punchline: "It knows all its scales!" },
  { dexId: 1, setup: "What's Bulbasaur's favourite game?", punchline: "Hide and go seed!" },
  { dexId: 7, setup: "Why did Squirtle cross the road?", punchline: "To get to the shell station!" },
  { dexId: 4, setup: "Why does Charmander do so well at school?", punchline: "It's always on fire!" },
  { dexId: 6, setup: "Why does nobody let Charizard near the birthday cake?", punchline: "It lights the candles instead of blowing them out!" },
  { dexId: 175, setup: "Why does Togepi tell so many jokes?", punchline: "It loves to crack everybody up!" },
  { dexId: 74, setup: "What did Geodude say to the sad little pebble?", punchline: "Don't take it for granite!" },
  { dexId: 98, setup: "Why won't Krabby share its toys?", punchline: "Because it's a little bit shellfish!" },
  { dexId: 52, setup: "What did Meowth say when it dropped a coin on its toe?", punchline: "Me-owch!" },
  { dexId: 131, setup: "What's Lapras's favourite subject at school?", punchline: "Sea-ence!" },
  { dexId: 906, setup: "What's Sprigatito's favourite colour?", punchline: "Purr-ple!" },
  { dexId: 722, setup: "Why does Rowlet always do its homework?", punchline: "Because it gives a hoot!" },
  { dexId: 255, setup: "Why did Torchic cross the playground?", punchline: "To get to the other slide!" },
  { dexId: 113, setup: "Why is Chansey such a good friend?", punchline: "Because it's egg-cellent!" },
  { dexId: 81, setup: "Why do Magnemite always hold hands?", punchline: "They're very attached to each other!" },
  { dexId: 222, setup: "What did Corsola say to the little fish?", punchline: "Water you doing in my reef?" },
  { dexId: 121, setup: "Why did Starmie get top marks?", punchline: "Because it's a real star!" },
  { dexId: 38, setup: "How does Ninetales choose a bedtime story?", punchline: "It has nine tales to pick from!" },

  // Silly ones: what would really happen if Pokémon lived next door.
  { dexId: 100, setup: "How can you tell Voltorb from a Poké Ball?", punchline: "Try to pick it up. If it goes boom, it was Voltorb!" },
  { dexId: 590, setup: "What's red and white and round, and isn't a Poké Ball?", punchline: "Foongus, dressed up again!" },
  { dexId: 39, setup: "Why does Jigglypuff always carry a pen?", punchline: "To draw on everyone who falls asleep during its song!" },
  { dexId: 446, setup: "What did Munchlax say when it opened the empty fridge?", punchline: "Who ate all the food? Oh. It was me." },
  { dexId: 83, setup: "Why did Farfetch'd sneak behind the tree?", punchline: "To take a leek!" },
  { dexId: 84, setup: "Why is Doduo never bored on a long walk?", punchline: "It always has someone to talk to!" },
  { dexId: 103, setup: "Why does Exeggutor always do well in tests?", punchline: "Three heads are better than one!" },
  { dexId: 50, setup: "What's underneath Diglett?", punchline: "Nobody knows, and Diglett isn't telling!" },
  { dexId: 263, setup: "Why is Zigzagoon always late for school?", punchline: "It goes zig, then zag, then zig, then zag!" },
  { dexId: 258, setup: "Why does Mudkip never need a bath?", punchline: "With a name like that, nobody expects it to!" },
  { dexId: 202, setup: "Why did Wobbuffet get told off in class?", punchline: "It kept saying everything back to the teacher!" },
  { dexId: 185, setup: "Why does Sudowoodo always lose at hide and seek?", punchline: "Because it isn't a very good tree!" },
  { dexId: 68, setup: "Why is Machamp brilliant at clapping?", punchline: "It can give a round of applause all by itself!" },
  { dexId: 568, setup: "Why does Trubbish never win at card games?", punchline: "It always gets a rubbish hand!" },
  { dexId: 909, setup: "Why did Fuecoco eat the homework?", punchline: "Somebody said it was a piece of cake!" },
  { dexId: 912, setup: "What did Quaxly say when it saw the muddy puddle?", punchline: "Not today. I've only just done my hair!" },
  { dexId: 915, setup: "What did Lechonk say after its third sandwich?", punchline: "I'm full. Is there pudding?" },
  { dexId: 63, setup: "Why is Abra always late?", punchline: "It teleports to the wrong place, then has a little nap!" },
  { dexId: 149, setup: "Why is Dragonite the best postman?", punchline: "It always delivers, even in a storm!" },
  { dexId: 171, setup: "Why does everyone want Lanturn at a sleepover?", punchline: "It's the best night light ever!" },
  { dexId: 319, setup: "What does Sharpedo say when it meets new friends?", punchline: "Nice to eat you! Only joking. Nice to meet you!" },
  { dexId: 122, setup: "What did Mr Mime say at the party?", punchline: "Nothing at all, but everybody understood!" },
  { dexId: 778, setup: "Why does Mimikyu dress up as Pikachu?", punchline: "It wants to be a star, but it's a little bit shy!" },
  { dexId: 235, setup: "Why is Smeargle always in trouble at home?", punchline: "It keeps painting on the walls!" },
  { dexId: 54, setup: "Why did Psyduck cross the road?", punchline: "It can't remember. It's still trying to work it out!" },
  { dexId: 707, setup: "Why is Klefki never locked out?", punchline: "Because it's always the key to the party!" },
  { dexId: 130, setup: "How did Magikarp finally turn into Gyarados?", punchline: "It made a really big splash!" },
];

/** The jokes in a repeatable order for a seed, leaving out any about the Pokémon listed. */
export function jokesFor(random: () => number, avoid: readonly number[] = []): Joke[] {
  const pool = JOKES.filter((joke) => !avoid.includes(joke.dexId));
  const order = [...pool];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap] as Joke, order[index] as Joke];
  }
  return order;
}

/**
 * A character telling a joke, written so each line is read in their voice. The Yoto voices act the
 * {cheerfully} and the {giggles} (at the start of the punchline, so a sentence-by-sentence recording never
 * leaves a laugh on its own); Piper and the page drop them.
 */
export function toldBy(name: string, joke: Joke): string {
  return `${name} grins. '{cheerfully} Want to hear a joke? ${joke.setup}' Nobody knows. ${name} giggles. '{giggles} ${joke.punchline}' Everyone laughs.`;
}

/** How a Joke Book track starts: naming the Pokémon only when the joke is about it. */
export function jokeIntro(name: string, joke: Joke): string {
  const word = name.split(" ")[0] ?? name;
  return `${joke.setup} ${joke.punchline}`.includes(word) ? `Here's a joke about ${name}.` : "Here's a joke.";
}

/** A Joke Book track: the intro, the question, a pause, then the punchline and a laugh. */
export function jokeBookText(name: string, joke: Joke): string {
  return `${jokeIntro(name, joke)} ${joke.setup} ... ${joke.punchline} {laughs}`;
}
