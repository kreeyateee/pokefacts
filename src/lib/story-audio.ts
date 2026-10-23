import { readFile } from "node:fs/promises";
import path from "node:path";

import { joinClips, mixUnderBed, type BedClip } from "@/lib/cry-audio";
import { STORY_AMBIENCE, STORY_MUSIC, STORY_SOUNDS, type StoryBed, type StorySound } from "@/lib/story/story-sound";
import type { TrackPart } from "@/lib/story/story-voices";

const PUBLIC_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "public");

/**
 * How loud the beds sit under the words. Both files peak at 0.7; at these levels the two together are
 * about 15 dB under a normal reading between lines, and ducking presses them down further while anyone
 * speaks, so every word stays clear.
 */
export const AMBIENCE_VOLUME = 0.13;
export const MUSIC_VOLUME = 0.1;

export type SpokenPart = Extract<TrackPart, { text: string }>;

export function isSpokenPart(part: TrackPart): part is SpokenPart {
  return "text" in part;
}

async function publicFile(file: string, root: string): Promise<Buffer> {
  return readFile(path.join(/* turbopackIgnore: true */ root, file));
}

/** A story sound, read fresh each time so a replaced file is used straight away. */
export async function storySound(sound: StorySound, root = PUBLIC_ROOT): Promise<Buffer> {
  return publicFile(STORY_SOUNDS[sound], root);
}

/** The ambience and music loops for a scene, at the levels they play under speech. */
export async function bedClips(bed: StoryBed | null | undefined, root = PUBLIC_ROOT): Promise<BedClip[]> {
  const clips: BedClip[] = [];
  if (bed?.ambience) clips.push({ audio: await publicFile(STORY_AMBIENCE[bed.ambience], root), volume: AMBIENCE_VOLUME });
  if (bed?.music) clips.push({ audio: await publicFile(STORY_MUSIC[bed.music], root), volume: MUSIC_VOLUME });
  return clips;
}

/**
 * One WAV of every line in its own voice, with the sounds where the story puts them,
 * and the scene's ambience and music underneath.
 */
export async function joinTrackParts(
  parts: readonly TrackPart[],
  speechFor: (part: SpokenPart) => Promise<Buffer>,
  soundRoot = PUBLIC_ROOT,
  bed?: StoryBed | null,
): Promise<Buffer> {
  const clips = [];
  for (const part of parts) {
    clips.push(
      isSpokenPart(part)
        ? { audio: await speechFor(part), pitch: part.pitch, tempo: part.tempo, speech: true, tight: part.tight }
        : { audio: await storySound(part.sound, soundRoot) },
    );
  }
  const joined = await joinClips(clips);
  const beds = await bedClips(bed, soundRoot);
  return beds.length > 0 ? mixUnderBed(joined, beds) : joined;
}
