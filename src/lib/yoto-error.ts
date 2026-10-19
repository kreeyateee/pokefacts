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

/** A Cloudflare or origin gateway failure, including an HTML body on any status. */
export function looksLikeGateway(status: number, data: unknown): boolean {
  if (status === 502 || status === 504 || status === 524) return true;
  return /<!doctype|<html[\s>]|<\/html>|trycloudflare|bad gateway|error code 50[24]/i.test(serialized(data));
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

/** Status text for the page. Gateway and HTML bodies become one short sentence. */
export function statusErrorText(status: number, data: unknown, fallback: string): string {
  if (looksLikeGateway(status, data)) return PUBLIC_LINK_TIMEOUT;
  const text = yotoErrorText(data, fallback);
  if (looksLikeGateway(0, text)) return PUBLIC_LINK_TIMEOUT;
  return reconnectMessage(text) ?? text;
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
  const message = yotoBody && !detail.includes(yotoBody) ? `${detail} ${yotoBody}` : detail;
  return { error: message, message, yotoBody };
}

/**
 * A saved playlist id that Yoto no longer has. The vague axios 400 is what their
 * updater returns when that id was deleted.
 */
export function savedCardIsGone(status: number, data: unknown): boolean {
  if (status === 404) return true;
  const text = yotoErrorText(data, "");
  if (/does not exist|not found|unknown card|no longer available|has been deleted|card .* gone/i.test(text)) {
    return true;
  }
  return status === 400 && /request failed with status code 400/i.test(text);
}
