/**
 * yt-dlp runs only on a home computer: the song lookup, the probe of a stored id,
 * and YouTube to MP3. Two things must both be true.
 *
 * 1. The server was started by `npm start` (scripts/local.mjs), which sets
 *    POKEFACTS_LOCAL=1. The public server's systemd unit never sets it.
 * 2. The browser reached the server through a loopback address. Only the Host
 *    header is read. X-Forwarded-Host and Forwarded are ignored, so a proxy
 *    header cannot make a public request look local.
 *
 * A request from another site in the same browser is refused as well.
 */
export const LOCAL_MODE_ENV = "POKEFACTS_LOCAL";

export const LOCAL_TOOLS_DISABLED_MESSAGE =
  "YouTube to MP3 works only when Pokefacts runs on this computer and is opened at 127.0.0.1 or localhost.";

type Env = Readonly<Record<string, string | undefined>>;

/** The server process was started by the home launcher. */
export function localModeEnabled(env: Env = process.env): boolean {
  return env[LOCAL_MODE_ENV] === "1";
}

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `localhost`, `127.0.0.1`, `[::1]`, or `*.localhost`, with an optional port. */
export function isLoopbackHost(host: string | null | undefined): boolean {
  const value = host?.trim().toLowerCase() ?? "";
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/.exec(value);
  if (!match) return false;
  const name = match[1] ?? "";
  if (LOOPBACK_NAMES.has(name)) return true;
  return name.endsWith(".localhost") && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(name);
}

function loopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && isLoopbackHost(url.host);
  } catch {
    return false;
  }
}

/** Not a cross-site fetch or form post from another page open in the same browser. */
function sameSiteCaller(headers: Headers): boolean {
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  return origin === null || loopbackOrigin(origin);
}

/** True only on a home computer that is being used from that same computer. */
export function localToolsAllowed(request: Request, env: Env = process.env): boolean {
  if (!localModeEnabled(env)) return false;
  return isLoopbackHost(request.headers.get("host")) && sameSiteCaller(request.headers);
}
