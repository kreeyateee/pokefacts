import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MUSIC_PLAYLIST_LIMIT,
  addMusicPlaylistSong,
  addToMusicPlaylist,
  emptyMusicPlaylist,
  moveInMusicPlaylist,
  moveMusicPlaylistSong,
  musicPlayOrder,
  musicPlaylistIndexAfterPlace,
  musicPlaylistNeighbour,
  placeInMusicPlaylist,
  placeMusicPlaylistSong,
  musicPlaylistIndexAfterMove,
  musicPlaylistIndexAfterRemove,
  musicPlaylistRefusalText,
  musicRepeatLabel,
  nextMusicRepeat,
  readStoredMusicPlaylist,
  removeFromMusicPlaylist,
  removeMusicPlaylistSong,
  selectInMusicPlaylist,
  serializeMusicPlaylist,
  shuffleMusicPlaylist,
  shuffledMusicOrder,
  youtubeNocookieEmbedSrc,
  type MusicPlaylistDraft,
  type MusicPlaylistSong,
  type StoredMusicPlaylist,
} from "./music-playlist";

function draft(title: string, youtubeId: string | null, album = "Pokémon 2.B.A. Master"): MusicPlaylistDraft {
  return { page: title.replace(/ /g, "_"), title, album, youtubeId };
}

function titles(songs: readonly MusicPlaylistSong[]): string[] {
  return songs.map((song) => song.title);
}

function playlistOf(names: string[], extra: Partial<StoredMusicPlaylist> = {}): StoredMusicPlaylist {
  let playlist = emptyMusicPlaylist();
  names.forEach((name, index) => {
    playlist = addToMusicPlaylist(playlist, draft(name, `abcde00000${index % 10}`)).playlist;
  });
  return { ...playlist, ...extra };
}

/** Always picks the first remaining slot, so a shuffle reverses the list. */
const first = () => 0;

