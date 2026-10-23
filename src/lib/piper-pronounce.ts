/**
 * Piper reads through espeak, which guesses at Pokémon names from English spelling.
 * These respellings are for Piper only. Yoto's voices keep the text pronounce() gives them,
 * so their recordings, which are cached by exact text, still match.
 *
 * Each respelling was checked against the IPA espeak makes for it. To add one, try it with
 * `npx tsx scripts/piper-phonemes.ts --raw "Peekachoo"`, add it here, then run `--write`.
 * A space makes a fresh stressed word, so "Ha ka mo oh" is four even beats.
 */
const PIPER_NAMES: ReadonlyArray<readonly [string, string]> = [
  // The words on every card.
  // "Pohkaymon" ended in a lazy "mun". The doubled n keeps a full "mon", stressed like Pokédex: POH-kay-mon.
  ["Pokémon", "Pohkaymonn"],
  ["Pokemon", "Pohkaymonn"],
  ["Pokédex", "Pohkaydex"],
  ["Pokedex", "Pohkaydex"],
  ["Poké", "Pohkay"],
  ["Poke Ball", "Pohkay Ball"],
  ["Pokéfacts", "Pohkay facts"],
  ["Pokefacts", "Pohkay facts"],

  // Kanto.
  ["Ivysaur", "Ivy sore"],
  ["Charizard", "Chari zard"],
  ["Caterpie", "Caterpee"],
  ["Metapod", "Metta pod"],
  ["Pidgeotto", "Pidgeoto"],
  ["Pidgeot", "Pidgey ot"],
  ["Pikachu", "Peekachoo"],
  ["Nidoran♀", "Needo ran female"],
  ["Nidoran♂", "Needo ran male"],
  ["Nidoran", "Needo ran"],
  ["Nidorina", "Needoreena"],
  ["Nidoqueen", "Needoqueen"],
  ["Nidorino", "Needoreeno"],
  ["Nidoking", "Needoking"],
  ["Clefairy", "Kluh fairy"],
  ["Clefable", "Kluh fable"],
  ["Zubat", "Zoobat"],
  ["Growlithe", "Growlith"],
  ["Kadabra", "Cadabra"],
  ["Alakazam", "Allakazam"],
  ["Farfetch’d", "Far fetched"],
  ["Farfetch'd", "Far fetched"],
  ["Doduo", "Doh doo oh"],
  ["Dodrio", "Doh dree oh"],
  ["Exeggcute", "Eggsicute"],
  ["Tangela", "Tangulla"],
  ["Kangaskhan", "Kangaskan"],
  ["Horsea", "Hor see"],
  ["Staryu", "Star you"],
  ["Mr. Mime", "Mister Mime"],
  ["Pinsir", "Pin sir"],
  ["Gyarados", "Ghyara dos"],
  ["Porygon-Z", "Porry gon zee"],
  ["Porygon2", "Porry gon two"],
  ["Porygon", "Porry gon"],
  ["Kabuto", "Kabooto"],
  ["Kabutops", "Kabboo tops"],
  ["Aerodactyl", "Airo dactill"],
  ["Moltres", "Moltrays"],

  // Johto.
  ["Meganium", "Meg gay nee um"],
  ["Typhlosion", "Tie flow zhun"],
  ["Totodile", "Toe toe dile"],
  ["Feraligatr", "Feralligator"],
  ["Hoothoot", "Hoot hoot"],
  ["Noctowl", "Nock towel"],
  ["Ledyba", "Leddy buh"],
  ["Ariados", "Airy a dose"],
  ["Chinchou", "Chinchow"],
  ["Pichu", "Peechoo"],
  ["Togepi", "Toe gheppy"],
  ["Togetic", "Toe ghettic"],
  ["Ampharos", "Amfa rose"],
  ["Azumarill", "Uh zooma rill"],
  ["Sudowoodo", "Soodo woo doe"],
  ["Girafarig", "Jih raffa rig"],
  ["Pineco", "Pine co"],
  ["Gligar", "Gly gar"],
  ["Qwilfish", "Quill fish"],
  ["Scizor", "Sizor"],
  ["Ursaring", "Ursa ring"],
  ["Swinub", "Swy nub"],
  ["Corsola", "Corso la"],
  ["Remoraid", "Remmo raid"],
  ["Octillery", "Ock tillery"],
  ["Delibird", "Delly bird"],
  ["Houndour", "Hound dour"],
  ["Elekid", "Ellakid"],
  ["Raikou", "Rye koo"],
  ["Suicune", "Swee coon"],
  ["Tyranitar", "Tie ranny tar"],
  ["Lugia", "Loo ghee uh"],
  ["Celebi", "Celleby"],

  // Hoenn.
  ["Grovyle", "Grow vile"],
  ["Sceptile", "Sep tile"],
  ["Torchic", "Tor chick"],
  ["Blaziken", "Blaze a ken"],
  ["Ludicolo", "Loody coe low"],
  ["Manectric", "Muh neck trick"],
  ["Relicanth", "Relly canth"],
  ["Salamence", "Salla mence"],
  ["Regirock", "Redgie rock"],
  ["Regice", "Redge ice"],
  ["Latias", "Lattee ahs"],
  ["Latios", "Lattee ose"],
  ["Kyogre", "Kai ogre"],
  ["Rayquaza", "Ray kway za"],
  ["Jirachi", "Juh rah chee"],

  // Sinnoh.
  ["Torterra", "Tor terra"],
  ["Monferno", "Mon fur no"],
  ["Staraptor", "Star rap tor"],
  ["Bidoof", "Bee doof"],
  ["Bibarel", "Bee bear el"],
  ["Combee", "Comb bee"],
  ["Pachirisu", "Patchy ree soo"],
  ["Cherubi", "Chuh roo bee"],
  ["Buneary", "Bun ear ee"],
  ["Gible", "Gibble"],
  ["Togekiss", "Toe ghekiss"],
  ["Gallade", "Guh laid"],
  ["Uxie", "Yook see"],
  ["Azelf", "Azz elf"],
  ["Dialga", "Dee al guh"],
  ["Regigigas", "Redgie giggus"],
  ["Giratina", "Gear a teena"],
  ["Cresselia", "Kress sellia"],
  ["Phione", "Fee oh nay"],
  ["Arceus", "Arkey us"],

  // Unova.
  ["Sewaddle", "See waddle"],
  ["Archen", "Ar ken"],
  ["Hydreigon", "High dry gon"],
  ["Tornadus", "Tor nay dus"],
  ["Reshiram", "Resh ee ram"],
  ["Meloetta", "Mello etta"],

  // Kalos.
  ["Frogadier", "Frog a deer"],
  ["Greninja", "Gren ninja"],
  ["Flabébé", "Flah bay bay"],
  ["Floette", "Flow ett"],
  ["Hawlucha", "Ha loo cha"],
  ["Dedenne", "Duh den nay"],
  ["Goodra", "Goo druh"],
  ["Yveltal", "Ee vell tall"],

  // Alola.
  ["Primarina", "Pree ma ree na"],
  ["Pikipek", "Picky peck"],
  ["Toucannon", "Too can on"],
  ["Yungoos", "Young goose"],
  ["Mareanie", "Muh ree nee"],
  ["Mimikyu", "Mimmy cue"],
  ["Silvally", "Sil valley"],
  ["Hakamo-o", "Ha ka mo oh"],
  ["Tapu Lele", "Tapu Lay lay"],
  ["Tapu Fini", "Tapu Fee nee"],
  ["Cosmoem", "Coz mo em"],
  ["Solgaleo", "Solga lay oh"],
  ["Necrozma", "Nuh croz ma"],
  ["Magearna", "Muh gear na"],

  // Galar.
  ["Grookey", "Grew key"],
  ["Skwovet", "Squoh vet"],
  ["Corviknight", "Corvy knight"],
  ["Applin", "Apple in"],
  ["Silicobra", "Silly co bra"],
  ["Sirfetch’d", "Sir fetched"],
  ["Sirfetch'd", "Sir fetched"],
  ["Mr. Rime", "Mister Rime"],
  ["Morpeko", "Mor peck oh"],
  ["Duraludon", "Dural oo don"],
  ["Zacian", "Zah see an"],
  ["Kubfu", "Koob foo"],
  ["Zarude", "Zah roo day"],
  ["Regieleki", "Redgie electy"],
  ["Regidrago", "Redgie drah go"],
  ["Overqwil", "Over quill"],

  // Paldea.
  ["Fuecoco", "Fooay coco"],
  ["Quaquaval", "Kwah kwah val"],
  ["Brambleghast", "Bramble ghast"],
  ["Gimmighoul", "Gimmy ghoul"],
  ["Tatsugiri", "Tatsu gheery"],
  ["Iron Jugulis", "Iron Jug you liss"],
  ["Chi-Yu", "Chee you"],
  ["Koraidon", "Kor eye don"],
  ["Miraidon", "Meer eye don"],
  ["Okidogi", "Oh key doe ghee"],
  ["Ogerpon", "Oh gur pon"],

  // Places and the adventure cast.
  ["Hoenn", "Ho-enn"],
  ["Hisui", "Hee soo ee"],
  ["Paldea", "Pal day uh"],
  ["Aurelia", "Awreelia"],
  ["Mia", "Mee uh"],
];

