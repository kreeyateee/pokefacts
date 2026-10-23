/**
 * Expression for the Yoto voices. Yoto records them with ElevenLabs v3 (checked on 2026-10-24 with the
 * #tag-test sample), which acts on audio tags such as [excited], [whispers] or [laughs].
 *
 * Scripts write a tag in braces, {excited}, so it never clashes with story sound cues like [catch].
 * It becomes a square-bracket tag only in the text sent to ElevenLabs. Piper ignores expression and
 * would read the word out, so Piper, browser voices and anything shown on the page drop the tags.
 */
const VOICE_TAG = /\{\s*([a-z][a-z' -]{0,30}?)\s*\}/gi;

/**
 * The expressions the adventures and jokes use. A brace word not on this list is a story's template gap
 * ({type}, {home}), which is filled in before anything is read, so the two never get confused.
 */
export const EXPRESSIONS = [
  "excited",
  "whispers",
  "laughs",
  "giggles",
  "gasps",
  "sighs",
  "shouts",
  "cheerfully",
  "nervously",
  "curious",
  "smugly",
  "sadly",
  "proudly",
  "surprised",
] as const;

/** True for a word on the list of expressions. */
export function isExpression(word: string): boolean {
  return (EXPRESSIONS as readonly string[]).includes(word.trim().toLowerCase());
}

/** The script as ElevenLabs should receive it: {excited} becomes [excited]. */
export function forElevenLabs(text: string): string {
  return text.replace(VOICE_TAG, (_, tag: string) => `[${tag.trim().toLowerCase()}]`);
}

/** The script with its expression tags taken out, for Piper, browser voices and the page. */
export function withoutVoiceTags(text: string): string {
  return text
    .replace(VOICE_TAG, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    // A tag just inside an opening quote ("'{gasps} Look!'") leaves no gap after the quote mark.
    .replace(/(^|\s)(['‘“"]) +/g, "$1$2")
    .replace(/^ +| +$/gm, "");
}

/** True when the text carries at least one expression tag. */
export function hasVoiceTags(text: string): boolean {
  return new RegExp(VOICE_TAG.source, "i").test(text);
}

type SpokenTrack = { type?: unknown; trackUrl?: unknown };
type SpokenChapter = { tracks?: unknown };

/** A card's content with every spoken track's script ready for ElevenLabs. Recorded tracks are untouched. */
export function contentForElevenLabs<T>(card: T): T {
  if (!card || typeof card !== "object") return card;
  const row = card as { content?: { chapters?: unknown } };
  const chapters = row.content?.chapters;
  if (!Array.isArray(chapters)) return card;
  return {
    ...row,
    content: {
      ...row.content,
      chapters: chapters.map((chapter: unknown) => {
        const tracks = (chapter as SpokenChapter | null)?.tracks;
        if (!Array.isArray(tracks)) return chapter;
        return {
          ...(chapter as object),
          tracks: tracks.map((track: unknown) => {
            const spoken = track as SpokenTrack | null;
            if (spoken?.type !== "elevenlabs" || typeof spoken.trackUrl !== "string") return track;
            return { ...spoken, trackUrl: forElevenLabs(spoken.trackUrl) };
          }),
        };
      }),
    },
  } as T;
}
