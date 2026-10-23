import { YOTO_SCOPES } from "@/lib/yoto-icons";

/** Yoto card ids are five letters or digits. Anything else is not a playlist we can update. */
export function validYotoCardId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return /^[A-Za-z0-9]{5}$/.test(id) ? id : undefined;
}

function pushText(parts: string[], value: unknown) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) parts.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) pushText(parts, item);
  }
}

/** Yoto's own words, including a nested error object and a raw body when the message is generic. */
export function yotoErrorText(data: unknown, fallback: string): string {
  const parts: string[] = [];
  if (typeof data === "string") pushText(parts, data);
  if (data && typeof data === "object") {
    const row = data as {
      error?: unknown;
      message?: unknown;
      error_description?: unknown;
      detail?: unknown;
      errors?: unknown;
      yotoBody?: unknown;
      job?: { error?: unknown; message?: unknown };
    };
    pushText(parts, row.error_description);
    pushText(parts, row.message);
    pushText(parts, row.detail);
    pushText(parts, row.errors);
    pushText(parts, row.yotoBody);
    if (typeof row.error === "string") pushText(parts, row.error);
    else if (row.error && typeof row.error === "object") {
      const nested = row.error as { message?: unknown; error_description?: unknown; code?: unknown };
      pushText(parts, nested.error_description);
      pushText(parts, nested.message);
      pushText(parts, nested.code);
    }
    pushText(parts, row.job?.error);
    pushText(parts, row.job?.message);
  }
  const unique = [...new Set(parts)];
  const vague = unique.length === 1 && /request failed with status code \d+/i.test(unique[0] ?? "");
  if (unique.length === 0 || vague) {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    if (raw && raw !== "{}" && raw !== "null") {
      const extra = raw.slice(0, 500);
      if (!unique.includes(extra)) unique.push(extra);
    }
  }
  return unique.length > 0 ? unique.join(" ") : fallback;
}

/** Shown when the public tunnel or origin returns a gateway page. Never include that HTML. */
export const PUBLIC_LINK_TIMEOUT =
  "The public link timed out or the server was unreachable. Retry.";

export class SendFailure extends Error {
  readonly gateway: boolean;

  constructor(message: string, gateway = false) {
    super(message);
    this.name = "SendFailure";
    this.gateway = gateway;
  }
}

function serialized(data: unknown): string {
  if (typeof data === "string") return data;
  if (data == null) return "";
  try {
    return JSON.stringify(data);
  } catch {
    return "";
  }
}

/** Yoto asked this one call to slow down. Other tracks keep going. */
export function isRateLimited(status: number, data: unknown): boolean {
  if (status === 429) return true;
  return /rate limit|too many requests|slow down/i.test(serialized(data));
}

/**
 * A Cloudflare or origin gateway failure, including an HTML body on any status, and our own
 * "public link timed out" answer when Yoto's side gave one.
 */
export function looksLikeGateway(status: number, data: unknown): boolean {
  if (status === 502 || status === 504 || status === 524) return true;
  return /<!doctype|<html[\s>]|<\/html>|trycloudflare|bad gateway|error code 50[24]|public link timed out/i.test(
    serialized(data),
  );
}

/**
 * Waits between retries when the server or Yoto's gateway is briefly unreachable: a site restart or a
 * Yoto blip. About a minute in all, so a send rides it out instead of stopping.
 */
const GATEWAY_RETRY_MS = [1_000, 2_000, 4_000, 8_000, 12_000, 15_000, 20_000] as const;

/** The wait before gateway retry number `miss` (from 0), or null once it is time to give up. */
export function gatewayRetryDelay(miss: number): number | null {
  return GATEWAY_RETRY_MS[miss] ?? null;
}

/** Shown when the saved grant is older than the authorize URL. Never include the raw scope list. */
export const RECONNECT_YOTO = "Reconnect Yoto. The saved login is missing permission.";

function namedScopes(text: string): string[] {
  const quoted = [...text.matchAll(/'([A-Za-z0-9:_-]+)'/g)].map((match) => match[1] ?? "");
  if (quoted.length > 0) return quoted.filter(Boolean);
  const line = text.match(/required scope\(s\):\s*([^.]*)/i)?.[1] ?? "";
  return line
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.includes(":"));
}

/**
 * Yoto names scopes the authorize URL already requests.
 * The live token was minted earlier and a refresh cannot add them.
 */
export function reconnectMessage(text: string): string | null {
  if (text.includes(RECONNECT_YOTO)) return RECONNECT_YOTO;
  if (!/user does not have (?:the )?required scope/i.test(text)) return null;
  const named = namedScopes(text);
  if (named.length === 0) return null;
  const requested = new Set(YOTO_SCOPES.split(/\s+/));
  if (!named.every((scope) => requested.has(scope))) return null;
  return RECONNECT_YOTO;
}

/** Shown when Yoto lost recordings and a fresh upload did not bring them back. */
export const MEDIA_EXPIRED =
  "Some recordings had expired on Yoto and could not be re-uploaded. Try sending again.";

/** What the job route says beside `missingMedia`. Plain words, and none that read as a deleted card. */
export function missingMediaText(count: number): string {
  return count === 1
    ? "Yoto had lost 1 recording in this playlist."
    : `Yoto had lost ${count} recordings in this playlist.`;
}

/** Yoto's transcoded sha256, as it appears after `yoto:#`: 43 base64url characters, or 64 hex. */
export function isYotoMediaHash(value: unknown): value is string {
  return typeof value === "string" && /^(?:[A-Za-z0-9_-]{43}=?|[a-fA-F0-9]{64})$/.test(value);
}

