import { looksLikeGateway, PUBLIC_LINK_TIMEOUT, safeHttpStatus } from "@/lib/yoto-error";

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (token.length < 20 || token.length > 12000) return null;
  return token;
}

export async function forwardYoto(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (looksLikeGateway(response.status, text)) {
    return Response.json(
      { error: PUBLIC_LINK_TIMEOUT, message: PUBLIC_LINK_TIMEOUT },
      { status: safeHttpStatus(response.status) },
    );
  }
  return new Response(text || "{}", {
    status: response.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
