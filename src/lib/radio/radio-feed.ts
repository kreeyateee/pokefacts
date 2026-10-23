/** One published episode, as saved next to its MP3 in data/radio. */
export type EpisodeMeta = {
  /** The day, YYYY-MM-DD. Also the MP3's name. */
  date: string;
  title: string;
  description: string;
  bytes: number;
  seconds: number;
  /** Every Pokémon it plays, so the next few days pick others. */
  dexIds: number[];
  /** When it was made, ISO 8601. The feed's publication time. */
  made: string;
};

export const RADIO_TITLE = "Pokefacts Radio";

export const RADIO_SUMMARY =
  "A short daily Pokémon show for children: a Pokémon of the day, Who's That Pokémon, and a joke. " +
  "Read by the voices Pokefacts uses on Yoto. An independent fan project, not made by or affiliated with " +
  "Nintendo, Game Freak, Creatures, The Pokémon Company or Yoto.";

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function isEpisodeDate(value: string): boolean {
  if (!DATE_SHAPE.test(value)) return false;
  const day = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/** "Sunday 25 October 2026". */
export function spokenDay(date: string): string {
  if (!isEpisodeDate(date)) return date;
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(",", "");
}

/** The episode title: the Pokémon of the day and the day. The Who's That answer is never in it. */
export function episodeTitle(date: string, factName: string): string {
  return `${factName}: ${spokenDay(date)}`;
}

/** The show notes. Names the Pokémon of the day and the joke, never the Who's That answer. */
export function episodeDescription(input: {
  factName: string;
  guess: boolean;
  jokeName?: string;
  voiceNames: readonly string[];
}): string {
  const parts = [`Pokémon of the day: ${input.factName}.`];
  if (input.guess) parts.push("Then Who's That Pokémon? Listen to the clues and shout your guess.");
  if (input.jokeName) parts.push(`And a joke about ${input.jokeName}.`);
  const voices = [...new Set(input.voiceNames)];
  if (voices.length === 1) parts.push(`Read by ${voices[0]}.`);
  else if (voices.length > 1) parts.push(`Read by ${voices.slice(0, -1).join(", ")} and ${voices.at(-1)}.`);
  return parts.join(" ");
}

/** The newest episodes first, keeping only well-formed ones. */
export function newestFirst(episodes: readonly EpisodeMeta[]): EpisodeMeta[] {
  return episodes.filter((episode) => isEpisodeDate(episode.date)).sort((a, b) => b.date.localeCompare(a.date));
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** H:MM:SS for itunes:duration. */
export function clockDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function episodeAudioPath(date: string): string {
  return `/radio/episodes/${date}.mp3`;
}

/**
 * The podcast feed. Podcast apps take it by its address. It asks the big directories not to list it
 * (itunes:block, googleplay:block): Pokefacts Radio is shared from the site only.
 */
export function radioFeedXml(origin: string, episodes: readonly EpisodeMeta[]): string {
  const site = origin.replace(/\/$/, "");
  const items = newestFirst(episodes)
    .map((episode) => {
      const url = `${site}${episodeAudioPath(episode.date)}`;
      return [
        "    <item>",
        `      <title>${escapeXml(episode.title)}</title>`,
        `      <description>${escapeXml(episode.description)}</description>`,
        `      <itunes:summary>${escapeXml(episode.description)}</itunes:summary>`,
        `      <enclosure url="${escapeXml(url)}" length="${episode.bytes}" type="audio/mpeg"/>`,
        `      <guid isPermaLink="false">pokefacts-radio-${episode.date}</guid>`,
        `      <pubDate>${new Date(episode.made).toUTCString()}</pubDate>`,
        `      <itunes:duration>${clockDuration(episode.seconds)}</itunes:duration>`,
        "      <itunes:explicit>false</itunes:explicit>",
        "      <itunes:episodeType>full</itunes:episodeType>",
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:googleplay="http://www.google.com/schemas/play-podcasts/1.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${RADIO_TITLE}</title>`,
    `    <link>${escapeXml(`${site}/radio`)}</link>`,
    `    <atom:link href="${escapeXml(`${site}/radio/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    `    <description>${escapeXml(RADIO_SUMMARY)}</description>`,
    `    <itunes:summary>${escapeXml(RADIO_SUMMARY)}</itunes:summary>`,
    "    <language>en</language>",
    "    <itunes:author>Pokefacts</itunes:author>",
    `    <itunes:image href="${escapeXml(`${site}/radio/cover.png`)}"/>`,
    `    <image><url>${escapeXml(`${site}/radio/cover.png`)}</url><title>${RADIO_TITLE}</title><link>${escapeXml(`${site}/radio`)}</link></image>`,
    '    <itunes:category text="Kids &amp; Family"/>',
    "    <itunes:explicit>false</itunes:explicit>",
    "    <itunes:type>episodic</itunes:type>",
    "    <itunes:block>Yes</itunes:block>",
    "    <googleplay:block>yes</googleplay:block>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
