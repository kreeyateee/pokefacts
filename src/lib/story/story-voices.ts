/**
 * Who says what in a story track, and in which voice.
 *
 * Story text is written as one paragraph: narration, with dialogue in single quotes, and sound cues
 * such as [catch]. `speakerLines` splits it into narrator lines, character lines and sounds.
 * `trackParts` turns those into what the recorder needs: each line with its voice, in order, so the
 * whole paragraph still becomes one track.
 */
import { chosenVoice, isPiperVoice, PIPER_VOICE_ID } from "@/lib/piper-voice";
import { CRY_CUE, isCryId, isStorySound, SOUND_CUE, type StorySound } from "@/lib/story/story-sound";
import { YOTO_VOICES } from "@/lib/yoto-icons";

export const NARRATOR = "narrator";

/** A speaking character. The narrator is not listed; it is always there. */
export type StoryCharacter = {
  /** Short id, such as "marigold". */
  id: string;
  /** How the narration names them: "Marigold". */
  name: string;
  /** The pronoun the narration uses for them, so "she says" can be traced back. */
  pronoun?: "she" | "he";
  /** Yoto voices to try, best first. The first one the narrator is not using wins. */
  voices: readonly string[];
  /** Semitones up or down, so two characters on one voice still sound like two people. */
  pitch?: number;
  /** Speaking speed: 1 is normal, 0.9 slower, 1.1 quicker. */
  tempo?: number;
  /** With Piper everyone shares one voice, so each character needs a bigger shift to stand apart. */
  piper?: { pitch?: number; tempo?: number };
};

export type SpeakerLine = { speaker: string; text: string } | { sound: StorySound } | { cry: number };

/** One voice: a Yoto Labs or Piper voice id, shifted in pitch and speed. */
export type VoiceStyle = { voiceId: string; pitch: number; tempo: number };

/**
 * What the recorder needs for one line of a track. `tight` joins it straight on to the line before,
 * with no pause: a name recorded on its own. `fallback` is the Piper voice it is read in if Yoto's
 * voice service turns it away.
 */
export type TrackPart =
  | ({ text: string; tight?: boolean; fallback?: VoiceStyle } & VoiceStyle)
  | { sound: StorySound }
  | { cry: number };

const PITCH_LIMIT = 6;
const TEMPO_MIN = 0.8;
const TEMPO_MAX = 1.25;
const PART_LIMIT = 120;
const TEXT_LIMIT = 3000;

function isLetter(char: string | undefined): boolean {
  return Boolean(char) && /\p{L}/u.test(char as string);
}

/** A straight quote between two letters is an apostrophe ("it's"); anywhere else it opens or closes speech. */
function isQuoteMark(text: string, index: number): boolean {
  const char = text[index];
  if (char === "‘" || char === "’") return !(char === "’" && isLetter(text[index - 1]) && isLetter(text[index + 1]));
  if (char !== "'") return false;
  return !(isLetter(text[index - 1]) && isLetter(text[index + 1]));
}

type Chunk =
  | { kind: "narration"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "sound"; sound: StorySound }
  | { kind: "cry"; dexId: number };

