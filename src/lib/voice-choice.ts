import { chosenVoice } from "@/lib/piper-voice";

export const VOICE_STORAGE_KEY = "champdex.voiceId";

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

/** Drop the wiki name. The on-page credit stays; the recording must not say it. */
export function spokenForDemo(text: string): string {
  return text.replace(/\bBulbapedia\b/gi, "").replace(/\s+/g, " ").trim();
}

/** Body for the Hear request. A Yoto Labs voice is sent to Labs. Piper is spoken on this computer. */
export function demoHearBody(input: { text: string; voiceId?: string; dexId?: number; title?: string }): {
  text: string;
  voiceId: string;
  title?: string;
  dexId?: number;
} {
  const body: { text: string; voiceId: string; title?: string; dexId?: number } = {
    text: spokenForDemo(input.text),
    voiceId: chosenVoice(input.voiceId),
  };
  if (input.title?.trim()) body.title = input.title.trim().slice(0, 80);
  if (input.dexId) body.dexId = input.dexId;
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
  uploadId?: string;
}): {
  text: string;
  title: string;
  voiceId: string;
  dexId?: number;
  name?: string;
  speechJobId?: string;
  speechCardId?: string;
  uploadId?: string;
} {
  return {
    text: input.text,
    title: input.title,
    voiceId: chosenVoice(input.voiceId),
    ...(input.dexId != null ? { dexId: input.dexId } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.speechJobId ? { speechJobId: input.speechJobId } : {}),
    ...(input.speechCardId ? { speechCardId: input.speechCardId } : {}),
    ...(input.uploadId ? { uploadId: input.uploadId } : {}),
  };
}
