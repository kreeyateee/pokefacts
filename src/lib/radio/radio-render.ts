import { encodeYotoMp3, integratedLoudness, joinClips, levelCryGain, type JoinClip } from "@/lib/cry-audio";
import type { EpisodePlan, RadioPick } from "@/lib/radio/radio-plan";
import type { RadioLineId } from "@/lib/radio/radio-lines";

/** What the renderer reads: saved speech by file, a Pokémon's cry, a sound from public/sounds, a host line. */
export type RenderSources = {
  speech: (file: string) => Promise<Buffer>;
  cry: (dexId: number) => Promise<Buffer>;
  sound: (name: string) => Promise<Buffer>;
  /** The host's recording of a line, or null when that line is not saved in the host voice. */
  hostLine: (id: RadioLineId) => Promise<Buffer | null>;
};

/** The silence between parts. Long enough to breathe, short enough for a child to stay with it. */
export const RADIO_GAP_SECONDS = 0.6;

/** Thinking time after "Shout your guess. One. Two. Three." before the answer. */
export const GUESS_PAUSE_SECONDS = 3;

/** A 16-bit mono 44.1 kHz WAV of silence. */
export function silence(seconds: number): Buffer {
  const bytes = Math.round(seconds * 44100) * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(88200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes, 40);
  return Buffer.concat([header, Buffer.alloc(bytes)]);
}

/** A Pokémon's cry, level with the reading that follows it, then the reading. */
async function cryThenSpeech(pick: RadioPick, sources: RenderSources): Promise<JoinClip[]> {
  const speech = await sources.speech(pick.file);
  try {
    const cry = await sources.cry(pick.dexId);
    const gain = levelCryGain(await integratedLoudness(cry), await integratedLoudness(speech), 1, 1);
    return [{ audio: cry, volume: gain }, { audio: speech, speech: true }];
  } catch {
    // A missing cry never stops the episode. The reading names the Pokémon anyway.
    return [{ audio: speech, speech: true }];
  }
}

/**
 * The episode in order: sting, host welcome, Pokémon of the day, Who's That with a pause before the
 * answer, a joke, goodbye, closing sting. Parts the plan does not have are left out. Returns an MP3.
 */
export async function renderEpisode(plan: EpisodePlan, sources: RenderSources): Promise<{ mp3: Buffer; seconds: number }> {
  const host = async (id: RadioLineId): Promise<JoinClip[]> => {
    if (!plan.host) return [];
    const line = await sources.hostLine(id);
    return line ? [{ audio: line, speech: true }] : [];
  };
  const chime = async (): Promise<JoinClip[]> => [{ audio: await sources.sound("badge-chime.mp3"), volume: 0.6 }];

  const clips: JoinClip[] = [{ audio: await sources.sound("radio-sting.mp3") }];
  clips.push(...(await host("intro")));
  clips.push(...(await cryThenSpeech(plan.fact, sources)));
  if (plan.guess) {
    clips.push(...(await chime()), ...(await host("guess")));
    clips.push({ audio: await sources.speech(plan.guess.clues.file), speech: true });
    clips.push({ audio: silence(GUESS_PAUSE_SECONDS) });
    clips.push(...(await cryThenSpeech(plan.guess.answer, sources)));
  }
  if (plan.joke) {
    clips.push(...(await chime()), ...(await host("joke")));
    clips.push(...(await cryThenSpeech(plan.joke, sources)));
  }
  clips.push(...(await host("outro")));
  clips.push({ audio: await sources.sound("ending-sting.mp3"), volume: 0.8 });

  const joined = await joinClips(clips, RADIO_GAP_SECONDS);
  const seconds = Math.round((joined.wav.length - 44) / 88200);
  return { mp3: await encodeYotoMp3(joined.wav), seconds };
}
