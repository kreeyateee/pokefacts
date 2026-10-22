import { readFile } from "node:fs/promises";
import path from "node:path";

import { joinClips } from "@/lib/cry-audio";
import { STORY_SOUNDS, type StorySound } from "@/lib/story/story-sound";
import type { TrackPart } from "@/lib/story/story-voices";

const PUBLIC_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "public");

export type SpokenPart = Extract<TrackPart, { text: string }>;

export function isSpokenPart(part: TrackPart): part is SpokenPart {
  return "text" in part;
}

/** A story sound, read fresh each time so a replaced file is used straight away. */
export async function storySound(sound: StorySound, root = PUBLIC_ROOT): Promise<Buffer> {
  return readFile(path.join(/* turbopackIgnore: true */ root, STORY_SOUNDS[sound]));
}

/** One WAV of every line in its own voice, with the sounds where the story puts them. */
export async function joinTrackParts(
  parts: readonly TrackPart[],
  speechFor: (part: SpokenPart) => Promise<Buffer>,
  soundRoot = PUBLIC_ROOT,
): Promise<Buffer> {
  const clips = [];
  for (const part of parts) {
    clips.push(
      isSpokenPart(part)
        ? { audio: await speechFor(part), pitch: part.pitch, tempo: part.tempo }
        : { audio: await storySound(part.sound, soundRoot) },
    );
  }
  return joinClips(clips);
}
