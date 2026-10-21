import assert from "node:assert/strict";
import { describe, it } from "node:test";

import names from "@/data/species-names.json";
import { YOTO_ICONS } from "./yoto-icons";
import { musicStickerCard, musicTrackIcon, songPokemonId, type SpeciesName } from "./music-pokemon";

const species = names as SpeciesName[];
const pixel = `yoto:#${"p".repeat(43)}`;

describe("song Pokémon", () => {
  it("uses one Pokémon from the title or page and skips a song about none or several", () => {
    assert.equal(songPokemonId("Song of Jigglypuff", "Song_of_Jigglypuff", species), 39);
    assert.equal(songPokemonId("The Time Has Come (Pikachu's Goodbye)", "The_Time_Has_Come_(Pikachu's_Goodbye)", species), 25);
    assert.equal(songPokemonId("Mewtwo Strikes Back", "Pokémon:_Mewtwo_Strikes_Back—Evolution_(single)", species), 150);
    assert.equal(songPokemonId("Farfetch'd", "Farfetch'd", species), 83);
    assert.equal(songPokemonId("Nidoran♀", "Nidoran♀", species), 29);
    assert.equal(songPokemonId("Nidoran", "Nidoran", species), null);
    assert.equal(songPokemonId("Pokémon Johto", "Pokémon_Johto", species), null);
    assert.equal(songPokemonId("Pokémon Theme", "Pokémon_Theme", species), null);
    assert.equal(songPokemonId("Pikachu and Eevee", "Pikachu_and_Eevee", species), null);
    assert.equal(songPokemonId("Misty's Song", "Misty's_Song", species), null);
  });

  it("puts the uploaded pixel on a matched song and the music icon on the rest", () => {
    assert.equal(musicTrackIcon(39, { 39: "p".repeat(43) }), pixel);
    assert.equal(musicTrackIcon(null, {}), YOTO_ICONS.music);
    assert.equal(musicTrackIcon(25, {}), YOTO_ICONS.music);
  });

  it("builds a sticker card from the named playlist and the songs about one Pokémon", () => {
    const card = musicStickerCard("  Johto songs  ", [
      { title: "Pokémon Johto", dexId: null },
      { title: "Song of Jigglypuff", dexId: 39 },
    ]);
    assert.equal(card?.libraryTitle, "Johto songs");
    assert.equal(card?.chapters.length, 1);
    assert.equal(card?.chapters[0]?.dexId, 39);
    assert.equal(card?.chapters[0]?.sprite, "/sprites/39.png");
    assert.equal(card?.chapters[0]?.icon, "/pixels/39.png");
    assert.equal(musicStickerCard("Pokémon music", [{ title: "Pokémon Theme", dexId: null }]), null);
  });
});
