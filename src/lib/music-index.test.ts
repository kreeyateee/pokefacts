import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyMusicIndex, songForPage, type MusicSong } from "./music-index";

function song(page: string, title: string): MusicSong {
  return { title, page, url: `https://bulbapedia.bulbagarden.net/wiki/${encodeURI(page)}`, youtubeId: null };
}

describe("songForPage", () => {
  const index = {
    ...emptyMusicIndex(),
    songs: [
      song("Pokémon_Theme", "Pokémon Theme"),
      song("What_Kind_of_Pokémon_Are_You?", "What Kind of Pokémon Are You?"),
      song("You_&_Me_&_Pokémon", "You & Me & Pokémon"),
      song("XY&Z_(song)", "XY&Z"),
    ],
  };

  it("finds songs whose names have question marks or ampersands", () => {
    assert.equal(songForPage(index, "What_Kind_of_Pokémon_Are_You?")?.title, "What Kind of Pokémon Are You?");
    assert.equal(songForPage(index, "You_&_Me_&_Pokémon")?.title, "You & Me & Pokémon");
    assert.equal(songForPage(index, " XY&Z_(song) ")?.title, "XY&Z");
  });

  it("finds nothing for names that are not in the list", () => {
    assert.equal(songForPage(index, ""), null);
    assert.equal(songForPage(index, null), null);
    assert.equal(songForPage(index, "../../etc/passwd"), null);
    assert.equal(songForPage(index, "Pokémon_Theme#x"), null);
    assert.equal(songForPage(index, "x".repeat(200)), null);
  });
});
