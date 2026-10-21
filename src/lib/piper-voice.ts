import { voiceOrLily, YOTO_VOICES } from "@/lib/yoto-icons";

/** Stored voice id. This is not an ElevenLabs id, and Yoto Labs must not receive it. */
export const PIPER_VOICE_ID = "piper:en_GB-cori-high";

/** Preferred British reader. The installer falls back if this file cannot be fetched. */
export const PIPER_MODEL_NAME = "en_GB-cori-high";

/**
 * Piper cadence for a handheld Pokédex. Changing this must miss old speech
 * and mix files so Hear and Send do not reuse a conversational take.
 */
export const PIPER_SYNTH_ID = "pokedex-v1";

export const PIPER_VOICE = {
  id: PIPER_VOICE_ID,
  name: "Piper",
  note: "Pokédex",
} as const;

export const PICKER_VOICES = [...YOTO_VOICES, PIPER_VOICE];

export function isPiperVoice(id?: string | null): boolean {
  return id === PIPER_VOICE_ID;
}

/** Lily first. Unknown ids become Lily. */
export function pickerVoice(id?: string | null) {
  const voiceId = chosenVoice(id);
  return PICKER_VOICES.find((voice) => voice.id === voiceId) ?? YOTO_VOICES[0];
}

/** Piper stays Piper. Any other saved id is a Yoto Labs voice, or Lily. */
export function chosenVoice(id?: string | null): string {
  if (isPiperVoice(id)) return PIPER_VOICE_ID;
  return voiceOrLily(id ?? undefined);
}

/** Empty for Yoto Labs voices. Piper recordings include the Pokédex cadence. */
export function piperCacheToken(id?: string | null): string {
  return isPiperVoice(id) ? PIPER_SYNTH_ID : "";
}