/** Narration, quotes and sound cues, in order. Throws on a quote that never closes. */
export function storyChunks(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer = "";
  let quoted = false;
  const flush = () => {
    const words = buffer.replace(/\s+/g, " ").trim();
    if (words) chunks.push(quoted ? { kind: "quote", text: words } : { kind: "narration", text: words });
    buffer = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    if (isQuoteMark(text, index)) {
      flush();
      quoted = !quoted;
      continue;
    }
    if (!quoted && text[index] === "[") {
      const cry = new RegExp(CRY_CUE.source, "y");
      cry.lastIndex = index;
      const heard = cry.exec(text);
      if (heard && isCryId(Number(heard[1]))) {
        flush();
        chunks.push({ kind: "cry", dexId: Number(heard[1]) });
        index += heard[0].length - 1;
        continue;
      }
      const cue = new RegExp(SOUND_CUE.source, "y");
      cue.lastIndex = index;
      const match = cue.exec(text);
      if (match && isStorySound(match[1])) {
        flush();
        chunks.push({ kind: "sound", sound: match[1] });
        index += match[0].length - 1;
        continue;
      }
    }
    buffer += text[index];
  }
  if (quoted) throw new Error(`A quote never closes: "${text.slice(0, 80)}…"`);
  flush();
  return chunks;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The character a stretch of narration points at: a name first, then a pronoun. */
function speakerIn(narration: string, cast: readonly StoryCharacter[]): string | undefined {
  let best: { id: string; at: number } | undefined;
  for (const character of cast) {
    const match = new RegExp(`\\b${escapeRegExp(character.name)}\\b(?!'s)`, "u").exec(narration);
    if (match && (!best || match.index < best.at)) best = { id: character.id, at: match.index };
  }
  if (best) return best.id;
  for (const character of cast) {
    if (character.pronoun && new RegExp(`\\b${character.pronoun}\\b`, "i").test(narration)) return character.id;
  }
  return undefined;
}

/** The narration right after a quote, up to the end of its clause: " says Marigold" in "'Hello,' says Marigold." */
function attributionAfter(quote: string, next: Chunk | undefined): string | undefined {
  if (next?.kind !== "narration") return undefined;
  const ends = quote.at(-1) ?? "";
  // "'Bait.' Marigold sighs." starts a new sentence, so it does not name who spoke.
  const carriesOn = ends === "," || ((ends === "!" || ends === "?") && /^[a-z]/.test(next.text));
  if (!carriesOn) return undefined;
  return next.text.split(/[.!?;]/)[0];
}

/** The last sentence of the narration before a quote: "Marigold sniffs." */
function lastSentence(previous: Chunk | undefined): string | undefined {
  if (previous?.kind !== "narration") return undefined;
  const sentences = previous.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.at(-1);
}

/**
 * Splits story text into narrator lines, character lines and sounds.
 * Each quote goes to whoever the narration around it names ("says Marigold", "he calls"),
 * then to whoever spoke last, then to the first character.
 */
export function speakerLines(text: string, cast: readonly StoryCharacter[]): SpeakerLine[] {
  const chunks = storyChunks(text);
  const lines: SpeakerLine[] = [];
  let lastSpeaker: string | undefined;
  chunks.forEach((chunk, index) => {
    if (chunk.kind === "sound") {
      lines.push({ sound: chunk.sound });
      return;
    }
    if (chunk.kind === "cry") {
      lines.push({ cry: chunk.dexId });
      return;
    }
    if (chunk.kind === "narration") {
      lines.push({ speaker: NARRATOR, text: chunk.text });
      return;
    }
    const after = attributionAfter(chunk.text, chunks[index + 1]);
    const before = lastSentence(chunks[index - 1]);
    const speaker =
      (after && speakerIn(after, cast)) ??
      (before && speakerIn(before, cast)) ??
      lastSpeaker ??
      cast[0]?.id ??
      NARRATOR;
    lastSpeaker = speaker;
    lines.push({ speaker, text: chunk.text });
  });
  return mergeLines(lines);
}

/** Two lines in a row from one speaker become one, so the recording has fewer joins. */
function mergeLines(lines: SpeakerLine[]): SpeakerLine[] {
  const merged: SpeakerLine[] = [];
  for (const line of lines) {
    const last = merged.at(-1);
    if (last && "speaker" in last && "speaker" in line && last.speaker === line.speaker) {
      merged[merged.length - 1] = { speaker: last.speaker, text: `${last.text} ${line.text}` };
    } else {
      merged.push(line);
    }
  }
  return merged;
}

/**
 * One voice per speaker for the whole story. The narrator reads in the voice chosen in Settings.
 * Each character takes the first of its own voices that the narrator is not using, with its small pitch
 * and speed touch. With Piper, every character is Piper, told apart by its larger Piper shift.
 */
export function castVoices(narratorVoiceId: string | undefined, cast: readonly StoryCharacter[]): Record<string, VoiceStyle> {
  const narrator = chosenVoice(narratorVoiceId);
  const styles: Record<string, VoiceStyle> = { [NARRATOR]: { voiceId: narrator, pitch: 0, tempo: 1 } };
  const known = new Set<string>(YOTO_VOICES.map((voice) => voice.id));
  for (const character of cast) {
    if (isPiperVoice(narrator)) {
      styles[character.id] = {
        voiceId: narrator,
        pitch: clampPitch(character.piper?.pitch),
        tempo: clampTempo(character.piper?.tempo),
      };
      continue;
    }
    const voices = character.voices.filter((id) => known.has(id));
    const voiceId = voices.find((id) => id !== narrator) ?? voices[0] ?? narrator;
    styles[character.id] = { voiceId, pitch: clampPitch(character.pitch), tempo: clampTempo(character.tempo) };
  }
  return styles;
}

/** The Piper voices every speaker falls back to if Yoto's voice service turns lines away. */
export function fallbackVoices(cast: readonly StoryCharacter[]): Record<string, VoiceStyle> {
  return castVoices(PIPER_VOICE_ID, cast);
}

function clampPitch(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.round(value * 10) / 10));
}

function clampTempo(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(value * 100) / 100));
}

/**
 * Cuts a line around the words that change from one send to the next: the Pokémon names and the
 * child's name. Each name, with a possessive 's and the punctuation right after it, becomes its own
 * short piece, so the wording around it is the same on every card and its recording can be reused.
 */
