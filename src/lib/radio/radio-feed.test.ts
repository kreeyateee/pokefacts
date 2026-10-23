import assert from "node:assert/strict";
import { test } from "node:test";

import { byteRange } from "@/lib/radio/byte-range";
import {
  clockDuration,
  episodeDescription,
  episodeTitle,
  isEpisodeDate,
  radioFeedXml,
  type EpisodeMeta,
} from "@/lib/radio/radio-feed";

const episode = (date: string): EpisodeMeta => ({
  date,
  title: episodeTitle(date, "Pikachu"),
  description: episodeDescription({
    factName: "Pikachu",
    guess: true,
    jokeName: "Psyduck",
    voiceNames: ["Lily", "George", "Lily"],
  }),
  bytes: 1234,
  seconds: 185,
  dexIds: [25, 150, 54],
  made: `${date}T00:00:05.000Z`,
});

test("names the day and the Pokémon of the day, never the Who's That answer", () => {
  assert.equal(episodeTitle("2026-10-25", "Pikachu"), "Pikachu: Sunday 25 October 2026");
  const notes = episode("2026-10-25").description;
  assert.match(notes, /Pokémon of the day: Pikachu\./);
  assert.match(notes, /a joke about Psyduck/);
  assert.match(notes, /Read by Lily and George\./);
});

test("only real calendar days are episode dates", () => {
  assert.ok(isEpisodeDate("2026-10-25"));
  assert.ok(!isEpisodeDate("2026-02-30"));
  assert.ok(!isEpisodeDate("../../etc/passwd"));
  assert.ok(!isEpisodeDate("2026-10-25.mp3"));
});

test("the feed lists episodes newest first, with their audio, and asks directories not to list it", () => {
  const xml = radioFeedXml("https://pokefacts.online/", [episode("2026-10-24"), episode("2026-10-25"), episode("bad")]);
  assert.ok(xml.indexOf("2026-10-25.mp3") < xml.indexOf("2026-10-24.mp3"));
  assert.match(
    xml,
    /<enclosure url="https:\/\/pokefacts\.online\/radio\/episodes\/2026-10-25\.mp3" length="1234" type="audio\/mpeg"\/>/,
  );
  assert.match(xml, /<itunes:duration>0:03:05<\/itunes:duration>/);
  assert.match(xml, /<itunes:block>Yes<\/itunes:block>/);
  assert.match(xml, /Kids &amp; Family/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
});

test("escapes the show notes", () => {
  const xml = radioFeedXml("https://pokefacts.online", [{ ...episode("2026-10-25"), title: "Farfetch'd & <friends>" }]);
  assert.match(xml, /Farfetch&apos;d &amp; &lt;friends&gt;/);
});

test("clock durations", () => {
  assert.equal(clockDuration(59), "0:00:59");
  assert.equal(clockDuration(3725), "1:02:05");
});

test("byte ranges for podcast apps", () => {
  assert.equal(byteRange(null, 100), null);
  assert.deepEqual(byteRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(byteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange("bytes=50-500", 100), { start: 50, end: 99 });
  assert.equal(byteRange("bytes=100-", 100), "invalid");
  assert.equal(byteRange("bytes=0-1,5-9", 100), null);
});
