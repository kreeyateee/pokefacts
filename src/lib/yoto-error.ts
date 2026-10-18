/** Yoto card ids are five letters or digits. Anything else is not a playlist we can update. */
export function validYotoCardId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return /^[A-Za-z0-9]{5}$/.test(id) ? id : undefined;
}

function pushText(parts: string[], value: unknown) {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (text) parts.push(text);
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
      job?: { error?: unknown; message?: unknown };
    };
    pushText(parts, row.error_description);
    pushText(parts, row.message);
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
