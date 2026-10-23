import { applySpeciesSpeech, jokePlaylist, kidCardsFromDex, trackSpeech, type KidCard } from "@/lib/kid-cards";
import type { MonSheet } from "@/lib/dex-facts";

/**
 * Pokefacts Radio is made only from Yoto-voice recordings the site has already saved. A saved recording
 * is found by its words: the server rebuilds the exact script a Pokefacts card sends, and looks for the
 * file under that script's speech key. Nothing a browser sent is trusted, so the radio can only ever
 * play Pokefacts' own scripts.
 */
export type RadioKind = "entry" | "clues" | "answer" | "joke";

/** Each way a track may have been sent, newest first: with expression tags, then the plain script from before them. */
export type RadioScripts = Map<number, Partial<Record<RadioKind, string[]>>>;

/** The script as the track route keys it: one line, single spaces. */
export function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function add(scripts: RadioScripts, dexId: number, kind: RadioKind, texts: string[]) {
  const row = scripts.get(dexId) ?? {};
  const list = row[kind] ?? [];
  for (const text of texts) if (text && !list.includes(text)) list.push(text);
  row[kind] = list;
  scripts.set(dexId, row);
}

function addCard(scripts: RadioScripts, card: KidCard, kinds: readonly RadioKind[]) {
  for (const chapter of card.chapters) {
    if (!chapter.dexId) continue;
    for (const track of chapter.tracks) {
      const kind = track.key as RadioKind;
      if (!kinds.includes(kind)) continue;
      const texts = [flat(trackSpeech(track, chapter)), flat(track.spoken)];
      // Before 24 October 2026 the answer was "It is Pikachu." rather than "It's Pikachu!".
      if (kind === "answer") texts.push(flat(track.spoken).replace(/^It's (.+?)! /, "It is $1. "));
      add(scripts, chapter.dexId, kind, texts);
    }
  }
}

/**
 * Every radio-worthy script by Pokémon: the fact (both the Bulbapedia reading and the card's own blurb),
 * the Who's That clues and answer, and the Joke Book joke. `factSpeech` is the Bulbapedia reading by dex number.
 */
export function radioScripts(sheets: MonSheet[], factSpeech: Record<number, string> = {}): RadioScripts {
  const scripts: RadioScripts = new Map();
  const cards = kidCardsFromDex(sheets);
  for (const card of cards) {
    if (card.kind === "meet") {
      addCard(scripts, applySpeciesSpeech(card, factSpeech), ["entry"]);
      addCard(scripts, card, ["entry"]);
    } else if (card.kind === "guess") {
      addCard(scripts, card, ["clues", "answer"]);
    }
  }
  addCard(scripts, jokePlaylist(sheets), ["joke"]);
  return scripts;
}
