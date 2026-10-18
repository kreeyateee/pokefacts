import { bearerToken, forwardYoto, jsonError } from "@/lib/yoto-proxy";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const token = bearerToken(request);
  if (!token) return jsonError("Connect Yoto before checking a recording.", 401);
  const { jobId } = await ctx.params;
  if (!/^[\w-]{8,80}$/.test(jobId)) {
    return jsonError("That recording job id does not look right.");
  }
  return forwardYoto(
    `https://labs.api.yotoplay.com/content/job/${encodeURIComponent(jobId)}`,
    token,
  );
}
