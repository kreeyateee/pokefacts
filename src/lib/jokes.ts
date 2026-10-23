/**
 * Pokémon jokes, written for children: one per Pokémon, a question and a punchline. Used by the Joke
 * Book card, the joke box on the page, and the characters in the adventures. Each is plain enough to be
 * read aloud and to sit inside a character's quote (no quotation marks of its own).
 */
export type Joke = { dexId: number; setup: string; punchline: string };

export const JOKES: readonly Joke[] = [
  { dexId: 54, setup: "Why did Psyduck go to the library?", punchline: "To find a book about headaches, but it forgot why it was there!" },
  { dexId: 25, setup: "Why did Pikachu get a job at the power station?", punchline: "Because it had all the right connections!" },
  { dexId: 143, setup: "What is Snorlax's favourite kind of music?", punchline: "Lullabies. It's never heard the end of one." },
  { dexId: 129, setup: "What did Magikarp say after using Splash for the hundredth time?", punchline: "Nothing happened, but I feel very fresh!" },
  { dexId: 79, setup: "Tell Slowpoke a joke on Monday, and when does it laugh?", punchline: "Next Friday, probably!" },
  { dexId: 132, setup: "What does Ditto say when you ask how it's feeling?", punchline: "Same as you!" },
  { dexId: 4, setup: "Why does Charmander never get lost in the dark?", punchline: "It always brings its own tail light!" },
  { dexId: 1, setup: "Why is Bulbasaur so organised?", punchline: "It always has a plant!" },
  { dexId: 133, setup: "Why does Eevee take so long to get dressed?", punchline: "It has eight different outfits to choose from!" },
  { dexId: 39, setup: "Why does Jigglypuff always carry a pen?", punchline: "To draw on everyone who falls asleep during its song!" },
  { dexId: 94, setup: "Why didn't Gengar go to the party?", punchline: "It had no body to go with!" },
  { dexId: 74, setup: "What did Geodude say to the sad little pebble?", punchline: "Don't take it for granite!" },
  { dexId: 95, setup: "What kind of music does Onix like best?", punchline: "Rock, of course!" },
  { dexId: 202, setup: "Why did Wobbuffet get told off in class?", punchline: "It kept repeating everything back to the teacher!" },
  { dexId: 185, setup: "Why does Sudowoodo always lose at hide and seek?", punchline: "Because it isn't a very good tree!" },
  { dexId: 103, setup: "Why does Exeggutor always do well in tests?", punchline: "Three heads are better than one!" },
  { dexId: 50, setup: "What's underneath Diglett?", punchline: "Nobody knows, and Diglett isn't telling!" },
  { dexId: 16, setup: "Why did Pidgey sit on top of the clock?", punchline: "It wanted to be on time!" },
  { dexId: 86, setup: "What did the sea say to Seel?", punchline: "Nothing. It just waved!" },
  { dexId: 98, setup: "Why won't Krabby share its toys?", punchline: "Because it's a little bit shellfish!" },
  { dexId: 52, setup: "What did Meowth say when it dropped its coin on its toe?", punchline: "Me-owch!" },
  { dexId: 6, setup: "Why does Charizard always win cooking competitions?", punchline: "Everything it makes is flame-grilled!" },
  { dexId: 131, setup: "What is Lapras's favourite subject at school?", punchline: "Sea-ence!" },
  { dexId: 321, setup: "Why did Wailord wear its best hat to the party?", punchline: "It wanted to make a big splash!" },
  { dexId: 915, setup: "What did Lechonk say after its third sandwich?", punchline: "I'm full. Is there pudding?" },
  { dexId: 909, setup: "Why did Fuecoco eat the homework?", punchline: "Somebody told it the homework was a piece of cake!" },
  { dexId: 906, setup: "What is Sprigatito's favourite colour?", punchline: "Purr-ple!" },
  { dexId: 912, setup: "What did Quaxly say when it saw the muddy puddle?", punchline: "Not today. I've only just done my hair!" },
  { dexId: 722, setup: "Why does Rowlet always do its homework?", punchline: "Because it gives a hoot!" },
  { dexId: 255, setup: "Why did Torchic cross the road?", punchline: "To prove it wasn't a chicken!" },
  { dexId: 113, setup: "Why is Chansey such a good friend?", punchline: "Because it's egg-cellent!" },
  { dexId: 102, setup: "What did one Exeggcute say to the others?", punchline: "Let's stick together, or we'll crack!" },
  { dexId: 81, setup: "Why do Magnemite always hold hands?", punchline: "They're very attached to each other!" },
  { dexId: 100, setup: "Why does Voltorb never go to parties?", punchline: "It always blows up at the slightest thing!" },
  { dexId: 130, setup: "How did Magikarp finally become Gyarados?", punchline: "It made a really big splash!" },
  { dexId: 707, setup: "Why is Klefki never locked out?", punchline: "Because it's always the key to the party!" },
  { dexId: 63, setup: "Why is Abra always late?", punchline: "It teleports to the wrong place, then has a little nap!" },
  { dexId: 27, setup: "Why did Sandshrew go to the beach?", punchline: "To visit its relatives!" },
  { dexId: 149, setup: "Why is Dragonite the best postman?", punchline: "It always delivers, even in a storm!" },
  { dexId: 68, setup: "Why is Machamp so good at clapping?", punchline: "It can give a round of applause all by itself!" },
  { dexId: 38, setup: "How does Ninetales choose a bedtime story?", punchline: "It has nine tales to choose from!" },
  { dexId: 99, setup: "Why did Kingler go to the doctor?", punchline: "It had a pinch in its side!" },
  { dexId: 222, setup: "What did Corsola say to the little fish?", punchline: "Water you doing in my reef?" },
  { dexId: 369, setup: "Why is Relicanth so wise?", punchline: "It's had a hundred million birthdays!" },
  { dexId: 73, setup: "How many friends can Tentacruel hug at once?", punchline: "As many as it likes. It's got plenty of arms!" },
  { dexId: 171, setup: "Why is Lanturn never scared of the dark?", punchline: "It always brings its own light!" },
  { dexId: 121, setup: "Why did Starmie get top marks?", punchline: "Because it's a real star!" },
  { dexId: 319, setup: "What does Sharpedo say when it meets new friends?", punchline: "Nice to eat you! Only joking. Nice to meet you!" },
  { dexId: 122, setup: "What did Mr Mime say at the party?", punchline: "Nothing at all, but everybody understood!" },
  { dexId: 35, setup: "Why does Clefairy love sleepovers?", punchline: "It gets to stay up and look at the stars!" },
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

/** A character telling a joke, written so each line is read in their voice. */
export function toldBy(name: string, joke: Joke): string {
  return `'Want to hear a joke?' says ${name}. '${joke.setup}' Nobody knows. '${joke.punchline}' says ${name}, and laughs so hard at it that everyone else laughs too.`;
}
