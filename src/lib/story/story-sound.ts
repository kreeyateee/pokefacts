/**
 * Sound for adventure cards: short effects a story plays between lines, the ambience of each place,
 * and a quiet music bed under each scene. Every file lives in public/sounds/ and has one constant here,
 * so replacing a file with your own recording changes it on the page and on every card sent afterwards.
 * scripts/make-safari-sounds.ts synthesises the default set from plain waves and noise.
 *
 * A story writes an effect as a cue, such as [catch], where it should play. Cues are never read aloud.
 */

/** The Poké Ball catch: three wobbling thuds, then a click and a little chime. */
export const CATCH_SOUND_PATH = "/sounds/pokeball-catch.mp3";
/** Two wobbles, then the ball pops open and the Pokémon breaks free. */
export const ESCAPE_SOUND_PATH = "/sounds/pokeball-escape.mp3";
/** A Safari Ball through the air. */
export const THROW_SOUND_PATH = "/sounds/ball-throw.mp3";
/** A Pokémon scurrying off. */
export const RUN_SOUND_PATH = "/sounds/pokemon-run.mp3";
/** The big wooden gate creaking open. */
export const GATE_SOUND_PATH = "/sounds/gate-creak.mp3";
/** Marigold's whistle. */
export const WHISTLE_SOUND_PATH = "/sounds/warden-whistle.mp3";
/** A few footsteps on the path. */
export const FOOTSTEPS_SOUND_PATH = "/sounds/footsteps.mp3";
/** A short fanfare after a catch. */
export const FANFARE_SOUND_PATH = "/sounds/catch-fanfare.mp3";
/** A little sting at the end of the day. */
export const ENDING_SOUND_PATH = "/sounds/ending-sting.mp3";
/** The big one, for the golden ending. */
export const GOLDEN_SOUND_PATH = "/sounds/golden-fanfare.mp3";
/** A move that lands hard: a rush of air and a thump. */
export const HIT_SOUND_PATH = "/sounds/super-effective.mp3";
/** A move that does nothing much: a sad little slide down. */
export const FIZZLE_SOUND_PATH = "/sounds/not-very-effective.mp3";
/** The crowd cheering. */
export const CHEER_SOUND_PATH = "/sounds/crowd-cheer.mp3";
/** A badge pinned on: a bright chime. */
export const BADGE_SOUND_PATH = "/sounds/badge-chime.mp3";

export const STORY_SOUNDS = {
  catch: CATCH_SOUND_PATH,
  escape: ESCAPE_SOUND_PATH,
  throw: THROW_SOUND_PATH,
  run: RUN_SOUND_PATH,
  gate: GATE_SOUND_PATH,
  whistle: WHISTLE_SOUND_PATH,
  footsteps: FOOTSTEPS_SOUND_PATH,
  fanfare: FANFARE_SOUND_PATH,
  ending: ENDING_SOUND_PATH,
  golden: GOLDEN_SOUND_PATH,
  hit: HIT_SOUND_PATH,
  fizzle: FIZZLE_SOUND_PATH,
  cheer: CHEER_SOUND_PATH,
  badge: BADGE_SOUND_PATH,
} as const;

export type StorySound = keyof typeof STORY_SOUNDS;

/** When each wobble of the catch sound lands, and when it clicks, in seconds. The ball animation follows these. */
export const CATCH_WOBBLES = [0.05, 0.6, 1.15] as const;
export const CATCH_CLICK = 1.8;

/** Loops of the sound of each place, played quietly under a scene. */
export const STORY_AMBIENCE = {
  gate: "/sounds/ambience-gate.mp3",
  grass: "/sounds/ambience-long-grass.mp3",
  woods: "/sounds/ambience-night-woods.mp3",
  cave: "/sounds/ambience-cave.mp3",
  mountain: "/sounds/ambience-mountain-wind.mp3",
  canyon: "/sounds/ambience-canyon.mp3",
  sea: "/sounds/ambience-sea.mp3",
  lake: "/sounds/ambience-lake.mp3",
  house: "/sounds/ambience-rest-house.mp3",
  stadium: "/sounds/ambience-stadium.mp3",
} as const;

export type StoryAmbience = keyof typeof STORY_AMBIENCE;

/** Loops of gentle music, one mood each, played under a scene and ducked whenever someone speaks. */
export const STORY_MUSIC = {
  bright: "/sounds/music-bright.mp3",
  calm: "/sounds/music-calm.mp3",
  mysterious: "/sounds/music-mysterious.mp3",
  adventure: "/sounds/music-adventure.mp3",
  tense: "/sounds/music-tense.mp3",
  homely: "/sounds/music-homely.mp3",
  magical: "/sounds/music-magical.mp3",
  battle: "/sounds/music-battle.mp3",
  champion: "/sounds/music-champion.mp3",
} as const;

export type StoryMusic = keyof typeof STORY_MUSIC;

/** What plays under a scene. */
export type StoryBed = { ambience?: StoryAmbience; music?: StoryMusic };

export function isStorySound(value: unknown): value is StorySound {
  return typeof value === "string" && Object.hasOwn(STORY_SOUNDS, value);
}

export function isStoryAmbience(value: unknown): value is StoryAmbience {
  return typeof value === "string" && Object.hasOwn(STORY_AMBIENCE, value);
}

export function isStoryMusic(value: unknown): value is StoryMusic {
  return typeof value === "string" && Object.hasOwn(STORY_MUSIC, value);
}

/** A bed from a request, or null when there is none or it names a sound that does not exist. */
export function readStoryBed(value: unknown): StoryBed | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const bed: StoryBed = {};
  if (row.ambience !== undefined) {
    if (!isStoryAmbience(row.ambience)) return null;
    bed.ambience = row.ambience;
  }
  if (row.music !== undefined) {
    if (!isStoryMusic(row.music)) return null;
    bed.music = row.music;
  }
  return bed.ambience || bed.music ? bed : null;
}

/** A cue in story text: [catch]. */
export const SOUND_CUE = /\[(\w+)\]/g;

/** A Pokémon's cry at a point in the story: [cry:25]. */
export const CRY_CUE = /\[cry:(\d{1,4})\]/g;

/** Highest national Pokédex number with a cry. */
export const LAST_CRY = 1025;

export function isCryId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= LAST_CRY;
}

/** The text with its sound and cry cues taken out, for reading on the page and counting length. */
export function withoutCues(text: string): string {
  return text
    .replace(CRY_CUE, " ")
    .replace(SOUND_CUE, (cue, name: string) => (isStorySound(name) ? " " : cue))
    .replace(/\s+/g, " ")
    .trim();
}
