export const DEFAULT_CRY_VOLUME = 4;
const DEFAULT_VOICE_VOLUME = 1;
const DEFAULT_PAUSE_SECONDS = 0.35;

const PLAYBACK_STORAGE_KEY = "pokefacts.playback";

export type MeasureUnits = "metric" | "imperial";

/** Fact cards read quick facts then the full reading, or the quick facts alone. */
export type FactLength = "full" | "quick";

export type MixSettings = {
  cryVolume: number;
  voiceVolume: number;
  pauseSeconds: number;
};

export type PlaybackSettings = MixSettings & {
  units: MeasureUnits;
  factLength: FactLength;
};

export function defaultPlayback(): PlaybackSettings {
  return {
    cryVolume: DEFAULT_CRY_VOLUME,
    voiceVolume: DEFAULT_VOICE_VOLUME,
    pauseSeconds: DEFAULT_PAUSE_SECONDS,
    units: "metric",
    factLength: "full",
  };
}

function stepped(value: number, min: number, max: number, step: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = Math.round(clamped / step) * step;
  return Math.round(snapped * 1000) / 1000;
}

/** Cry gain, voice gain, and the silence after the cry. Bad values fall back to the mix already used. */
export function clampMix(input?: Partial<MixSettings> | null): MixSettings {
  return {
    cryVolume: stepped(Number(input?.cryVolume), 0.5, 8, 0.5, DEFAULT_CRY_VOLUME),
    voiceVolume: stepped(Number(input?.voiceVolume), 0.25, 3, 0.25, DEFAULT_VOICE_VOLUME),
    pauseSeconds: stepped(Number(input?.pauseSeconds), 0, 2, 0.05, DEFAULT_PAUSE_SECONDS),
  };
}

function clampPlayback(input?: Partial<PlaybackSettings> | null): PlaybackSettings {
  return {
    ...clampMix(input),
    units: input?.units === "imperial" ? "imperial" : "metric",
    factLength: input?.factLength === "quick" ? "quick" : "full",
  };
}

/**
 * Identity for a finished mix.
 * The historical token stays for the original volume 4, voice 1, and 0.35s pad,
 * so those files are still hits. Any other setting is a different file.
 */
export function mixCacheToken(input?: Partial<MixSettings> | null): string {
  const mix = clampMix(input);
  if (
    mix.cryVolume === DEFAULT_CRY_VOLUME &&
    mix.voiceVolume === DEFAULT_VOICE_VOLUME &&
    mix.pauseSeconds === DEFAULT_PAUSE_SECONDS
  ) {
    return `volume=${DEFAULT_CRY_VOLUME}\npad=${DEFAULT_PAUSE_SECONDS}`;
  }
  return `cry=${mix.cryVolume}\nvoice=${mix.voiceVolume}\npause=${mix.pauseSeconds}`;
}

export function isDefaultMix(input?: Partial<MixSettings> | null): boolean {
  const mix = clampMix(input);
  return (
    mix.cryVolume === DEFAULT_CRY_VOLUME &&
    mix.voiceVolume === DEFAULT_VOICE_VOLUME &&
    mix.pauseSeconds === DEFAULT_PAUSE_SECONDS
  );
}

type PlaybackStorage = {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
};

export function readPlayback(storage: PlaybackStorage): PlaybackSettings {
  const raw = storage.getItem(PLAYBACK_STORAGE_KEY);
  if (!raw) return defaultPlayback();
  try {
    return clampPlayback(JSON.parse(raw) as Partial<PlaybackSettings>);
  } catch {
    return defaultPlayback();
  }
}

export function writePlayback(
  storage: Required<Pick<PlaybackStorage, "getItem" | "setItem">>,
  settings: PlaybackSettings,
): PlaybackSettings {
  const next = clampPlayback(settings);
  storage.setItem(PLAYBACK_STORAGE_KEY, JSON.stringify(next));
  return next;
}
