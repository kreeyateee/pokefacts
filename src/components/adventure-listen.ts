"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MixSettings } from "@/lib/playback-settings";
import { isPiperVoice, pickerVoice } from "@/lib/piper-voice";
import { pronounce } from "@/lib/pronounce";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import {
  isStorySound,
  STORY_AMBIENCE,
  STORY_MUSIC,
  STORY_SOUNDS,
  withoutCues,
  type StoryBed,
  type StorySound,
} from "@/lib/story/story-sound";
import {
  castVoices,
  fallbackVoices,
  NARRATOR,
  speakerLines,
  trackParts,
  type TrackPart,
  type VoiceStyle,
} from "@/lib/story/story-voices";
import { withoutVoiceTags } from "@/lib/voice-tags";
import { yotoFetch } from "@/lib/yoto-session";

/** How loud the browser plays the beds, and how far they drop while someone speaks. */
const BROWSER_AMBIENCE = 0.3;
const BROWSER_MUSIC = 0.22;
const DUCKED = 0.4;

/** Drops the bed loops while someone speaks, and brings them back after. */
function setLoopVolumes(loops: readonly HTMLAudioElement[], speaking: boolean) {
  for (const loop of loops) {
    const volume = Number(loop.dataset.volume ?? "0");
    loop.volume = speaking ? volume * DUCKED : volume;
  }
}

/** Every part of what this node says: its narration, then its question. */
export function nodeParts(
  story: StoryGraph,
  lines: { narration: string; question?: string },
  voiceId: string,
): TrackPart[] {
  const cast = story.cast ?? [];
  const voices = castVoices(voiceId, cast);
  const narrator = voices[NARRATOR] as VoiceStyle;
  const options = { slots: story.slots ?? [], fallback: fallbackVoices(cast) };
  const partsOf = (text: string): TrackPart[] =>
    trackParts(text, voices, cast, pronounce, options) ?? [{ text: pronounce(withoutCues(text)), ...narrator }];
  return [...partsOf(lines.narration), ...(lines.question ? partsOf(lines.question) : [])];
}

/** When each sound plays in a recording from the server, read from its header. Bad values are dropped. */
export function readCues(header: string | null): Array<{ sound: StorySound; at: number }> {
  if (!header) return [];
  try {
    const rows = JSON.parse(header) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      const cue = row as { sound?: unknown; at?: unknown };
      return isStorySound(cue.sound) && typeof cue.at === "number" && Number.isFinite(cue.at) && cue.at >= 0
        ? [{ sound: cue.sound, at: cue.at }]
        : [];
    });
  } catch {
    return [];
  }
}

/** How often the page checks the recording's position: often enough that the ball lands on the sound. */
const CUE_CHECK_MS = 40;

/** Calls `onSound` as the recording reaches each cue. */
function followCues(
  audio: HTMLAudioElement,
  cues: ReadonlyArray<{ sound: StorySound; at: number }>,
  onSound: ((sound: StorySound) => void) | undefined,
  signal: AbortSignal,
) {
  if (!onSound || cues.length === 0) return;
  const pending = [...cues].sort((a, b) => a.at - b.at);
  const timer = window.setInterval(() => {
    if (signal.aborted || audio.ended || pending.length === 0) {
      window.clearInterval(timer);
      return;
    }
    while (pending.length > 0 && (pending[0]?.at ?? Infinity) <= audio.currentTime) onSound(pending.shift()?.sound as StorySound);
  }, CUE_CHECK_MS);
}

function playUrl(audio: HTMLAudioElement, url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      audio.removeEventListener("ended", done);
      audio.removeEventListener("error", failed);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const failed = () => {
      audio.removeEventListener("ended", done);
      audio.removeEventListener("error", failed);
      reject(new Error("This sound would not play."));
    };
    audio.addEventListener("ended", done);
    audio.addEventListener("error", failed);
    signal.addEventListener("abort", done);
    audio.src = url;
    void audio.play().catch(failed);
  });
}

type Gender = "female" | "male";

const FEMALE_VOICE = /female|woman|zira|catherine|hazel|susan|libby|sonia|aria|jenny|kate|serena|samantha|karen|moira|tessa|fiona/i;
const MALE_VOICE = /\bmale|\bman\b|david|mark|james|george|ryan|daniel|thomas|guy|alex|oliver|arthur/i;

/** A browser voice: British when there is one, and a woman's or a man's to match the speaker. */
function browserVoice(gender: Gender): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
  const british = voices.filter((voice) => voice.lang === "en-GB");
  const match = gender === "female" ? FEMALE_VOICE : MALE_VOICE;
  return british.find((voice) => match.test(voice.name)) ?? voices.find((voice) => match.test(voice.name)) ?? voices[0];
}

/** The narrator sounds like the Settings voice; a character like their pronoun. */
function speakerGender(story: StoryGraph, speaker: string, voiceId: string): Gender {
  if (speaker === NARRATOR) return isPiperVoice(voiceId) || /woman/i.test(pickerVoice(voiceId).note) ? "female" : "male";
  return story.cast?.find((character) => character.id === speaker)?.pronoun === "he" ? "male" : "female";
}

