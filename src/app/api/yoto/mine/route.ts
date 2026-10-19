import { safeHttpStatus, yotoUpstreamFailure } from "@/lib/yoto-error";
import { bearerToken, forwardYoto, jsonError } from "@/lib/yoto-proxy";

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before reading the library.", 401);
  const upstream = await forwardYoto("https://api.yotoplay.com/content/mine", token);
  if (upstream.ok) return upstream;
  const text = await upstream.text();
  return Response.json(yotoUpstreamFailure(text), { status: safeHttpStatus(upstream.status) });
}
