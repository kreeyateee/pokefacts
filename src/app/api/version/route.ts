import { APP_BUILD } from "@/lib/site";

/** Which build the server is running, so an open page can tell the site was updated under it. */
export function GET() {
  return Response.json({ build: APP_BUILD }, { headers: { "Cache-Control": "no-store" } });
}
