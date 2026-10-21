import { LOCAL_APP_ORIGIN } from "@/lib/local-origin";

const ALLOWED_ORIGINS = new Set([
  "https://pokefacts.duckdns.org",
  LOCAL_APP_ORIGIN,
  "http://localhost:3847",
]);

/** Let the public site call the Pokefacts app on this computer. */
export function clientAppCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Private-Network", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function withClientAppCors(request: Request, response: Response): Response {
  clientAppCorsHeaders(request).forEach((value, key) => response.headers.set(key, value));
  return response;
}

export function clientAppPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: clientAppCorsHeaders(request) });
}
