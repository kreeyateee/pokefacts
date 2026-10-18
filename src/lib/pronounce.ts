/**
 * Names the narrator misreads. The page keeps the real spelling.
 * The spoken copy uses these respellings so the sound matches the name.
 */
const SPOKEN_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["Charmeleon", "Char me lee un"],
  ["Wartortle", "War tore tull"],
  ["Blastoise", "Blast oyss"],
  ["Venusaur", "Vee nuh sore"],
  ["Vaporeon", "Vay pore ee on"],
  ["Jigglypuff", "Jig lee puff"],
  ["Wigglytuff", "Wig lee tuff"],
  ["Igglybuff", "Ig lee buff"],
  ["Wishiwashi", "Wish ee wash ee"],
  ["Glaceon", "Glay see on"],
  ["Sylveon", "Sil vee on"],
  ["Leafeon", "Leaf ee on"],
  ["Flareon", "Flair ee on"],
  ["Jolteon", "Jole tee on"],
  ["Espeon", "Ess pee on"],
  ["Umbreon", "Um bree on"],
  ["Sharpedo", "Shar pee doh"],
  ["Dhelmise", "Dell myze"],
  ["Wailord", "Way lord"],
  ["Wailmer", "Whale mer"],
  ["Gengar", "Gang gar"],
  ["Eevee", "Ee vee"],
  ["Raichu", "Rye choo"],
];

const SPOKEN_IN_ORDER = [...SPOKEN_NAMES].sort((a, b) => b[0].length - a[0].length);

export function pronounce(text: string): string {
  let spoken = text;
  for (const [name, said] of SPOKEN_IN_ORDER) {
    spoken = spoken.replace(new RegExp(`\\b${name}\\b`, "gi"), said);
  }
  return spoken;
}
