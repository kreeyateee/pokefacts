"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { isPiperVoice, PICKER_VOICES } from "@/lib/piper-voice";
import { voiceSampleBody } from "@/lib/voice-choice";
import { yotoFetch } from "@/lib/yoto-session";

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
  const clipUrl = useRef<string | null>(null);
  const hearAbort = useRef<AbortController | null>(null);
  const [hearingId, setHearingId] = useState<string | null>(null);
  const [hearError, setHearError] = useState("");

  useEffect(() => {
    return () => {
      hearAbort.current?.abort();
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    };
  }, []);

  function stopSample() {
    hearAbort.current?.abort();
    hearAbort.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    if (clipUrl.current) {
      URL.revokeObjectURL(clipUrl.current);
      clipUrl.current = null;
    }
    setHearingId(null);
  }

  async function hearSample(voiceId: string) {
    if (hearingId === voiceId) {
      stopSample();
      return;
    }
    stopSample();
    onChange(voiceId);
    const controller = new AbortController();
    hearAbort.current = controller;
    setHearingId(voiceId);
    setHearError("");
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
      clipUrl.current = url;
      const audio = audioRef.current;
      if (!audio) throw new Error("Could not play this voice.");
      audio.src = url;
      audio.onended = () => setHearingId(null);
      try {
        await audio.play();
      } catch {
        setHearError("Press play on the recording.");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setHearingId(null);
      const message = error instanceof Error ? error.message : "Could not play this voice.";
      setHearError(
        /connect yoto/i.test(message) ? "Connect Yoto to hear this voice. Piper plays without that login." : message,
      );
    }
  }

  return (
    <fieldset className="grid gap-2 text-sm" disabled={disabled}>
      <legend className="font-medium">Voice</legend>
      <div className="grid gap-2">
        {PICKER_VOICES.map((voice) => {
          const selected = value === voice.id;
          return (
            <div key={voice.id} className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="radio"
                  name={id}
                  value={voice.id}
                  checked={selected}
                  onChange={() => onChange(voice.id)}
                />
                <span>
                  {voice.name} — {voice.note}
                </span>
              </label>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                disabled={disabled}
                aria-label={`Hear ${voice.name}`}
                onClick={() => void hearSample(voice.id)}
              >
                {hearingId === voice.id ? "Stop" : "Hear"}
              </Button>
            </div>
          );
        })}
      </div>
      <audio ref={audioRef} controls className="mt-1 w-full max-w-md" preload="none" />
      {hearError ? (
        <p className="text-xs leading-5 pk-danger" role="alert">
          {hearError}
        </p>
      ) : isPiperVoice(value) ? (
        <p className="text-xs leading-5 pk-quiet">
          Cori, British, in a Pokédex cadence. Piper reads here, so Hear works before you connect Yoto. Send still
          needs a Yoto login. Lily, George, Brian, and Adam are Yoto voices.
        </p>
      ) : (
        <p className="text-xs leading-5 pk-quiet">
          This voice is recorded by Yoto. Hear a sample on this page, then send. If that sample fails, try Piper —
          Pokédex.
        </p>
      )}
    </fieldset>
  );
}