const LETTER = "\\p{L}\\p{N}";

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SAID = new Map(PIPER_NAMES.map(([name, said]) => [name.toLowerCase(), said]));

// One pass, longest name first, so "Nidoran♀" wins over "Nidoran" and a respelling is never respelled again.
// A trailing "s" may follow, for "Poké Balls" or "Pikachus".
const NAME_PATTERN = new RegExp(
  `(?<![${LETTER}])(${[...PIPER_NAMES]
    .map(([name]) => name)
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join("|")})(?=s?(?![${LETTER}]))`,
  "giu",
);

function sameCase(found: string, said: string): string {
  if (found === found.toLowerCase() && found !== found.toUpperCase()) return said.toLowerCase();
  return said;
}

/** Signs and short forms that really turn up in the fact text. */
function spellOut(text: string): string {
  return (
    text
      // "It boosts the Sp. Atk" from the ability notes. espeak says "S P".
      .replace(/\bSp\.\s*Atk\b/g, "Special Attack")
      .replace(/\bSp\.\s*Def\b/g, "Special Defence")
      .replace(/\bSp\./g, "Special.")
      // "2,500° F" is read as "degrees eff".
      .replace(/°\s*F\b/g, " degrees Fahrenheit")
      .replace(/°\s*C\b/g, " degrees Celsius")
      .replace(/°/g, " degrees")
      // espeak runs straight through an ellipsis or a dash. A comma gives the pause.
      .replace(/\s*(?:\.{3}|…)\s*$/g, ".")
      .replace(/\s*(?:\.{3}|…)\s*/g, ", ")
      .replace(/\s*—\s*/g, ", ")
      // "the one-hit KO" is read as "koh".
      .replace(/\bKO\b/g, "K O")
      // "a UB" is read as "a ub". Ultra Beast takes "an".
      .replace(/\ba UB\b/g, "an Ultra Beast")
      .replace(/\bA UB\b/g, "An Ultra Beast")
      .replace(/\bUB(s?)\b/g, "Ultra Beast$1")
      // "Mime Jr." is spelled out as "J R", and its full stop ends the sentence.
      .replace(/\bMime Jr\.(?=\s+\p{Ll})/gu, "Mime Junior")
      .replace(/\bMime Jr\.\.?/g, "Mime Junior.")
  );
}

/** The words Piper says. Only Piper's text goes through this. */
export function piperSpeech(text: string): string {
  return spellOut(text).replace(NAME_PATTERN, (found: string) => sameCase(found, SAID.get(found.toLowerCase()) ?? found));
}

/** Lines that show each fix. scripts/piper-phonemes.ts checks their IPA against scripts/piper-ipa.json. */
export const PIPER_SAID_WORDS: string[] = [
  ...PIPER_NAMES.map(([name]) => name),
  "It burns at 2,500° F.",
  "It boosts the Sp. Atk and Sp. Def stats.",
  "It boosts the Sp. It lives in grassland.",
  "It is a strong believer in the one-hit KO.",
  "An unknown life-form called a UB.",
  "It stakes out the location... but it’s always snoozing.",
  "It is very strong—when it butts heads, mountains shake.",
  "It is Mime Jr.. It grows from Mime Jr. and becomes Mr. Mime.",
];
