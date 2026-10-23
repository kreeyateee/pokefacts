/**
 * The host's own lines on Pokefacts Radio. They are recorded once per Yoto voice from the hidden recorder
 * on /radio#record, saved with the other speech, and reused every day. Changing a line's words means
 * recording it again, so keep them general: nothing here names a day or a Pokémon.
 */
export const RADIO_LINES = {
  intro: "{excited} Hello, and welcome to Pokefacts Radio! Here's today's Pokémon of the day.",
  guess: "{curious} Now it's time for Who's That Pokémon! Listen carefully to the clues.",
  joke: "{cheerfully} And to finish, here's a Pokémon joke.",
  outro: "{cheerfully} That's all for today's Pokefacts Radio. See you tomorrow, Trainer!",
} as const;

export type RadioLineId = keyof typeof RADIO_LINES;

export const RADIO_LINE_IDS = Object.keys(RADIO_LINES) as RadioLineId[];

export function isRadioLineId(value: unknown): value is RadioLineId {
  return typeof value === "string" && Object.hasOwn(RADIO_LINES, value);
}
