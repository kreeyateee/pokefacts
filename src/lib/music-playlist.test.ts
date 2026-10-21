import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MUSIC_PLAYLIST_LIMIT,
  addMusicPlaylistSong,
  moveMusicPlaylistSong,
  musicPlaylistIndexAfterMove,
  musicPlaylistIndexAfterRemove,
  musicPlaylistRefusalText,
  readStoredMusicPlaylist,
  removeMusicPlaylistSong,
  serializeMusicPlaylist,
  stepMusicPlaylist,
  youtubeNocookieEmbedSrc,
  type MusicPlaylistDraft,
  type MusicPlaylistSong,
} from "./music-playlist";

function draft(title: string, youtubeId: string | null, album = "Pokémon 2.B.A. Master"): MusicPlaylistDraft {
  return { page: title.replace(/ /g, "_"), title, album, youtubeId };
}

function titles(songs: readonly MusicPlaylistSong[]): string[] {
  return songs.map((song) => song.title);
}

describe("music playlist queue", () => {
  it("adds a song that has a YouTube id", () => {
    const first = addMusicPlaylistSong([], draft("Pokémon Theme", "R4GIyJxvk94"));
    assert.equal(first.added, true);
    assert.equal(first.refusal, "");
    assert.deepEqual(titles(first.songs), ["Pokémon Theme"]);
    assert.equal(first.songs[0]?.youtubeId, "R4GIyJxvk94");
    assert.equal(first.songs[0]?.album, "Pokémon 2.B.A. Master");

    const second = addMusicPlaylistSong(first.songs, draft("The Time Has Come", "7Vmw9xqaryM"));
    assert.deepEqual(titles(second.songs), ["Pokémon Theme", "The Time Has Come"]);
    assert.deepEqual(titles(first.songs), ["Pokémon Theme"]);
  });

  it("skips a song with no YouTube id and says why", () => {
    const start = addMusicPlaylistSong([], draft("Pokémon Theme", "R4GIyJxvk94")).songs;
    for (const youtubeId of [null, "", "short", "channel/link"]) {
      const result = addMusicPlaylistSong(start, draft("2.B.A. Master", youtubeId));
      assert.equal(result.added, false);
      assert.equal(result.refusal, "novideo");
      assert.deepEqual(titles(result.songs), ["Pokémon Theme"]);
    }
    assert.equal(
      musicPlaylistRefusalText("novideo"),
      "Bulbapedia does not have a YouTube video for this song.",
    );
  });

  it("removes a song and leaves a bad index untouched", () => {
    const songs = addMusicPlaylistSong(
      addMusicPlaylistSong([], draft("Pokémon Theme", "R4GIyJxvk94")).songs,
      draft("The Time Has Come", "7Vmw9xqaryM"),
    ).songs;
    const withThird = addMusicPlaylistSong(songs, draft("Pokérap", "8xxgBFYQTL4")).songs;
    assert.deepEqual(titles(removeMusicPlaylistSong(withThird, 1)), ["Pokémon Theme", "Pokérap"]);
    assert.deepEqual(titles(removeMusicPlaylistSong(withThird, -1)), titles(withThird));
    assert.deepEqual(titles(removeMusicPlaylistSong(withThird, 9)), titles(withThird));
    assert.equal(musicPlaylistIndexAfterRemove(2, 0, 3), 1);
    assert.equal(musicPlaylistIndexAfterRemove(1, 1, 3), 1);
    assert.equal(musicPlaylistIndexAfterRemove(2, 2, 3), 1);
    assert.equal(musicPlaylistIndexAfterRemove(0, 0, 1), 0);
  });

  it("moves a song up or down and keeps the playhead on that song", () => {
    const songs = ["Pokémon Theme", "2.B.A. Master", "Viridian City"].reduce<MusicPlaylistSong[]>((list, title, index) => {
      return addMusicPlaylistSong(list, draft(title, `abcde00000${index}`)).songs;
    }, []);
    assert.deepEqual(titles(moveMusicPlaylistSong(songs, 2, -1)), [
      "Pokémon Theme",
      "Viridian City",
      "2.B.A. Master",
    ]);
    assert.deepEqual(titles(moveMusicPlaylistSong(songs, 0, 1)), [
      "2.B.A. Master",
      "Pokémon Theme",
      "Viridian City",
    ]);
    assert.deepEqual(titles(moveMusicPlaylistSong(songs, 0, -1)), titles(songs));
    assert.deepEqual(titles(moveMusicPlaylistSong(songs, 2, 1)), titles(songs));
    assert.equal(musicPlaylistIndexAfterMove(0, 0, 1, 3), 1);
    assert.equal(musicPlaylistIndexAfterMove(1, 0, 1, 3), 0);
    assert.equal(musicPlaylistIndexAfterMove(2, 0, 1, 3), 2);
    assert.equal(stepMusicPlaylist(0, 3, -1), 0);
    assert.equal(stepMusicPlaylist(1, 3, 1), 2);
    assert.equal(stepMusicPlaylist(2, 3, 1), 2);
  });

  it("caps the queue at 100 songs", () => {
    let songs: MusicPlaylistSong[] = [];
    for (let index = 0; index < MUSIC_PLAYLIST_LIMIT; index += 1) {
      const result = addMusicPlaylistSong(songs, draft(`Song ${index}`, "R4GIyJxvk94"));
      assert.equal(result.added, true);
      songs = result.songs;
    }
    assert.equal(songs.length, 100);
    const extra = addMusicPlaylistSong(songs, draft("One more", "7Vmw9xqaryM"));
    assert.equal(extra.added, false);
    assert.equal(extra.refusal, "full");
    assert.equal(extra.songs.length, 100);
    assert.equal(extra.songs[99]?.title, "Song 99");
    assert.equal(musicPlaylistRefusalText("full"), "A playlist holds 100 tracks.");
  });

  it("remembers the song list and current index, and drops songs that cannot play", () => {
    const songs = addMusicPlaylistSong([], draft("Pokémon Theme", "R4GIyJxvk94")).songs;
    const raw = serializeMusicPlaylist({ songs, index: 0 });
    assert.equal(readStoredMusicPlaylist(raw).songs[0]?.title, "Pokémon Theme");
    assert.equal(readStoredMusicPlaylist(raw).index, 0);

    const noisy = JSON.stringify({
      index: 4,
      songs: [
        { page: "A", title: "A", album: "Album A", youtubeId: "R4GIyJxvk94", id: "a" },
        { page: "B", title: "B", album: "Album B", youtubeId: null },
        { page: "C", title: "C", youtubeId: "7Vmw9xqaryM" },
        { title: "no page", youtubeId: "8xxgBFYQTL4" },
      ],
    });
    const stored = readStoredMusicPlaylist(noisy);
    assert.deepEqual(
      stored.songs.map((song) => song.title),
      ["A", "C"],
    );
    assert.equal(stored.songs[1]?.album, "");
    assert.equal(stored.index, 1);
    assert.deepEqual(readStoredMusicPlaylist("not json"), { songs: [], index: 0 });
    assert.deepEqual(readStoredMusicPlaylist(null), { songs: [], index: 0 });
  });

  it("points the embed at youtube-nocookie with the iframe api and origin", () => {
    const src = youtubeNocookieEmbedSrc("R4GIyJxvk94", "http://127.0.0.1:3847", true);
    const url = new URL(src);
    assert.equal(url.origin, "https://www.youtube-nocookie.com");
    assert.equal(url.pathname, "/embed/R4GIyJxvk94");
    assert.equal(url.searchParams.get("enablejsapi"), "1");
    assert.equal(url.searchParams.get("origin"), "http://127.0.0.1:3847");
    assert.equal(url.searchParams.get("autoplay"), "1");
    const paused = new URL(youtubeNocookieEmbedSrc("R4GIyJxvk94", "http://127.0.0.1:3847", false));
    assert.equal(paused.searchParams.get("autoplay"), null);
  });
});
