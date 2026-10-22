"use client";

import { VoiceField } from "@/components/voice-field";
import { pickerVoice } from "@/lib/piper-voice";
import {
  writePlayback,
  type PlaybackSettings,
} from "@/lib/playback-settings";

export function PlaybackPanel({
  settings,
  onChange,
  voiceId,
  onVoiceId,
  idPrefix = "studio",
  embedded = false,
  voicesOnly = false,
}: {
  settings: PlaybackSettings;
  onChange: (settings: PlaybackSettings) => void;
  voiceId?: string;
  onVoiceId?: (voiceId: string) => void;
  idPrefix?: string;
  embedded?: boolean;
  voicesOnly?: boolean;
}) {
  function update(next: PlaybackSettings) {
    onChange(writePlayback(localStorage, next));
  }

  const mix = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm" htmlFor={`${idPrefix}-cry-loudness`}>
        How loud the cry is
        <input
          id={`${idPrefix}-cry-loudness`}
          type="range"
          min={0.5}
          max={8}
          step={0.5}
          value={settings.cryVolume}
          onChange={(event) => update({ ...settings, cryVolume: Number(event.target.value) })}
        />
        <span className="text-xs text-muted-foreground">{settings.cryVolume}×</span>
      </label>
      <label className="grid gap-1 text-sm" htmlFor={`${idPrefix}-voice-loudness`}>
        How loud the voice is
        <input
          id={`${idPrefix}-voice-loudness`}
          type="range"
          min={0.25}
          max={3}
          step={0.25}
          value={settings.voiceVolume}
          onChange={(event) => update({ ...settings, voiceVolume: Number(event.target.value) })}
        />
        <span className="text-xs text-muted-foreground">{settings.voiceVolume}×</span>
      </label>
      <label className="grid gap-1 text-sm" htmlFor={`${idPrefix}-cry-pause`}>
        Pause after the cry
        <input
          id={`${idPrefix}-cry-pause`}
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={settings.pauseSeconds}
          onChange={(event) => update({ ...settings, pauseSeconds: Number(event.target.value) })}
        />
        <span className="text-xs text-muted-foreground">{settings.pauseSeconds.toFixed(2)} seconds</span>
      </label>
      <fieldset className="grid gap-2 text-sm">
        <legend className="font-medium">Units</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${idPrefix}-measure-units`}
            checked={settings.units === "metric"}
            onChange={() => update({ ...settings, units: "metric" })}
          />
          Metric, kilograms and centimetres
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${idPrefix}-measure-units`}
            checked={settings.units === "imperial"}
            onChange={() => update({ ...settings, units: "imperial" })}
          />
          Imperial, pounds and feet
        </label>
      </fieldset>
    </div>
  );

  const voices =
    voiceId !== undefined && onVoiceId ? (
      <VoiceField id={`${idPrefix}-voice`} value={voiceId} onChange={onVoiceId} />
    ) : null;
  const voiceName = voiceId !== undefined ? pickerVoice(voiceId).name : null;

  if (embedded) {
    return (
      <div className="grid gap-4">
        {voices}
        {voicesOnly ? null : mix}
      </div>
    );
  }

  return (
    <details className="pk-card pk-settings mt-4 px-4 py-3">
      <summary className="cursor-pointer text-left">
        <span className="inline-flex w-[calc(100%-1.5rem)] items-center justify-between gap-3 align-middle">
          <span className="font-display text-xl font-bold">Settings</span>
          {voiceName ? <span className="text-sm font-bold pk-quiet">{voiceName}</span> : null}
        </span>
      </summary>
      <p className="mt-3 text-xs leading-5 pk-quiet">
        Lily is the usual voice. Hear any of them here, then send. Send asks you to confirm before it records.
      </p>
      <div className="mt-3 grid gap-3">
        {voices}
        <details>
          <summary className="cursor-pointer text-sm font-bold">Cry, loudness, and units</summary>
          <div className="mt-3 grid gap-4">
            {mix}
            <p className="text-xs leading-5 text-muted-foreground">
              These settings are mixed into the recording that goes on the card.
            </p>
          </div>
        </details>
      </div>
    </details>
  );
}