describe("music playlist queue", () => {
  it("adds a song that has a YouTube id", () => {
    const one = addMusicPlaylistSong([], draft("Pokémon Theme", "R4GIyJxvk94"));
    assert.equal(one.added, true);
    assert.equal(one.refusal, "");
    assert.deepEqual(titles(one.songs), ["Pokémon Theme"]);
    assert.equal(one.songs[0]?.youtubeId, "R4GIyJxvk94");
    assert.equal(one.songs[0]?.album, "Pokémon 2.B.A. Master");

    const two = addMusicPlaylistSong(one.songs, draft("The Time Has Come", "7Vmw9xqaryM"));
    assert.deepEqual(titles(two.songs), ["Pokémon Theme", "The Time Has Come"]);
    assert.deepEqual(titles(one.songs), ["Pokémon Theme"]);
  });

  it("skips a song with no YouTube id and says why", () => {
    const start = addMusicPlaylistSong([], draft("Pokémon Theme", "R4GIyJxvk94")).songs;
    for (const youtubeId of [null, "", "short", "channel/link"]) {
      const result = addMusicPlaylistSong(start, draft("2.B.A. Master", youtubeId));
      assert.equal(result.added, false);
      assert.equal(result.refusal, "novideo");
      assert.deepEqual(titles(result.songs), ["Pokémon Theme"]);
    }
    assert.equal(musicPlaylistRefusalText("novideo"), "No YouTube video was found for this song.");
  });

  it("refuses a song that is already in the playlist", () => {
    const start = addMusicPlaylistSong([], draft("Pokémon Theme", "R4GIyJxvk94")).songs;
    const again = addMusicPlaylistSong(start, draft("Pokémon Theme", "R4GIyJxvk94"));
    assert.equal(again.added, false);
    assert.equal(again.refusal, "duplicate");
    assert.equal(again.songs.length, 1);
    assert.equal(musicPlaylistRefusalText("duplicate"), "That song is already in My playlist.");
  });

  it("keeps both songs when two adds land one after the other", () => {
    // Each add reads the snapshot the previous add wrote, as the hook does.
    let raw = serializeMusicPlaylist(emptyMusicPlaylist());
    for (const song of [draft("Pokémon Theme", "R4GIyJxvk94"), draft("Pokérap", "8xxgBFYQTL4")]) {
      raw = serializeMusicPlaylist(addToMusicPlaylist(readStoredMusicPlaylist(raw), song).playlist);
    }
    assert.deepEqual(titles(readStoredMusicPlaylist(raw).songs), ["Pokémon Theme", "Pokérap"]);
  });

  it("gives every song a unique id that does not change between reads", () => {
    const legacy = JSON.stringify({
      index: 0,
      songs: [
        { page: "A", title: "A", youtubeId: "R4GIyJxvk94" },
        { page: "A", title: "A", youtubeId: "R4GIyJxvk94" },
        { page: "B", title: "B", youtubeId: "7Vmw9xqaryM", id: "same" },
        { page: "C", title: "C", youtubeId: "8xxgBFYQTL4", id: "same" },
      ],
    });
    const once = readStoredMusicPlaylist(legacy).songs.map((song) => song.id);
    const twice = readStoredMusicPlaylist(legacy).songs.map((song) => song.id);
    assert.deepEqual(once, twice);
    assert.deepEqual(once, ["A:R4GIyJxvk94", "A:R4GIyJxvk94#2", "same", "same#2"]);
    const round = readStoredMusicPlaylist(serializeMusicPlaylist(readStoredMusicPlaylist(legacy)));
    assert.deepEqual(round.songs.map((song) => song.id), once);

    const removed = removeFromMusicPlaylist(readStoredMusicPlaylist(legacy), 0);
    const readded = addToMusicPlaylist(removed, { page: "D", title: "D", album: "", youtubeId: "R4GIyJxvk94" });
    const ids = readded.playlist.songs.map((song) => song.id);
    assert.equal(new Set(ids).size, ids.length);
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
    assert.deepEqual(titles(placeMusicPlaylistSong(songs, 0, 2)), ["2.B.A. Master", "Viridian City", "Pokémon Theme"]);
    assert.equal(musicPlaylistIndexAfterPlace(0, 0, 2, 3), 2);
    assert.equal(musicPlaylistIndexAfterPlace(2, 0, 2, 3), 1);
    assert.deepEqual(titles(moveMusicPlaylistSong(songs, 2, 1)), titles(songs));
    assert.equal(musicPlaylistIndexAfterMove(0, 0, 1, 3), 1);
    assert.equal(musicPlaylistIndexAfterMove(1, 0, 1, 3), 0);
    assert.equal(musicPlaylistIndexAfterMove(2, 0, 1, 3), 2);

    const playlist = playlistOf(["A", "B", "C"], { index: 0 });
    const moved = moveInMusicPlaylist(playlist, 0, 1);
    assert.equal(moved.songs[moved.index]?.title, "A");
    const placed = placeInMusicPlaylist(playlist, 0, 2);
    assert.equal(placed.songs[placed.index]?.title, "A");
  });

  it(`caps the queue at ${MUSIC_PLAYLIST_LIMIT} songs`, () => {
    let songs: MusicPlaylistSong[] = [];
    for (let index = 0; index < MUSIC_PLAYLIST_LIMIT; index += 1) {
      const result = addMusicPlaylistSong(songs, draft(`Song ${index}`, "R4GIyJxvk94"));
      assert.equal(result.added, true);
      songs = result.songs;
    }
    assert.equal(songs.length, MUSIC_PLAYLIST_LIMIT);
    const extra = addMusicPlaylistSong(songs, draft("One more", "7Vmw9xqaryM"));
    assert.equal(extra.added, false);
    assert.equal(extra.refusal, "full");
    assert.equal(extra.songs.length, MUSIC_PLAYLIST_LIMIT);
    assert.equal(extra.songs[MUSIC_PLAYLIST_LIMIT - 1]?.title, `Song ${MUSIC_PLAYLIST_LIMIT - 1}`);
    assert.equal(musicPlaylistRefusalText("full"), `A playlist holds ${MUSIC_PLAYLIST_LIMIT} tracks.`);
  });
});

