import { voiceOrLily, YOTO_VOICES } from "@/lib/yoto-icons";

/** Stored voice id. This is not an ElevenLabs id, and Yoto Labs must not receive it. */
export const PIPER_VOICE_ID = "piper:en_GB-cori-high";

/** Preferred British reader. The installer falls back if this file cannot be fetched. */
export const PIPER_MODEL_NAME = "en_GB-cori-high";

/**
 * What Piper's takes sound like: its settings and the words it is given. Changing this must miss old
 * speech and mix files so Hear and Send do not reuse an old take.
 * v2: Piper-only name respellings (piper-pronounce.ts) and the livelier read (piper-lively.ts).
 * v3: "Pokémon" said POH-kay-mon, with a full "mon".
 */
export const PIPER_SYNTH_ID = "pokedex-v3";

const PIPER_VOICE = {
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
