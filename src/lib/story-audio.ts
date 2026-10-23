import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  audioDurationSeconds,
  inputContainer,
  integratedLoudness,
  joinClips,
  levelCryGain,
  mixUnderBed,
  type BedClip,
} from "@/lib/cry-audio";
import { DEFAULT_CRY_VOLUME, type MixSettings } from "@/lib/playback-settings";
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

/** How loud a cry in the middle of a scene plays: about as loud as a voice reading (Lily is about -19 LUFS). */
const CRY_TARGET_LUFS = -18;

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

/** Where a sound plays in a recording, in seconds from its start. */
export type SoundCue = { sound: StorySound; at: number };

/**
 * One WAV of every line in its own voice, with the sounds where the story puts them,
 * and the scene's ambience and music underneath. Also says when each sound plays.
 */
export async function joinTrackParts(
  parts: readonly TrackPart[],
  speechFor: (part: SpokenPart) => Promise<Buffer>,
  soundRoot = PUBLIC_ROOT,
  bed?: StoryBed | null,
  cryFor: (dexId: number) => Promise<Buffer> = () => Promise.reject(new Error("This story plays a cry, but no cry was found.")),
): Promise<{ wav: Buffer; cues: SoundCue[] }> {
  const clips = [];
  for (const part of parts) {
    if ("cry" in part) {
      // A cry in the middle of a scene, brought level with the voices around it.
      const cry = await cryFor(part.cry);
      const loudness = await integratedLoudness(cry);
      const volume = loudness === null ? 1 : Math.max(0.05, Math.min(4, 10 ** ((CRY_TARGET_LUFS - loudness) / 20)));
      clips.push({ audio: cry, volume });
      continue;
    }
    clips.push(
      isSpokenPart(part)
        ? { audio: await speechFor(part), pitch: part.pitch, tempo: part.tempo, speech: true, tight: part.tight }
        : { audio: await storySound(part.sound, soundRoot) },
    );
  }
  const joined = await joinClips(clips);
  const cues = parts.flatMap((part, index) =>
    "sound" in part ? [{ sound: part.sound, at: Math.round((joined.starts[index] ?? 0) * 1000) / 1000 }] : [],
  );
  const beds = await bedClips(bed, soundRoot);
  // The bed goes under the words and does not move them, so the cues stay where they are.
  return { wav: beds.length > 0 ? await mixUnderBed(joined.wav, beds) : joined.wav, cues };
}

/**
 * The cry level with the voices that follow it, scaled by the Settings cry slider. The fact cards boost
 * the cry four times, which on a Safari scene left it about 24 dB louder than the words.
 */
export async function levelledCryMix(cry: Buffer, speech: Buffer, mix: MixSettings): Promise<MixSettings> {
  const [cryLufs, speechLufs] = await Promise.all([integratedLoudness(cry), integratedLoudness(speech)]);
  return { ...mix, cryVolume: levelCryGain(cryLufs, speechLufs, mix.cryVolume, DEFAULT_CRY_VOLUME) };
}

/** Moves the cues along by the cry and the pause that now come first. */
export async function cuesAfterCry(cues: readonly SoundCue[], cry: Buffer, mix: MixSettings): Promise<SoundCue[]> {
  const kind = inputContainer(cry) ?? "ogg";
  const seconds = await audioDurationSeconds(cry, `cry.${kind}`);
  return cues.map((cue) => ({ ...cue, at: Math.round((cue.at + seconds + mix.pauseSeconds) * 1000) / 1000 }));
}