describe("music playlist playback order", () => {
  it("stops at either end when repeat is off", () => {
    const playlist = playlistOf(["A", "B", "C"]);
    assert.equal(musicPlaylistNeighbour({ ...playlist, index: 0 }, 1, "skip"), 1);
    assert.equal(musicPlaylistNeighbour({ ...playlist, index: 2 }, 1, "skip"), null);
    assert.equal(musicPlaylistNeighbour({ ...playlist, index: 2 }, 1, "ended"), null);
    assert.equal(musicPlaylistNeighbour({ ...playlist, index: 0 }, -1, "skip"), null);
    assert.equal(musicPlaylistNeighbour(emptyMusicPlaylist(), 1, "ended"), null);
  });

  it("wraps with repeat all and replays one song with repeat one", () => {
    const all = playlistOf(["A", "B", "C"], { repeat: "all" });
    assert.equal(musicPlaylistNeighbour({ ...all, index: 2 }, 1, "ended"), 0);
    assert.equal(musicPlaylistNeighbour({ ...all, index: 0 }, -1, "skip"), 2);

    const one = playlistOf(["A", "B", "C"], { repeat: "one", index: 1 });
    assert.equal(musicPlaylistNeighbour(one, 1, "ended"), 1);
    assert.equal(musicPlaylistNeighbour(one, 1, "skip"), 2);
    assert.equal(musicPlaylistNeighbour({ ...one, index: 2 }, 1, "skip"), null);
  });

  it("cycles repeat off, all, one, off", () => {
    assert.equal(nextMusicRepeat("off"), "all");
    assert.equal(nextMusicRepeat("all"), "one");
    assert.equal(nextMusicRepeat("one"), "off");
    assert.equal(musicRepeatLabel("one"), "Repeat: this song");
  });

  it("shuffles the rest of the list behind the current song", () => {
    assert.deepEqual(shuffledMusicOrder(["a", "b", "c", "d"], "b", first), ["b", "c", "d", "a"]);
    assert.deepEqual(shuffledMusicOrder(["a", "b"], undefined, first), ["b", "a"]);

    const playlist = shuffleMusicPlaylist(playlistOf(["A", "B", "C", "D"], { index: 1 }), true, first);
    assert.equal(playlist.shuffle, true);
    assert.deepEqual(
      musicPlayOrder(playlist).map((index) => playlist.songs[index]?.title),
      ["B", "C", "D", "A"],
    );
    assert.equal(musicPlaylistNeighbour(playlist, 1, "skip"), 2);
    assert.equal(musicPlaylistNeighbour({ ...playlist, index: 0 }, 1, "ended"), null);
    assert.equal(musicPlaylistNeighbour({ ...playlist, index: 0, repeat: "all" }, 1, "ended"), 1);

    const off = shuffleMusicPlaylist(playlist, false);
    assert.deepEqual(off.order, []);
    assert.deepEqual(musicPlayOrder(off), [0, 1, 2, 3]);
  });

  it("keeps the shuffled order in step when songs are added or removed", () => {
    const shuffled = shuffleMusicPlaylist(playlistOf(["A", "B", "C"], { index: 0 }), true, first);
    const added = addToMusicPlaylist(shuffled, draft("D", "R4GIyJxvk94")).playlist;
    assert.equal(added.order.at(-1), added.songs[3]?.id);
    const removed = removeFromMusicPlaylist(added, 1);
    assert.equal(removed.order.length, 3);
    assert.equal(removed.order.includes(added.songs[1]?.id ?? ""), false);
  });

  it("selects a song by index and clamps a bad one", () => {
    const playlist = playlistOf(["A", "B", "C"]);
    assert.equal(selectInMusicPlaylist(playlist, 2).index, 2);
    assert.equal(selectInMusicPlaylist(playlist, 9).index, 2);
    assert.equal(selectInMusicPlaylist(playlist, -1).index, 0);
  });
});

describe("saved music playlist", () => {
  it("remembers the songs, index, pause, repeat, and shuffle", () => {
    const shuffled = shuffleMusicPlaylist(playlistOf(["A", "B", "C"], { index: 1, repeat: "all" }), true, first);
    const stored = readStoredMusicPlaylist(serializeMusicPlaylist({ ...shuffled, paused: false }));
    assert.deepEqual(titles(stored.songs), ["A", "B", "C"]);
    assert.equal(stored.index, 1);
    assert.equal(stored.paused, false);
    assert.equal(stored.repeat, "all");
    assert.equal(stored.shuffle, true);
    assert.deepEqual(stored.order, shuffled.order);
  });

  it("reads a playlist saved before repeat and shuffle, and drops songs that cannot play", () => {
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
    assert.deepEqual(titles(stored.songs), ["A", "C"]);
    assert.equal(stored.songs[0]?.id, "a");
    assert.equal(stored.songs[1]?.album, "");
    assert.equal(stored.index, 1);
    assert.equal(stored.paused, true);
    assert.equal(stored.repeat, "off");
    assert.equal(stored.shuffle, false);
    assert.deepEqual(readStoredMusicPlaylist("not json"), emptyMusicPlaylist());
    assert.deepEqual(readStoredMusicPlaylist(null), emptyMusicPlaylist());
    assert.equal(readStoredMusicPlaylist(JSON.stringify({ songs: [], repeat: "loud" })).repeat, "off");
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