export function slotPieces(text: string, slots: readonly string[]): Array<{ text: string; slot: boolean }> {
  const names = [...new Set(slots.map((slot) => slot.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return [{ text, slot: false }];
  const pattern = new RegExp(`(?<![\\p{L}'’])(?:${names.map(escapeRegExp).join("|")})(?:['’]s)?(?![\\p{L}])[.,!?;:]*`, "gu");
  const pieces: Array<{ text: string; slot: boolean }> = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(at, match.index).trim();
    if (before) pieces.push({ text: before, slot: false });
    pieces.push({ text: match[0], slot: true });
    at = (match.index ?? 0) + match[0].length;
  }
  const after = text.slice(at).trim();
  if (after) pieces.push({ text: after, slot: false });
  return pieces.length > 0 ? pieces : [{ text, slot: false }];
}

/**
 * What to record for one track: each line in its speaker's voice, and each sound, in order.
 * `say` respells names for the voice. Names listed in `slots` are recorded as their own short pieces,
 * joined tight to the words around them. Each spoken part carries its Piper fallback when `fallback`
 * is given. Returns null when the track is one plain narrator line, so it records as it did before voices.
 */
export function trackParts(
  text: string,
  voices: Record<string, VoiceStyle>,
  cast: readonly StoryCharacter[],
  say: (words: string) => string = (words) => words,
  options: { slots?: readonly string[]; fallback?: Record<string, VoiceStyle> } = {},
): TrackPart[] | null {
  const lines = speakerLines(text, cast);
  const narrator = voices[NARRATOR] as VoiceStyle;
  const parts: TrackPart[] = [];
  for (const line of lines) {
    if ("sound" in line) {
      parts.push({ sound: line.sound });
      continue;
    }
    if ("cry" in line) {
      parts.push({ cry: line.cry });
      continue;
    }
    const style = voices[line.speaker] ?? narrator;
    const backup = options.fallback?.[line.speaker] ?? options.fallback?.[NARRATOR];
    slotPieces(line.text, options.slots ?? []).forEach((piece, index) => {
      parts.push({
        text: say(piece.text),
        ...style,
        ...(index > 0 ? { tight: true } : {}),
        ...(backup && backup.voiceId !== style.voiceId ? { fallback: backup } : {}),
      });
    });
  }
  const only = parts[0];
  const plain =
    parts.length === 1 &&
    only !== undefined &&
    "text" in only &&
    only.voiceId === narrator.voiceId &&
    only.pitch === 0 &&
    only.tempo === 1;
  return plain ? null : parts;
}

function readStyle(row: Record<string, unknown>): VoiceStyle | null {
  if (typeof row.voiceId !== "string") return null;
  return {
    voiceId: chosenVoice(row.voiceId),
    pitch: clampPitch(typeof row.pitch === "number" ? row.pitch : 0),
    tempo: clampTempo(typeof row.tempo === "number" ? row.tempo : 1),
  };
}

/** Track parts from a request, or null when they are missing or not safe to record. */
export function readTrackParts(value: unknown): TrackPart[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > PART_LIMIT) return null;
  const parts: TrackPart[] = [];
  let spoken = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if ("sound" in row) {
      if (!isStorySound(row.sound)) return null;
      parts.push({ sound: row.sound });
      continue;
    }
    if ("cry" in row) {
      if (!isCryId(row.cry)) return null;
      parts.push({ cry: row.cry });
      continue;
    }
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim() : "";
    if (!text) return null;
    spoken += text.length;
    const style = readStyle(row);
    if (!style) return null;
    let fallback: VoiceStyle | undefined;
    if (row.fallback !== undefined) {
      const backup = row.fallback && typeof row.fallback === "object" ? readStyle(row.fallback as Record<string, unknown>) : null;
      // Only Piper can stand in: it runs on the server and needs no Yoto account.
      if (!backup || !isPiperVoice(backup.voiceId)) return null;
      fallback = backup;
    }
    parts.push({ text, ...style, ...(row.tight === true ? { tight: true } : {}), ...(fallback ? { fallback } : {}) });
  }
  if (spoken === 0 || spoken > TEXT_LIMIT) return null;
  return parts;
}

/** The same parts read entirely in their Piper fallback voices. */
export function piperParts(parts: readonly TrackPart[]): TrackPart[] {
  return parts.map((part) => {
    if (!("text" in part) || isPiperVoice(part.voiceId) || !part.fallback) return part;
    const { fallback, ...rest } = part;
    return { ...rest, ...fallback };
  });
}

/** A short key for one spoken part, so a recording can be matched to its line. */
export function partKey(part: { text: string; voiceId: string }): string {
  let hash = 2166136261;
  for (const char of `${part.voiceId}\n${part.text}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
