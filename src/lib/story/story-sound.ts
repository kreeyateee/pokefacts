/**
 * Sound effects a story can play between spoken lines.
 * A story writes a cue such as [catch] in its text; it is never read aloud.
 */

/**
 * The Poké Ball catch sound, served from public/. Replace that one file with your own short MP3
 * to change it on the page preview and on every card sent afterwards.
 * scripts/make-catch-sound.ts writes the default one.
 */
export const CATCH_SOUND_PATH = "/sounds/pokeball-catch.mp3";

export const STORY_SOUNDS = {
  catch: CATCH_SOUND_PATH,
} as const;

export type StorySound = keyof typeof STORY_SOUNDS;

export function isStorySound(value: unknown): value is StorySound {
  return typeof value === "string" && Object.hasOwn(STORY_SOUNDS, value);
}

/** A cue in story text: [catch]. */
export const SOUND_CUE = /\[(\w+)\]/g;

/** The text with its sound cues taken out, for reading on the page and counting length. */
export function withoutCues(text: string): string {
  return text.replace(SOUND_CUE, " ").replace(/\s+/g, " ").trim();
}
