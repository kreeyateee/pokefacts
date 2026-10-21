"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { isPiperVoice, PICKER_VOICES } from "@/lib/piper-voice";
import { voiceSampleBody } from "@/lib/voice-choice";
import { YOTO_VOICES } from "@/lib/yoto-icons";
import { yotoFetch } from "@/lib/yoto-session";

const sampleUrls = new Map<string, string>();

export function VoiceField({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hearAbort = useRef<AbortController | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [hearingId, setHearingId] = useState<string | null>(null);
  const [hearError, setHearError] = useState("");
  const [hasClip, setHasClip] = useState(false);

  useEffect(() => {
    return () => {
      hearAbort.current?.abort();
    };
  }, []);

  function stopSample() {
    hearAbort.current?.abort();
    hearAbort.current = null;
    const audio = audioRef.current;
    if (audio) audio.pause();
    setLoadingId(null);
    setHearingId(null);
  }

  async function playUrl(voiceId: string, url: string) {
    const audio = audioRef.current;
    if (!audio) throw new Error("Could not play this voice.");
    audio.src = url;
    audio.onended = () => setHearingId(null);
    setHasClip(true);
    setHearingId(voiceId);
    setLoadingId(null);
    try {
      await audio.play();
    } catch {
      setHearError("Press play on the recording.");
    }
  }

  async function hearSample(voiceId: string) {
    if (hearingId === voiceId || loadingId === voiceId) {
      stopSample();
      return;
    }
    stopSample();
    onChange(voiceId);
    setHearError("");
    const cached = sampleUrls.get(voiceId);
    if (cached) {
      await playUrl(voiceId, cached);
      return;
    }
    const controller = new AbortController();
    hearAbort.current = controller;
    setLoadingId(voiceId);
    try {
      const piper = isPiperVoice(voiceId);
      const response = await (piper ? fetch : yotoFetch)("/api/yoto/hear", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voiceSampleBody(voiceId)),
      });
      if (controller.signal.aborted) return;
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("audio")) {
        const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        throw new Error(payload?.message || payload?.error || "Could not play this voice.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      sampleUrls.set(voiceId, url);
      await playUrl(voiceId, url);
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadingId(null);
      setHearingId(null);
      const message = error instanceof Error ? error.message : "Could not play this voice.";
      setHearError(
        /connect yoto/i.test(message) ? "Connect Yoto to hear this voice. Piper plays without that login." : message,
      );
    }
  }

  return (
    <fieldset className="grid gap-2 text-sm" disabled={disabled}>
      <legend className="pk-section-title">Voice</legend>
      <div className="grid gap-2">
        {PICKER_VOICES.map((voice) => {
          const selected = value === voice.id;
          const busy = loadingId === voice.id;
          const playing = hearingId === voice.id;
          return (
            <div
              key={voice.id}
              className="pk-voice"
              data-checked={selected ? "true" : undefined}
            >
              <label className="pk-voice-copy">
                <input
                  type="radio"
                  name={id}
                  value={voice.id}
                  checked={selected}
                  onChange={() => onChange(voice.id)}
                />
                <span className="pk-voice-name">
                  {voice.name}
                  {voice.id === YOTO_VOICES[0].id ? <span className="pk-badge">Usual</span> : null}
                  {isPiperVoice(voice.id) ? <span className="pk-badge pk-badge-lite">On this site</span> : null}
                </span>
                <span className="pk-voice-note">{voice.note}</span>
              </label>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                disabled={disabled}
                aria-label={playing || busy ? `Stop ${voice.name}` : `Hear ${voice.name}`}
                onClick={() => void hearSample(voice.id)}
              >
                {busy ? "Hearing…" : playing ? "Stop" : "Hear"}
              </Button>
            </div>
          );
        })}
      </div>
      <audio
        ref={audioRef}
        controls={hasClip}
        className={hasClip ? "pk-audio mt-1" : "hidden"}
        preload="none"
      />
      {hearError ? (
        <p className="text-xs leading-5 pk-danger" role="alert">
          {hearError}
        </p>
      ) : isPiperVoice(value) ? (
        <p className="text-xs leading-5 pk-quiet">
          Cori, British, in a Pokédex cadence. Hear works before you connect Yoto. Sending the card still needs a
          login. Lily, George, Brian, and Adam are Yoto voices.
        </p>
      ) : (
        <p className="text-xs leading-5 pk-quiet">
          This voice is recorded by Yoto. Hear it here, then send. If that sample fails, try Piper — Pokédex.
        </p>
      )}
    </fieldset>
  );
}
