"use client";

import {
  writePlayback,
  type PlaybackSettings,
} from "@/lib/playback-settings";
import { isPiperVoice, PICKER_VOICES } from "@/lib/piper-voice";

export function PlaybackPanel({
  settings,
  onChange,
  voiceId,
  onVoiceId,
}: {
  settings: PlaybackSettings;
  onChange: (settings: PlaybackSettings) => void;
  voiceId: string;
  onVoiceId: (voiceId: string) => void;
}) {
  function update(next: PlaybackSettings) {
    onChange(writePlayback(localStorage, next));
  }

  const voice = PICKER_VOICES.find((item) => item.id === voiceId) ?? PICKER_VOICES[0];

  return (
    <details className="pk-card mt-4 px-4 py-3">
      <summary className="cursor-pointer">
        <span className="block text-base font-bold">Settings</span>
        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
          Voice is {voice?.name ?? "not chosen"}. Open this for the voice, how loud the cry is, and units.
        </span>
      </summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1 text-sm lg:col-span-2" htmlFor="voice">
          Voice
          <select
            id="voice"
            aria-label="Voice"
            className="pk-field max-w-md"
            value={voiceId}
            onChange={(event) => onVoiceId(event.target.value)}
          >
            {PICKER_VOICES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.note}
              </option>
            ))}
          </select>
          <span className="text-xs leading-5 text-muted-foreground">
            {isPiperVoice(voiceId)
              ? "Cori, British. Piper reads on this computer, so Hear and building facts work before you connect Yoto. Sending a playlist still needs a Yoto login."
              : "Lily, George, Brian, and Adam need a Yoto login to speak. Building facts does not create a playlist."}
          </span>
        </label>
        <label className="grid gap-1 text-sm" htmlFor="cry-loudness">
          Cry loudness
          <input
            id="cry-loudness"
            aria-label="Cry loudness"
            type="range"
            min={0.5}
            max={8}
            step={0.5}
            value={settings.cryVolume}
            onChange={(event) => update({ ...settings, cryVolume: Number(event.target.value) })}
          />
          <span className="text-xs text-muted-foreground">{settings.cryVolume}×</span>
        </label>
        <label className="grid gap-1 text-sm" htmlFor="voice-loudness">
          Voice loudness
          <input
            id="voice-loudness"
            aria-label="Voice loudness"
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={settings.voiceVolume}
            onChange={(event) => update({ ...settings, voiceVolume: Number(event.target.value) })}
          />
          <span className="text-xs text-muted-foreground">{settings.voiceVolume}×</span>
        </label>
        <label className="grid gap-1 text-sm" htmlFor="cry-pause">
          Pause after the cry
          <input
            id="cry-pause"
            aria-label="Pause after the cry"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={settings.pauseSeconds}
            onChange={(event) => update({ ...settings, pauseSeconds: Number(event.target.value) })}
          />
          <span className="text-xs text-muted-foreground">{settings.pauseSeconds.toFixed(2)} seconds</span>
        </label>
        <fieldset className="grid content-start gap-2 text-sm">
          <legend className="font-medium">Units</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="measure-units"
              checked={settings.units === "metric"}
              onChange={() => update({ ...settings, units: "metric" })}
            />
            Metric, kilograms and centimetres
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="measure-units"
              checked={settings.units === "imperial"}
              onChange={() => update({ ...settings, units: "imperial" })}
            />
            Imperial, pounds and feet
          </label>
        </fieldset>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Hear, building facts on this PC, and playlist creation all use this voice and these volumes. A change of
        loudness or pause makes a new mix, so an older recording is not reused. Node, ffmpeg, and the Yoto login are
        on the Setup tab.
      </p>
    </details>
  );
}
