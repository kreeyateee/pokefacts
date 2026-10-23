import { chosenVoice } from "@/lib/piper-voice";
import type { MixSettings } from "@/lib/playback-settings";
import type { StoryBed } from "@/lib/story/story-sound";
import type { TrackPart } from "@/lib/story/story-voices";

const VOICE_STORAGE_KEY = "champdex.voiceId";

type VoiceStorage = {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
};

export function readVoiceId(storage: VoiceStorage): string {
  return chosenVoice(storage.getItem(VOICE_STORAGE_KEY));
}

export function writeVoiceId(storage: Required<Pick<VoiceStorage, "getItem" | "setItem">>, id: string): string {
  const voiceId = chosenVoice(id);
  storage.setItem(VOICE_STORAGE_KEY, voiceId);
  return voiceId;
}

/** Short Pokédex line for the on-page voice buttons. No cry is mixed in. */
const VOICE_SAMPLE_TITLE = "Voice sample";
const VOICE_SAMPLE_TEXT =
  "Pikachu. This Pokémon stores electricity in its cheeks. It lets that charge go when it is excited.";

/** Hear request for one voice, with no cry in front. */
export function voiceSampleBody(voiceId?: string) {
  return demoHearBody({ text: VOICE_SAMPLE_TEXT, voiceId, title: VOICE_SAMPLE_TITLE });
}

/** Drop the wiki name. The on-page credit stays; the recording must not say it. */
export function spokenForDemo(text: string): string {
  return text.replace(/\bBulbapedia\b/gi, "").replace(/\s+/g, " ").trim();
}

/** Body for the Hear request. A Yoto Labs voice is sent to Labs. Piper is spoken on this computer. */
export function demoHearBody(input: {
  text: string;
  voiceId?: string;
  dexId?: number;
  title?: string;
  mix?: Partial<MixSettings>;
}): {
  text: string;
  voiceId: string;
  title?: string;
  dexId?: number;
  cryVolume?: number;
  voiceVolume?: number;
  pauseSeconds?: number;
} {
  const body: {
    text: string;
    voiceId: string;
    title?: string;
    dexId?: number;
    cryVolume?: number;
    voiceVolume?: number;
    pauseSeconds?: number;
  } = {
    text: spokenForDemo(input.text),
    voiceId: chosenVoice(input.voiceId),
  };
  if (input.title?.trim()) body.title = input.title.trim().slice(0, 80);
  if (input.dexId) body.dexId = input.dexId;
  if (input.mix) {
    body.cryVolume = input.mix.cryVolume;
    body.voiceVolume = input.mix.voiceVolume;
    body.pauseSeconds = input.mix.pauseSeconds;
  }
  return body;
}

/** Body for one fact-track step. A Yoto Labs voice is recorded there. Piper stays on this computer. */
export function factTrackBody(input: {
  text: string;
  title: string;
  dexId?: number;
  name?: string;
  voiceId?: string;
  speechJobId?: string;
  speechCardId?: string;
  speechPart?: string;
  parts?: TrackPart[];
  bed?: StoryBed;
  uploadId?: string;
  mix?: Partial<MixSettings>;
}): {
  text: string;
  title: string;
  voiceId: string;
  dexId?: number;
  name?: string;
  speechJobId?: string;
  speechCardId?: string;
  speechPart?: string;
  parts?: TrackPart[];
  bed?: StoryBed;
  uploadId?: string;
  cryVolume?: number;
  voiceVolume?: number;
  pauseSeconds?: number;
} {
  return {
    text: input.text,
    title: input.title,
    voiceId: chosenVoice(input.voiceId),
    ...(input.dexId != null ? { dexId: input.dexId } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.speechJobId ? { speechJobId: input.speechJobId } : {}),
    ...(input.speechCardId ? { speechCardId: input.speechCardId } : {}),
    ...(input.speechPart ? { speechPart: input.speechPart } : {}),
    ...(input.parts?.length ? { parts: input.parts } : {}),
    ...(input.parts?.length && input.bed ? { bed: input.bed } : {}),
    ...(input.uploadId ? { uploadId: input.uploadId } : {}),
    ...(input.mix
      ? {
          cryVolume: input.mix.cryVolume,
          voiceVolume: input.mix.voiceVolume,
          pauseSeconds: input.mix.pauseSeconds,
        }
      : {}),
  };
}
