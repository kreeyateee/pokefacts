/**
 * The safety net for adventure cards when Yoto's voice service turns lines away: the send carries on
 * with Piper, the voice that runs on the Pokefacts server, and the parent is told why it sounds different.
 */
import { reconnectMessage } from "@/lib/yoto-error";

/** Said when the send finishes, if any line had to fall back. */
export const VOICE_FALLBACK_NOTE =
  "Yoto's voice service turned some lines away, so the rest of this card is read by Piper, the voice built into Pokefacts. Send it again later to try Yoto's voices.";

/**
 * Whether a failed recording job, as the browser saw it while waiting, should switch the send to Piper.
 * A dropped connection is worth a retry, and an expired login needs Connect Yoto; anything else means
 * the voice is not coming.
 */
export function pollFailureFallsBack(error: { message: string; gateway?: boolean }): boolean {
  if (error.gateway) return false;
  return !reconnectMessage(error.message);
}

/** A short id for one send, for the server's log. It is made from when the send started; nothing personal. */
export function adventureSendId(startedAt: number): string {
  return `s${Math.max(0, Math.trunc(startedAt)).toString(36)}`;
}
