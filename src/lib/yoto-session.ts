import { YOTO_REDIRECT_URI } from "@/lib/local-origin";
import { reconnectMessage } from "@/lib/yoto-error";
import { YOTO_SCOPES } from "@/lib/yoto-icons";

export { YOTO_REDIRECT_URI };

export const SESSION_KEY = "champdex.session";
export const CLIENT_KEY = "champdex.clientId";
export const CARD_KEY = "champdex.cardId";
export const VERIFIER_KEY = "champdex.pkce";

export type YotoSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  name?: string;
  clientId: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createPkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(bytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** PKCE returns here. A public tunnel host is not used. */
export function redirectUri(): string {
  return YOTO_REDIRECT_URI;
}

export function readSession(): YotoSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as YotoSession;
    if (!session.accessToken || !session.clientId) return null;
    return session;
  } catch {
    return null;
  }
}

export function writeSession(session: YotoSession | null) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

type SessionStorage = {
  removeItem(key: string): void;
};

/**
 * A Yoto response named scopes this login already requests.
 * Drop the saved token so the next connect mints a grant that includes them.
 */
export function clearSavedLoginForScopeGap(text: string, storage?: SessionStorage): string | null {
  const message = reconnectMessage(text);
  if (!message) return null;
  (storage ?? localStorage).removeItem(SESSION_KEY);
  return message;
}

export function authorizeSearchParams(input: {
  clientId: string;
  challenge: string;
  redirectUri: string;
}): URLSearchParams {
  return new URLSearchParams({
    audience: "https://api.yotoplay.com",
    scope: YOTO_SCOPES,
    response_type: "code",
    client_id: input.clientId,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    redirect_uri: input.redirectUri,
  });
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function profileName(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  const payload = decodeJwt(idToken);
  const name = payload?.name ?? payload?.nickname ?? payload?.email;
  return typeof name === "string" ? name : undefined;
}

export function sessionFromToken(
  payload: TokenResponse,
  clientId: string,
  previous?: YotoSession | null,
): YotoSession {
  if (!payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.message ||
        payload.error ||
        "Yoto did not return an access token.",
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? previous?.refreshToken,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    name: profileName(payload.id_token) ?? previous?.name,
    clientId,
  };
}

export async function beginYotoLogin(clientId: string) {
  const { verifier, challenge } = await createPkce();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(CLIENT_KEY, clientId);
  const params = authorizeSearchParams({
    clientId,
    challenge,
    redirectUri: redirectUri(),
  });
  window.location.assign(
    `https://login.yotoplay.com/authorize?${params.toString()}`,
  );
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch("/api/yoto/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as TokenResponse;
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.message ||
        payload.error ||
        "Yoto refused the login.",
    );
  }
  return payload;
}

export async function exchangeCode(code: string): Promise<YotoSession> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const clientId = localStorage.getItem(CLIENT_KEY) ?? "";
  if (!verifier || !clientId) {
    throw new Error("The login session expired. Connect Yoto again.");
  }
  const payload = await postToken({
    clientId,
    code,
    codeVerifier: verifier,
    redirectUri: redirectUri(),
  });
  sessionStorage.removeItem(VERIFIER_KEY);
  const session = sessionFromToken(payload, clientId);
  writeSession(session);
  return session;
}

export async function ensureSession(): Promise<YotoSession | null> {
  const session = readSession();
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session;
  if (!session.refreshToken) {
    writeSession(null);
    return null;
  }
  try {
    const payload = await postToken({
      clientId: session.clientId,
      refreshToken: session.refreshToken,
    });
    const next = sessionFromToken(payload, session.clientId, session);
    writeSession(next);
    return next;
  } catch {
    writeSession(null);
    return null;
  }
}

export async function yotoFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await ensureSession();
  if (!session) {
    throw new Error("Connect Yoto before cutting a card.");
  }
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
}
