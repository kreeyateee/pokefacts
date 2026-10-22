"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SongLyrics } from "@/components/song-lyrics";
import {
  MusicPlayerEmbed,
  MusicPlaylistSection,
  MusicTransport,
  useMusicPlaylist,
  type MusicEmbedControls,
} from "@/components/music-playlist";
import rawIndex from "@/data/music-index.json";
import { readMusicIndex, type MusicSong } from "@/lib/music-index";
import { lookupQueue, readVideoLookup, songVideoId, songVideoNote, type VideoLookup } from "@/lib/music-player";
import { musicPlaylistRefusalText } from "@/lib/music-playlist";

async function fetchVideoLookup(page: string, signal?: AbortSignal): Promise<VideoLookup> {
  try {
    const response = await fetch(`/api/music/youtube?page=${encodeURIComponent(page)}`, { signal });
    const payload = (await response.json().catch(() => null)) as unknown;
    return readVideoLookup(response.ok, payload);
  } catch (error) {
    if (signal?.aborted) throw error;
    return { state: "error" };
  }
}

/** A song picked in the Songs list, with the album it was picked from. */
type BrowsePick = { page: string; album: string };

type PlayerTrack = {
  /** Changes when another song is loaded into the player. */
  key: string;
  title: string;
  album: string;
  page: string;
  url: string;
  videoId: string | null;
  note: string;
  canRetry: boolean;
};

