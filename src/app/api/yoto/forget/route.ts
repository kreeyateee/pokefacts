import path from "node:path";

import { forgetRenderedMedia, readForgetHashes, renderedAccount } from "@/lib/rendered-media";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";

const RENDER_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "rendered");

/**
 * Yoto said it no longer has some recordings. Forget this account's cached yoto:# for them, so the
 * next track request uploads the kept .mp3 again. Body: `{ hashes: ["<Yoto sha256>", …] }`.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before sending.", 401);

  let body: { hashes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("The request was not valid JSON.");
  }

  let hashes: string[];
  try {
    hashes = readForgetHashes(body?.hashes);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Those recordings could not be read.");
  }

  const { forgotten } = await forgetRenderedMedia(hashes, renderedAccount(token), RENDER_ROOT);
  console.info(`[send] Yoto had lost ${hashes.length} recording(s); forgot ${forgotten} cached upload(s).`);
  return Response.json({ forgotten });
}
