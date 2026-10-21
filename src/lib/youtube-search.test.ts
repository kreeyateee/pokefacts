import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cachedYoutubeId,
  isYoutubeVideoUnavailable,
  parseYoutubeSearchLines,
  pickYoutubeSearchHit,
  replacementSearchId,
  youtubeSearchArgs,
  youtubeSearchQuery,
  type YoutubeSearchHit,
} from "./youtube-search";

describe("youtube song search", () => {
  it("asks YouTube for the Pokémon song and prints id, channel, and title", () => {
    assert.equal(youtubeSearchQuery("Kanto Pokérap"), "Pokémon Kanto Pokérap");
    assert.equal(youtubeSearchQuery("Viridian City (song)"), "Pokémon Viridian City");
    const args = youtubeSearchArgs("Pokémon Kanto Pokérap");
    assert.equal(args.at(-1), "ytsearch8:Pokémon Kanto Pokérap");
    assert.ok(args.includes("--flat-playlist"));
    assert.equal(args.includes("--yes-playlist"), false);
  });

  it("keeps the official upload and skips a cover that does not name the song", () => {
    const stdout = [
      "xMk8wuw7nek\u001fEXCEEDINGSHADOW\u001fOriginal PokeRap (Gotta Catch 'Em All)",
      "eJwR_CPBQJU\u001fPokémon - Topic\u001fPokérap (Kanto Version)",
      "6xzD3umBDuU\u001fAceArclight\u001fPokemon Kanto pokerap nightcore",
      "not-an-id\u001fPokémon\u001fKanto Pokérap",
    ].join("\n");
    const hits = parseYoutubeSearchLines(stdout);
    assert.deepEqual(
      hits.map((hit) => hit.id),
      ["xMk8wuw7nek", "eJwR_CPBQJU", "6xzD3umBDuU"],
    );
    assert.equal(pickYoutubeSearchHit(hits, "Kanto Pokérap"), "eJwR_CPBQJU");
  });

  it("returns nothing when every hit is a different song", () => {
    const hits: YoutubeSearchHit[] = [
      { id: "R4GIyJxvk94", channel: "Pokémon", title: "Pokémon Theme" },
    ];
    assert.equal(pickYoutubeSearchHit(hits, "Kanto Pokérap"), null);
  });

  it("skips a removed upload and keeps the next official match", () => {
    const hits: YoutubeSearchHit[] = [
      { id: "8xxgBFYQTL4", channel: "Pokémon", title: "Pokémon Johto" },
      { id: "abcdefghijk", channel: "Pokémon - Topic", title: "Pokémon Johto" },
      { id: "nightcore11", channel: "AceArclight", title: "Pokémon Johto nightcore" },
    ];
    assert.equal(replacementSearchId(hits, "Pokémon Johto", ["8xxgBFYQTL4"]), "abcdefghijk");
    assert.equal(replacementSearchId(hits, "Pokémon Johto", ["8xxgBFYQTL4", "abcdefghijk"]), null);
  });

  it("treats a removed or private watch page as unavailable", () => {
    assert.equal(isYoutubeVideoUnavailable("[youtube] 8xxgBFYQTL4: This video is not available"), true);
    assert.equal(isYoutubeVideoUnavailable("Private video"), true);
    assert.equal(isYoutubeVideoUnavailable("This video has been removed by the uploader"), true);
    assert.equal(isYoutubeVideoUnavailable("Video unavailable"), true);
    assert.equal(
      isYoutubeVideoUnavailable("The uploader has not made this video available in your country"),
      true,
    );
    assert.equal(isYoutubeVideoUnavailable("The watch page cannot be used"), true);
    assert.equal(isYoutubeVideoUnavailable("YouTube asked for a sign-in, so this audio could not be saved as an MP3."), false);
    assert.equal(isYoutubeVideoUnavailable("Requested format is not available"), false);
  });

  it("serves a cached replacement instead of probing the dead id again", () => {
    assert.deepEqual(
      cachedYoutubeId({ youtubeId: "abcdefghijk", replaced: "8xxgBFYQTL4" }, "8xxgBFYQTL4"),
      { action: "use", youtubeId: "abcdefghijk" },
    );
    assert.deepEqual(cachedYoutubeId({ youtubeId: "8xxgBFYQTL4", checked: "8xxgBFYQTL4" }, "8xxgBFYQTL4"), {
      action: "use",
      youtubeId: "8xxgBFYQTL4",
    });
    assert.deepEqual(cachedYoutubeId({ youtubeId: "4kJ9wp-mog8" }, null), {
      action: "use",
      youtubeId: "4kJ9wp-mog8",
    });
    assert.deepEqual(cachedYoutubeId(undefined, "8xxgBFYQTL4"), { action: "probe", youtubeId: "8xxgBFYQTL4" });
    assert.deepEqual(cachedYoutubeId({ youtubeId: "4kJ9wp-mog8" }, "8xxgBFYQTL4"), {
      action: "probe",
      youtubeId: "8xxgBFYQTL4",
    });
  });
});
