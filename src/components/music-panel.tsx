"use client";

import { useMemo, useState } from "react";

import { MusicPlaylistSection, useMusicPlaylist } from "@/components/music-playlist";
import rawIndex from "@/data/music-index.json";
import { readMusicIndex, type MusicSong } from "@/lib/music-index";

function songMessage(song: MusicSong, code: string | undefined): string {
  if (code === "missingtitle") return "Bulbapedia does not have a page for this song.";
  if (code) return "This song page did not load from Bulbapedia.";
  if (!song.youtubeId) return "Bulbapedia does not have a YouTube video for this song.";
  return "";
}

export function MusicPanel() {
  const loaded = useMemo(() => readMusicIndex(rawIndex), []);
  const { index, error } = loaded;
  const songsByPage = useMemo(() => new Map(index.songs.map((song) => [song.page, song])), [index.songs]);
  const gapByPage = useMemo(() => new Map(index.gaps.map((gap) => [gap.page, gap.code])), [index.gaps]);
  const blocked = index.gaps.filter((gap) => gap.code !== "missingtitle");
  const [query, setQuery] = useState("");
  const [albumPage, setAlbumPage] = useState(index.albums[0]?.page ?? "");
  const [songPage, setSongPage] = useState("");
  const playlist = useMusicPlaylist();

  const needle = query.trim().toLowerCase();
  const visibleAlbums = index.albums.filter((album) => {
    if (!needle) return true;
    if (album.title.toLowerCase().includes(needle) || album.group.toLowerCase().includes(needle)) return true;
    return album.songs.some((page) => songsByPage.get(page)?.title.toLowerCase().includes(needle));
  });
  const album = visibleAlbums.find((item) => item.page === albumPage) ?? visibleAlbums[0];
  const albumMatches =
    !needle ||
    !album ||
    album.title.toLowerCase().includes(needle) ||
    album.group.toLowerCase().includes(needle);
  const visibleSongs = (album?.songs ?? [])
    .map((page) => songsByPage.get(page))
    .filter((song): song is MusicSong => Boolean(song))
    .filter((song) => albumMatches || !needle || song.title.toLowerCase().includes(needle));
  const song = visibleSongs.find((item) => item.page === songPage) ?? visibleSongs[0];
  const gap = song ? gapByPage.get(song.page) : undefined;
  const note = song ? songMessage(song, gap) : "";

  return (
    <div className="grid min-w-0 gap-4">
      {error ? <p className="pk-card px-4 py-3 text-sm leading-6">{error}</p> : null}
      {blocked.length > 0 ? (
        <p className="text-sm leading-6 text-ink">
          Some Bulbapedia pages did not load, so a few albums or videos are missing.
        </p>
      ) : null}
      {!error && index.albums.length === 0 ? (
        <p className="pk-card px-4 py-4 text-sm leading-6">No albums are in the music list yet.</p>
      ) : null}
      <label className="grid min-w-0 gap-1 text-sm font-bold" htmlFor="music-search">
        Search
        <input
          id="music-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Album or song"
          className="pk-field"
          style={{ fontSize: 16 }}
        />
      </label>
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <section id="music-albums" className="min-w-0" aria-label="Albums">
          <h2 className="text-xl text-ink">Albums</h2>
          {visibleAlbums.length === 0 ? (
            <p className="mt-2 text-sm leading-6">No albums match that search.</p>
          ) : (
            <div className="mt-2 grid max-h-80 gap-2 overflow-y-auto pr-1">
              {visibleAlbums.map((item) => {
                const selected = item.page === album?.page;
                return (
                  <button
                    key={item.page}
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      setAlbumPage(item.page);
                      setSongPage("");
                    }}
                    className="pk-choice min-w-0 px-3 py-2 text-left"
                  >
                    <span className="block text-xs font-bold uppercase tracking-wide text-poke-red">{item.group}</span>
                    <span className="block break-words">{item.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <section className="grid min-w-0 content-start gap-3" aria-label="Songs">
          <h2 className="text-xl text-ink">Songs</h2>
          {!album ? null : visibleSongs.length === 0 ? (
            <p className="text-sm leading-6">
              {gapByPage.has(album.page)
                ? "This album's page did not load from Bulbapedia."
                : needle
                  ? "No songs match that search."
                  : "Bulbapedia lists this album, but its tracks are not linked to song pages."}
            </p>
          ) : (
            <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
              {visibleSongs.map((item) => {
                const selected = item.page === song?.page;
                return (
                  <div key={item.page} className="flex min-w-0 items-stretch gap-2">
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => setSongPage(item.page)}
                      className="pk-choice min-w-0 flex-1 px-3 py-2 text-left break-words"
                    >
                      {item.title}
                    </button>
                    <button
                      type="button"
                      className="pk-pill min-h-11 self-center"
                      aria-label={`Add ${item.title} to My playlist`}
                      onClick={() => {
                        setSongPage(item.page);
                        playlist.addSong({
                          page: item.page,
                          title: item.title,
                          album: album.title,
                          youtubeId: item.youtubeId,
                        });
                      }}
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {playlist.notice ? (
            <p role="status" className="text-sm leading-6">
              {playlist.notice}
            </p>
          ) : null}
          {song ? (
            <div id="music-player" className="pk-card min-w-0 p-3">
              <p className="text-lg font-bold break-words text-ink">{song.title}</p>
              {song.youtubeId && !playlist.playing ? (
                <>
                  <iframe
                    className="pk-music-frame mt-3"
                    title={song.title}
                    src={`https://www.youtube-nocookie.com/embed/${song.youtubeId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                  <p className="mt-3 text-sm leading-6">
                    If the player stays blank,{" "}
                    <a
                      className="font-bold underline decoration-poke-red decoration-2"
                      href={`https://www.youtube.com/watch?v=${song.youtubeId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      open this video on YouTube
                    </a>
                    .
                  </p>
                </>
              ) : song.youtubeId ? null : (
                <p className="mt-2 text-sm leading-6">{note}</p>
              )}
              <p className="mt-2 text-sm leading-6">
                <a className="font-bold underline decoration-poke-red decoration-2" href={song.url} target="_blank" rel="noreferrer">
                  Read this song on Bulbapedia
                </a>
              </p>
            </div>
          ) : null}
        </section>
      </div>
      <MusicPlaylistSection playlist={playlist} />
    </div>
  );
}
