import { jsonError } from "@/lib/yoto-proxy";

const TOKEN_URL = "https://login.yotoplay.com/oauth/token";

type TokenBody = {
  clientId?: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
  refreshToken?: string;
};

export async function POST(request: Request) {
  let body: TokenBody;
  try {
    body = (await request.json()) as TokenBody;
  } catch {
    return jsonError("The login request was not valid JSON.");
  }

  const clientId = body.clientId?.trim();
  if (!clientId) return jsonError("A Yoto client ID is required.");

  const params = new URLSearchParams({ client_id: clientId });
  if (body.refreshToken) {
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", body.refreshToken);
  } else if (body.code && body.codeVerifier && body.redirectUri) {
    params.set("grant_type", "authorization_code");
    params.set("code", body.code);
    params.set("code_verifier", body.codeVerifier);
    params.set("redirect_uri", body.redirectUri);
  } else {
    return jsonError("Missing the Yoto authorization code or refresh token.");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
