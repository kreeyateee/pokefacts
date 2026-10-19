"use client";

import {
  writePlayback,
  type PlaybackSettings,
} from "@/lib/playback-settings";

export function PlaybackPanel({
  settings,
  onChange,
}: {
  settings: PlaybackSettings;
  onChange: (settings: PlaybackSettings) => void;
}) {
  function update(next: PlaybackSettings) {
    onChange(writePlayback(localStorage, next));
  }

  return (
    <details className="pk-card mt-4 px-4 py-3">
      <summary className="cursor-pointer text-sm font-bold">Settings</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm" htmlFor="cry-loudness">
          Cry loudness
          <input
            id="cry-loudness"
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
        Loudness and the pause are used when the cry is mixed in front of the voice. A change makes a new mix, so an
        older recording is not reused.
      </p>
    </details>
  );
}
