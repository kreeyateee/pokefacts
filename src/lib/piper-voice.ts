import { voiceOrLily, YOTO_VOICES } from "@/lib/yoto-icons";

/** Stored voice id. This is not an ElevenLabs id, and Yoto Labs must not receive it. */
export const PIPER_VOICE_ID = "piper:en_GB-cori-high";

/** Preferred British reader. The installer falls back if this file cannot be fetched. */
export const PIPER_MODEL_NAME = "en_GB-cori-high";

export const PIPER_VOICE = {
  id: PIPER_VOICE_ID,
  name: "Piper",
  note: "Pokédex",
} as const;

export const PICKER_VOICES = [...YOTO_VOICES, PIPER_VOICE];

export function isPiperVoice(id?: string | null): boolean {
  return id === PIPER_VOICE_ID;
}

/** Piper stays Piper. Any other saved id is a Yoto Labs voice, or Lily. */
export function chosenVoice(id?: string | null): string {
  if (isPiperVoice(id)) return PIPER_VOICE_ID;
  return voiceOrLily(id ?? undefined);
}
