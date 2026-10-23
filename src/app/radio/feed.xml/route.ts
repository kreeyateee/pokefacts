import { radioFeedXml } from "@/lib/radio/radio-feed";
import { feedOrigin, withTodaysEpisode } from "@/lib/radio/radio-route";
import { listEpisodes } from "@/lib/radio/radio-store";

/** The Pokefacts Radio podcast feed. Asking for it makes today's episode if it is not made yet. */
export async function GET(request: Request) {
  await withTodaysEpisode();
  const xml = radioFeedXml(feedOrigin(request), await listEpisodes());
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}