export function MusicPanel() {
  const loaded = useMemo(() => readMusicIndex(rawIndex), []);
  const { index, error } = loaded;
  const songsByPage = useMemo(() => new Map(index.songs.map((song) => [song.page, song])), [index.songs]);
  const gapByPage = useMemo(() => new Map(index.gaps.map((gap) => [gap.page, gap.code])), [index.gaps]);
  const blocked = index.gaps.filter((gap) => gap.code !== "missingtitle");
  const [query, setQuery] = useState("");
  const [albumPage, setAlbumPage] = useState(index.albums[0]?.page ?? "");
  const [pick, setPick] = useState<BrowsePick | null>(null);
  const [lookups, setLookups] = useState<Record<string, VideoLookup>>({});
  const lookupsRef = useRef(lookups);
  const [retries, setRetries] = useState(0);
  const [adding, setAdding] = useState<ReadonlySet<string>>(() => new Set());
  const playlist = useMusicPlaylist();

  // One current track. It is My playlist's current song unless a song was
  // picked in the Songs list after it, or My playlist is empty.
  const [preferBrowse, setPreferBrowse] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [take, setTake] = useState(0);
  const [reveals, setReveals] = useState(0);
  const controlsRef = useRef<MusicEmbedControls | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

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
  const pickedSong = pick ? songsByPage.get(pick.page) : undefined;
  const browseSong = pickedSong ?? visibleSongs[0];
  const browseAlbum = pickedSong && pick ? pick.album : (album?.title ?? "");
  const source = playlist.songs.length > 0 && !preferBrowse ? "playlist" : "browse";
  const listSong = source === "playlist" ? playlist.songs[playlist.index] : undefined;

  const browseLookup = browseSong ? lookups[browseSong.page] : undefined;
  const browseVideoId = browseSong ? songVideoId(browseSong, browseLookup) : null;
  const track: PlayerTrack | null = listSong
    ? {
        key: `playlist:${listSong.id}`,
        title: listSong.title,
        album: listSong.album,
        page: listSong.page,
        url: songsByPage.get(listSong.page)?.url ?? "",
        videoId: listSong.youtubeId,
        note: "",
        canRetry: false,
      }
    : browseSong
      ? {
          key: `song:${browseSong.page}`,
          title: browseSong.title,
          album: browseAlbum,
          page: browseSong.page,
          url: browseSong.url,
          videoId: browseVideoId,
          note: songVideoNote({ gap: gapByPage.get(browseSong.page), videoId: browseVideoId, lookup: browseLookup }),
          canRetry: browseLookup?.state === "error",
        }
      : null;
  const canPlay = Boolean(track?.videoId);

  const recordLookup = useCallback((page: string, result: VideoLookup | undefined) => {
    const next = { ...lookupsRef.current };
    if (result) next[page] = result;
    else delete next[page];
    lookupsRef.current = next;
    setLookups(next);
  }, []);

  // Look up the songs on screen that have no stored video, current song first.
  // The pages are joined into one string so the effect only restarts when they change.
  const browsePage = browseSong?.page;
  const lookupPages = [...new Set([browsePage ?? "", ...visibleSongs.map((song) => song.page)])].join("\n");
  useEffect(() => {
    const songs = lookupPages.split("\n").flatMap((page) => songsByPage.get(page) ?? []);
    const pages = lookupQueue(songs, browsePage, lookupsRef.current);
    if (pages.length === 0) return;
    const controller = new AbortController();
    void (async () => {
      for (const page of pages) {
        if (lookupsRef.current[page]) continue;
        let result: VideoLookup;
        try {
          result = await fetchVideoLookup(page, controller.signal);
        } catch {
          return;
        }
        recordLookup(page, result);
      }
    })();
    return () => controller.abort();
  }, [lookupPages, browsePage, songsByPage, recordLookup, retries]);

  useEffect(() => {
    if (reveals === 0) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    playerRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
  }, [reveals]);

  function setPlayState(next: boolean) {
    setPlaying(next);
    if (source === "playlist") playlist.setPaused(!next);
  }

  /** Start the song in the player, or carry on from where it paused. */
  function resume() {
    if (!canPlay) return;
    // Keep this song in the player while the album or the search changes.
    if (source === "browse" && !pick && browseSong) setPick({ page: browseSong.page, album: browseAlbum });
    setPlayState(true);
    if (controlsRef.current) controlsRef.current.play();
    else setTake((current) => current + 1);
  }

  function pause() {
    setPlayState(false);
    if (controlsRef.current) controlsRef.current.pause();
    else setTake((current) => current + 1);
  }

  function stop() {
    setPlayState(false);
    if (controlsRef.current) controlsRef.current.stop();
    else setTake((current) => current + 1);
  }

  function playAt(at: number) {
    setReveals((current) => current + 1);
    if (source === "playlist" && at === playlist.index) {
      resume();
      return;
    }
    setPreferBrowse(false);
    playlist.select(at);
    playlist.setPaused(false);
    setPlaying(true);
  }

  function skip(direction: -1 | 1) {
    if (source !== "playlist") return;
    const moved = playlist.step(direction, "skip");
    if (moved?.same) setTake((current) => current + 1);
  }

  function songEnded() {
    const moved = source === "playlist" ? playlist.step(1, "ended") : null;
    if (!moved) {
      setPlayState(false);
      return;
    }
    if (moved.same) setTake((current) => current + 1);
  }

  function pickSong(item: MusicSong) {
    if (source === "playlist") playlist.setPaused(true);
    setPick({ page: item.page, album: album?.title ?? "" });
    setPreferBrowse(true);
  }

  function retryLookup(page: string) {
    recordLookup(page, undefined);
    setRetries((current) => current + 1);
  }

  function removeAt(at: number) {
    if (source === "playlist" && playlist.songs.length === 1) setPlaying(false);
    playlist.removeSong(at);
  }

  async function addToPlaylist(item: MusicSong, albumTitle: string) {
    if (adding.has(item.page)) return;
    if (playlist.has(item.page)) {
      playlist.say(musicPlaylistRefusalText("duplicate"));
      return;
    }
    setAdding((current) => new Set(current).add(item.page));
    try {
      let lookup = lookupsRef.current[item.page];
      if (!songVideoId(item, lookup) && lookup?.state !== "none") {
        lookup = await fetchVideoLookup(item.page);
        recordLookup(item.page, lookup);
      }
      playlist.addSong({ page: item.page, title: item.title, album: albumTitle, youtubeId: songVideoId(item, lookup) });
    } finally {
      setAdding((current) => {
        const next = new Set(current);
        next.delete(item.page);
        return next;
      });
    }
  }

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
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)]">
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
                    onClick={() => setAlbumPage(item.page)}
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
            <div className="grid max-h-96 gap-2 overflow-y-auto pr-1">
              {visibleSongs.map((item) => {
                const selected = source === "browse" && item.page === browseSong?.page;
                const pending = adding.has(item.page);
                return (
                  <div key={item.page} className="flex min-w-0 items-stretch gap-2">
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => pickSong(item)}
                      className="pk-choice min-w-0 flex-1 px-3 py-2 text-left break-words"
                    >
                      {item.title}
                    </button>
                    <button
                      type="button"
                      className="pk-pill min-h-11 self-center"
                      aria-label={`Add ${item.title} to My playlist`}
                      aria-busy={pending || undefined}
                      disabled={pending}
                      onClick={() => void addToPlaylist(item, album.title)}
                    >
                      {pending ? "Adding…" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {track ? (
        <div id="music-player" ref={playerRef} className="pk-card min-w-0 scroll-mt-4 p-4">
          <p className="text-lg font-bold break-words text-ink">{track.title}</p>
          {track.album ? <p className="text-sm leading-6 break-words">{track.album}</p> : null}
          {track.videoId ? (
            <MusicPlayerEmbed
              key={`${track.key}:${track.videoId}:${take}`}
              videoId={track.videoId}
              title={track.title}
              autoplay={playing}
              controlsRef={controlsRef}
              onPlayingChange={setPlayState}
              onEnded={songEnded}
            />
          ) : (
            <p className="mt-2 text-sm leading-6">
              {track.note}
              {track.canRetry ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="font-bold underline decoration-poke-red decoration-2"
                    onClick={() => retryLookup(track.page)}
                  >
                    Try again
                  </button>
                </>
              ) : null}
            </p>
          )}
          <MusicTransport
            playing={playing && canPlay}
            canPlay={canPlay}
            canPrevious={source === "playlist" && playlist.canPrevious}
            canNext={source === "playlist" && playlist.canNext}
            repeat={playlist.repeat}
            shuffle={playlist.shuffle}
            onPlay={resume}
            onPause={pause}
            onStop={stop}
            onPrevious={() => skip(-1)}
            onNext={() => skip(1)}
            onRepeat={playlist.cycleRepeat}
            onShuffle={playlist.toggleShuffle}
          />
          {track.videoId ? (
            <p className="mt-3 text-sm leading-6">
              If the player stays blank,{" "}
              <a
                className="font-bold underline decoration-poke-red decoration-2"
                href={`https://www.youtube.com/watch?v=${track.videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                open this video on YouTube
              </a>
              .
            </p>
          ) : null}
          {track.url ? (
            <p className="mt-2 text-sm leading-6">
              <a className="font-bold underline decoration-poke-red decoration-2" href={track.url} target="_blank" rel="noreferrer">
                Read this song on Bulbapedia
              </a>
            </p>
          ) : null}
          <h3 className="mt-3 text-base font-bold text-ink">Lyrics</h3>
          <SongLyrics page={track.page} />
        </div>
      ) : null}
      <MusicPlaylistSection
        playlist={playlist}
        playingIndex={source === "playlist" && playing ? playlist.index : null}
        onPlayAt={playAt}
        onRemove={removeAt}
      />
    </div>
  );
}
