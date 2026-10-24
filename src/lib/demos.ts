/**
 * Listening demos: a few recorded tracks on an unlisted page, with buttons for a thumbs up or down and a
 * note on each, so a voice or a card can be tried out before it goes on the site. The MP3s live in
 * public/demos/<slug>/.
 */
export type DemoTrack = {
  /** The MP3's name in public/demos/<slug>/, without .mp3. Also the track's id in feedback. */
  id: string;
  title: string;
  /** Which set the track is from, such as Quick Facts. */
  set: string;
};

export type Demo = {
  slug: string;
  title: string;
  blurb: string;
  tracks: readonly DemoTrack[];
};

const BIRDS_QUICK = ["Robin", "Sparrow", "Blackbird", "Magpie", "Crow", "Pigeon", "Gull", "Mallard", "Swan", "Penguin"];
const BIRDS_GUESS = ["Blackbird", "Pigeon", "Swan", "Eagle", "Flamingo", "Woodpecker", "Swallow", "Cuckoo"];
const POKE_QUICK = ["Bulbasaur", "Charmander", "Squirtle", "Pikachu", "Meowth"];
const POKE_GUESS = ["Charizard", "Blastoise", "Pidgey", "Clefairy", "Jigglypuff"];

function numbered(prefix: string, names: readonly string[], set: string): DemoTrack[] {
  return names.map((name, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, "0")}-${name.toLowerCase()}`,
    title: name,
    set,
  }));
}

export const DEMOS: readonly Demo[] = [
  {
    slug: "animalia-birds",
    title: "Animalia bird demo",
    blurb:
      "Eighteen bird tracks read by Sarah, a Yoto voice: ten Quick Facts, then eight Who's That riddles. Each one starts with the bird's real call. In a riddle, shout your guess before the answer plays.",
    tracks: [...numbered("quick", BIRDS_QUICK, "Quick Facts"), ...numbered("guess", BIRDS_GUESS, "Who's That")],
  },
  {
    slug: "pokefacts",
    title: "Pokefacts demo",
    blurb:
      "Ten Pokémon tracks read by Sarah, a Yoto voice: five Quick Facts, then five Who's That riddles. Each one starts with the Pokémon's cry. In a riddle, shout your guess before the answer plays.",
    tracks: [...numbered("quick", POKE_QUICK, "Quick Facts"), ...numbered("guess", POKE_GUESS, "Who's That")],
  },
];

export function findDemo(slug: string): Demo | undefined {
  return DEMOS.find((demo) => demo.slug === slug);
}

export function demoTrackSrc(demo: Demo, track: DemoTrack): string {
  return `/demos/${demo.slug}/${track.id}.mp3`;
}

export const FEEDBACK_NOTE_LIMIT = 1000;

export type DemoFeedback = {
  slug: string;
  /** A track id, or "" for the demo as a whole. */
  track: string;
  vote: "up" | "down" | null;
  note: string;
};

/** A feedback post checked against the demo it names, or null when it names nothing real or says nothing. */
export function cleanFeedback(value: unknown): DemoFeedback | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const demo = typeof row.slug === "string" ? findDemo(row.slug) : undefined;
  if (!demo) return null;
  const track = typeof row.track === "string" ? row.track : "";
  if (track && !demo.tracks.some((item) => item.id === track)) return null;
  const vote = row.vote === "up" || row.vote === "down" ? row.vote : null;
  const note = typeof row.note === "string" ? row.note.replace(/\s+/g, " ").trim().slice(0, FEEDBACK_NOTE_LIMIT) : "";
  if (!vote && !note) return null;
  return { slug: demo.slug, track, vote, note };
}