function speak(text: string, style: VoiceStyle, gender: Gender, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    // Browser voices read a tag out as a word, so expression is for the Yoto voices only.
    const utterance = new SpeechSynthesisUtterance(withoutVoiceTags(text));
    utterance.lang = "en-GB";
    const voice = browserVoice(gender);
    if (voice) utterance.voice = voice;
    utterance.pitch = Math.max(0.1, Math.min(2, 1 + style.pitch * 0.12));
    utterance.rate = style.tempo;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    signal.addEventListener("abort", () => resolve());
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Listen to one scene of the adventure. Connected to Yoto (or reading with Piper), the page plays the
 * same recording the card gets: every voice, the cry and the catch sound. Otherwise the browser's own
 * voices read it, with each character pitched differently, and the real catch sound and cry.
 */
export function useAdventureListen(options: { voiceId: string; connected: boolean; mix: MixSettings }) {
  const { voiceId, connected, mix } = options;
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const urlRef = useRef("");
  const bedRef = useRef<HTMLAudioElement[]>([]);

  const stopBed = useCallback(() => {
    for (const loop of bedRef.current) loop.pause();
    bedRef.current = [];
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    audioRef.current?.pause();
    stopBed();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setListening(false);
  }, [stopBed]);

  useEffect(() => stop, [stop]);

  /** The browser plays the scene's ambience and music itself, quietly, and lower still while anyone speaks. */
  const startBed = useCallback(
    (bed: StoryBed | undefined) => {
      stopBed();
      const loops: Array<[string, number]> = [];
      if (bed?.ambience) loops.push([STORY_AMBIENCE[bed.ambience], BROWSER_AMBIENCE]);
      if (bed?.music) loops.push([STORY_MUSIC[bed.music], BROWSER_MUSIC]);
      bedRef.current = loops.map(([src, volume]) => {
        const loop = new Audio(src);
        loop.loop = true;
        loop.volume = volume;
        loop.dataset.volume = String(volume);
        void loop.play().catch(() => undefined);
        return loop;
      });
    },
    [stopBed],
  );

  const duckBed = useCallback((speaking: boolean) => setLoopVolumes(bedRef.current, speaking), []);

  const listen = useCallback(
    async (
      story: StoryGraph,
      node: StoryNode,
      lines: { narration: string; question?: string },
      onSound?: (sound: StorySound) => void,
    ) => {
      stop();
      const controller = new AbortController();
      controllerRef.current = controller;
      const signal = controller.signal;
      audioRef.current ??= new Audio();
      const audio = audioRef.current;
      const parts = nodeParts(story, lines, voiceId);
      setListening(true);
      try {
        if (connected || isPiperVoice(voiceId)) {
          setNote("Recording the voices. The first listen of a scene can take a minute.");
          const response = await (isPiperVoice(voiceId) ? fetch : yotoFetch)("/api/yoto/hear", {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: withoutCues(lines.narration),
              title: node.title,
              voiceId,
              dexId: node.dexId,
              parts,
              ...(node.bed ? { bed: node.bed } : {}),
              cryVolume: mix.cryVolume,
              voiceVolume: mix.voiceVolume,
              pauseSeconds: mix.pauseSeconds,
            }),
          });
          const type = response.headers.get("content-type") ?? "";
          if (!response.ok || !type.includes("audio")) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error ?? "Could not record this scene.");
          }
          const cues = readCues(response.headers.get("X-Pokefacts-Cues"));
          const blob = await response.blob();
          if (signal.aborted) return;
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = URL.createObjectURL(blob);
          setNote("Playing the voices the card will use.");
          const playing = playUrl(audio, urlRef.current, signal);
          followCues(audio, cues, onSound, signal);
          await playing;
        } else {
          setNote("Your browser's voices, standing in for the card's. Connect Yoto to hear the real ones.");
          startBed(node.bed);
          if (node.dexId) await playUrl(audio, `/api/cry/${node.dexId}`, signal).catch(() => undefined);
          const voices = castVoices(voiceId, story.cast ?? []);
          const said = [lines.narration, lines.question ?? ""].flatMap((text) => speakerLines(text, story.cast ?? []));
          for (const line of said) {
            if (signal.aborted) return;
            if ("sound" in line) {
              onSound?.(line.sound);
              await playUrl(audio, STORY_SOUNDS[line.sound], signal);
            } else if ("cry" in line) {
              await playUrl(audio, `/api/cry/${line.cry}`, signal).catch(() => undefined);
            } else if ("speechSynthesis" in window) {
              const style = voices[line.speaker] ?? (voices[NARRATOR] as VoiceStyle);
              duckBed(true);
              await speak(line.text, style, speakerGender(story, line.speaker, voiceId), signal);
              duckBed(false);
            }
          }
          // Let the bed breathe for a moment after the last word, as the card does.
          if (!signal.aborted) await new Promise((resolve) => window.setTimeout(resolve, 1200));
          stopBed();
        }
      } catch (error) {
        if (!signal.aborted) setNote(error instanceof Error ? error.message : "Could not play this scene.");
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setListening(false);
        }
      }
    },
    [connected, duckBed, mix, startBed, stop, stopBed, voiceId],
  );

  return { listening, note, listen, stop };
}
