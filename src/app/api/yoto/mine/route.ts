import { bearerToken, forwardYoto, jsonError } from "@/lib/yoto-proxy";

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before reading the library.", 401);
  return forwardYoto("https://api.yotoplay.com/content/mine", token);
}
