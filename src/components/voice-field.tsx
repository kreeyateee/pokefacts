"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { isPiperVoice, PICKER_VOICES, pickerVoice } from "@/lib/piper-voice";
import { demoHearBody, voiceSampleBody } from "@/lib/voice-choice";
import { YOTO_VOICES } from "@/lib/yoto-icons";
import { yotoFetch } from "@/lib/yoto-session";

const sampleUrls = new Map<string, string>();

/**
 * Hidden check, shown only at #tag-test: does Yoto's ElevenLabs model act on audio tags?
 * Tags only work on ElevenLabs v3. An older model reads the word "excited" out loud.
 */
const TAG_TEST_TEXT =
  "[excited] Wow! Pikachu just evolved into Raichu! [whispers] Shh. A wild Gengar is right behind you. [laughs] Only joking!";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** Short rows of names instead of one long list. The note shows for the chosen voice. */
const VOICE_GROUPS = [
  { label: "Women", voices: PICKER_VOICES.filter((voice) => /\bwoman\b/i.test(voice.note)) },
  { label: "Men", voices: PICKER_VOICES.filter((voice) => /\bman\b/i.test(voice.note)) },
  { label: "Other", voices: PICKER_VOICES.filter((voice) => !/\b(wo)?man\b/i.test(voice.note)) },
];

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
  const tagTest = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash === "#tag-test",
    () => false,
  );

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

  async function hearSample(voiceId: string, tags = false) {
    // The tag test plays under its own key, so it never replaces the normal sample.
    const key = tags ? `${voiceId}|tags` : voiceId;
    if (hearingId === key || loadingId === key) {
      stopSample();
      return;
    }
    stopSample();
    onChange(voiceId);
    setHearError("");
    const cached = sampleUrls.get(key);
    if (cached) {
      await playUrl(key, cached);
      return;
    }
    const controller = new AbortController();
    hearAbort.current = controller;
    setLoadingId(key);
    try {
      const piper = isPiperVoice(voiceId);
      const response = await (piper ? fetch : yotoFetch)("/api/yoto/hear", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tags ? demoHearBody({ text: TAG_TEST_TEXT, voiceId, title: "Expression test" }) : voiceSampleBody(voiceId),
        ),
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
      sampleUrls.set(key, url);
      await playUrl(key, url);
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

  const chosen = pickerVoice(value);
  const chosenBusy = loadingId === chosen.id;
  const chosenPlaying = hearingId === chosen.id;

  return (
    <fieldset className="grid gap-2 text-sm" disabled={disabled}>
      <legend className="pk-section-title">Voice</legend>
      {VOICE_GROUPS.map((group) => (
        <div key={group.label} className="grid gap-1">
          <span className="text-xs font-bold text-muted-foreground">{group.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {group.voices.map((voice) => (
              <label key={voice.id} className="pk-voice-chip" title={voice.note}>
                <input
                  type="radio"
                  name={id}
                  value={voice.id}
                  checked={value === voice.id}
                  onChange={() => onChange(voice.id)}
                  className="sr-only"
                />
                {voice.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="pk-voice" data-checked="true">
        <div className="pk-voice-copy">
          <span className="pk-voice-name">
            {chosen.name}
            {chosen.id === YOTO_VOICES[0].id ? <span className="pk-badge">Usual</span> : null}
            {isPiperVoice(chosen.id) ? <span className="pk-badge pk-badge-lite">On this site</span> : null}
          </span>
          <span className="pk-voice-note">{chosen.note}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 px-3"
          disabled={disabled}
          aria-label={chosenPlaying || chosenBusy ? `Stop ${chosen.name}` : `Hear ${chosen.name}`}
          onClick={() => void hearSample(chosen.id)}
        >
          {chosenBusy ? "Hearing…" : chosenPlaying ? "Stop" : "Hear"}
        </Button>
      </div>
      {tagTest && !isPiperVoice(chosen.id) ? (
        <div className="grid gap-1 rounded-xl border-2 border-dashed border-ink/40 p-3">
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-self-start px-4"
            disabled={disabled}
            onClick={() => void hearSample(chosen.id, true)}
          >
            {loadingId === `${chosen.id}|tags` ? "Hearing…" : hearingId === `${chosen.id}|tags` ? "Stop" : "Test expression tags"}
          </Button>
          <p className="text-xs leading-5 pk-quiet">
            Test only. Excited, then a whisper, then a laugh means tags work. Hearing the words &quot;excited&quot;,
            &quot;whispers&quot; or &quot;laughs&quot; read out means they don&apos;t.
          </p>
        </div>
      ) : null}
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
          login. The other voices are recorded by Yoto.
        </p>
      ) : (
        <p className="text-xs leading-5 pk-quiet">
          This voice is recorded by Yoto. Hear it here, then send. If that sample fails, try Piper — Pokédex.
        </p>
      )}
    </fieldset>
  );
}