const MISSING_MEDIA_WORDS =
  /media(?:\s+files?)?\b[^.]{0,200}?(?:not\s+found|(?:does|do)\s+not\s+exist|(?:is|are)\s+missing|no\s+longer\s+exists?)|(?:missing|unknown)\s+media(?:\s+files?)?\b/i;
const MEDIA_HASH = /(?<![A-Za-z0-9_-])(?:yoto:#)?([A-Za-z0-9_-]{43}=?|[a-fA-F0-9]{64})(?![A-Za-z0-9_=-])/g;

/**
 * Every recording Yoto said it does not have, from "Media file not found: The track "Clues" references a
 * media file (<hash>) that does not exist", or the same with several hashes. Empty for any other error.
 * A JSON body, Yoto's raw text, or our own job route's `{ missingMedia }` all work.
 */
export function missingMediaHashes(data: unknown): string[] {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const listed = (data as { missingMedia?: unknown }).missingMedia;
    if (Array.isArray(listed)) return [...new Set(listed.filter(isYotoMediaHash))];
  }
  const text = serialized(data);
  if (!MISSING_MEDIA_WORDS.test(text)) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(MEDIA_HASH)) {
    const hash = match[1] ?? "";
    // A base64url sha256 is a jumble of cases and digits. A long plain word is not one.
    if (hash.length !== 64 && !(/[A-Z]/.test(hash) && /[a-z]/.test(hash))) continue;
    if (isYotoMediaHash(hash)) found.add(hash);
  }
  return [...found];
}

/**
 * One short line for the page. Raw JSON bodies and Yoto's trailing error code (bad-request) are left out;
 * they belong in the console. Our own two-sentence messages are kept whole.
 */
export function plainErrorSentence(text: string, fallback: string): string {
  let clean = text.replace(/\s+/g, " ").trim();
  const json = clean.search(/[{[]\s*"/);
  if (json >= 0) clean = clean.slice(0, json).trim();
  clean = clean.replace(/\s+[a-z]+(?:[-_][a-z]+)+$/, "").trim();
  if (!clean) return fallback;
  if (clean.length <= 220) return clean;
  const cut = clean.slice(0, 220);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 40 ? cut.slice(0, end + 1) : `${cut.slice(0, 217).trimEnd()}...`;
}

/** Status text for the page. Gateway and HTML bodies become one short sentence. */
export function statusErrorText(status: number, data: unknown, fallback: string): string {
  if (looksLikeGateway(status, data)) return PUBLIC_LINK_TIMEOUT;
  if (missingMediaHashes(data).length > 0) return MEDIA_EXPIRED;
  const text = yotoErrorText(withoutRawBody(data), fallback);
  if (looksLikeGateway(0, text)) return PUBLIC_LINK_TIMEOUT;
  return reconnectMessage(text) ?? reconnectMessage(serialized(data)) ?? plainErrorSentence(text, fallback);
}

/** Our routes repeat Yoto's raw response as `yotoBody` for the console. The page shows the message only. */
function withoutRawBody(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const row = data as Record<string, unknown>;
  if (!("yotoBody" in row)) return data;
  const rest = { ...row };
  delete rest.yotoBody;
  const said = [rest.message, rest.error, rest.detail].some((item) => typeof item === "string" && item.trim());
  return said ? rest : data;
}

export function asSendFailure(error: unknown, fallback: string): SendFailure {
  if (error instanceof SendFailure) return error;
  const message = error instanceof Error ? error.message : fallback;
  const gateway = looksLikeGateway(0, message) || /failed to fetch|networkerror/i.test(message);
  return new SendFailure(gateway ? PUBLIC_LINK_TIMEOUT : message, gateway);
}

/** Never forward 502 or 504. Cloudflare quick tunnels replace those with an HTML page. */
export function safeHttpStatus(status: number): number {
  if (status === 502 || status === 504 || status === 524 || !status) return 422;
  return status;
}

/** The JSON we show when Yoto rejects a playlist. `yotoBody` is their response, unedited. */
export function yotoUpstreamFailure(text: string): {
  error: string;
  message: string;
  yotoBody: string;
} {
  if (looksLikeGateway(0, text)) {
    return { error: PUBLIC_LINK_TIMEOUT, message: PUBLIC_LINK_TIMEOUT, yotoBody: "" };
  }
  const yotoBody = text.trim().slice(0, 2000);
  let parsed: unknown = yotoBody;
  if (yotoBody) {
    try {
      parsed = JSON.parse(yotoBody) as unknown;
    } catch {
      parsed = { message: yotoBody };
    }
  } else {
    parsed = null;
  }
  const detail = yotoErrorText(parsed, "Yoto did not accept this card.");
  const reconnect = reconnectMessage(detail) ?? reconnectMessage(yotoBody);
  if (reconnect) return { error: reconnect, message: reconnect, yotoBody: "" };
  // Yoto's words once. The raw body rides along as `yotoBody` for the console, not in the message.
  return { error: detail, message: detail, yotoBody };
}

/**
 * A saved playlist id that Yoto no longer has. The vague axios 400 is what their
 * updater returns when that id was deleted.
 */
export function savedCardIsGone(status: number, data: unknown): boolean {
  if (status === 404) return true;
  // "Media file not found … does not exist" is about a recording, not the card. The card is still there.
  if (missingMediaHashes(data).length > 0) return false;
  const text = yotoErrorText(data, "");
  if (/does not exist|not found|unknown card|no longer available|has been deleted|card .* gone/i.test(text)) {
    return true;
  }
  return status === 400 && /request failed with status code 400/i.test(text);
}
