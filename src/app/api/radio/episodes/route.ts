import { connection } from "next/server";

import { episodeAudioPath } from "@/lib/radio/radio-feed";
import { withTodaysEpisode } from "@/lib/radio/radio-route";
import { listEpisodes } from "@/lib/radio/radio-store";

/** The episodes for the Radio page, newest first, making today's if it is not made yet. */
export async function GET() {
  await connection();
  await withTodaysEpisode();
  const episodes = (await listEpisodes()).map((episode) => ({
    date: episode.date,
    title: episode.title,
    description: episode.description,
    seconds: episode.seconds,
    audio: episodeAudioPath(episode.date),
  }));
  return Response.json({ episodes }, { headers: { "Cache-Control": "public, max-age=300" } });
}
