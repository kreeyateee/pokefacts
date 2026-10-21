"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SongLyrics } from "@/components/song-lyrics";
import { MusicPlaylistEmbed, MusicPlaylistSection, useMusicPlaylist } from "@/components/music-playlist";
import { Button } from "@/components/ui/button";
import rawIndex from "@/data/music-index.json";
import { encodeYoutubeCookies, netscapeYoutubeCookies, YOUTUBE_COOKIE_STORAGE } from "@/lib/client-youtube";
import { readMusicIndex, type MusicSong } from "@/lib/music-index";
import { musicPlaylistUpload, musicYotoSavePlan, type MusicPlaylistTrack } from "@/lib/youtube-playlist";
import { yotoFetch } from "@/lib/yoto-session";
import { uploadForPlaylist } from "@/lib/yoto-send";

function songMessage(code: string | undefined, found: string | null | undefined): string {
  if (code === "missingtitle") return "Bulbapedia does not have a page for this song.";
  if (code) return "This song page did not load from Bulbapedia.";
  if (found) return "";
  if (found === undefined) return "Finding this song on YouTube…";
  return "No YouTube video was found for this song.";
}

function cookieHeaders(cookies: string, headers: Record<string, string> = {}): Record<string, string> {
  if (!cookies) return headers;
  return { ...headers, "X-Youtube-Cookies": encodeYoutubeCookies(cookies) };
}

async function lookupYoutubeId(page: string, cookies: string): Promise<string | null> {
  const response = await fetch(`/api/music/youtube?page=${encodeURIComponent(page)}`, {
    headers: cookieHeaders(cookies),
  });
  const payload = (await response.json().catch(() => null)) as { youtubeId?: unknown; error?: string } | null;
  if (!response.ok) throw new Error(payload?.error?.trim() || "That song could not be found on YouTube.");
  const id = payload?.youtubeId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error?.trim() || fallback;
}

export function MusicPanel({
  connected = false,
  onConnect,
  voiceId,
}: {
  connected?: boolean;
  onConnect?: () => void;
  voiceId?: string;
}) {
  const loaded = useMemo(() => readMusicIndex(rawIndex), []);
  const { index, error } = loaded;
  const songsByPage = useMemo(() => new Map(index.songs.map((song) => [song.page, song])), [index.songs]);
  const gapByPage = useMemo(() => new Map(index.gaps.map((gap) => [gap.page, gap.code])), [index.gaps]);
  const blocked = index.gaps.filter((gap) => gap.code !== "missingtitle");
  const [query, setQuery] = useState("");
  const [albumPage, setAlbumPage] = useState(index.albums[0]?.page ?? "");
  const [songPage, setSongPage] = useState("");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mp3Id, setMp3Id] = useState("");
  const [youtubeCookies, setYoutubeCookies] = useState("");
  const cookiesRef = useRef("");
  const [found, setFound] = useState<Record<string, string | null>>({});
  const foundRef = useRef(found);
  const playlist = useMusicPlaylist();

  useEffect(() => {
    const saved = window.sessionStorage.getItem(YOUTUBE_COOKIE_STORAGE) ?? "";
    if (!netscapeYoutubeCookies(saved)) return;
    cookiesRef.current = saved;
    setYoutubeCookies(saved);
  }, []);

  function rememberYoutubeCookies(value: string) {
    cookiesRef.current = value;
    setYoutubeCookies(value);
    if (value) window.sessionStorage.setItem(YOUTUBE_COOKIE_STORAGE, value);
    else window.sessionStorage.removeItem(YOUTUBE_COOKIE_STORAGE);
  }

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
  const playingSong = playlist.playing ? playlist.songs[playlist.index] : undefined;
  const playingPage = playingSong?.page;
  const lookedUp = playingSong ? found[playingSong.page] : song ? found[song.page] : undefined;
  const resolvedId = typeof lookedUp === "string" ? lookedUp : null;
  const playerSong = playingSong
    ? {
        title: playingSong.title,
        page: playingSong.page,
        album: playingSong.album,
        youtubeId: resolvedId,
        url: songsByPage.get(playingSong.page)?.url ?? "",
      }
    : song
      ? {
          title: song.title,
          page: song.page,
          album: album?.title ?? "",
          youtubeId: resolvedId,
          url: song.url,
        }
      : null;
  const playerNote = playingSong
    ? lookedUp
      ? ""
      : lookedUp === undefined
        ? "Finding this song on YouTube…"
        : "No YouTube video was found for this song."
    : song
      ? songMessage(gap, lookedUp)
      : "";

  useEffect(() => {
    const pages: string[] = [];
    const seen = new Set<string>();
    const consider = (page: string | undefined, resolveKnown: boolean) => {
      if (!page || seen.has(page)) return;
      const item = songsByPage.get(page);
      if (!item || foundRef.current[page] !== undefined) return;
      if (item.youtubeId && !resolveKnown) return;
      seen.add(page);
      pages.push(page);
    };
    consider(playingPage, true);
    consider(song?.page, true);
    for (const page of album?.songs ?? []) consider(page, false);
    if (pages.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const page of pages) {
        if (cancelled || foundRef.current[page] !== undefined) continue;
        let id: string | null;
        try {
          id = await lookupYoutubeId(page, cookiesRef.current);
        } catch (caught) {
          if (cancelled) return;
          setFailed(true);
          setNote(caught instanceof Error ? caught.message : "That song could not be found on YouTube.");
          return;
        }
        if (cancelled) return;
        foundRef.current = { ...foundRef.current, [page]: id };
        setFound(foundRef.current);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [album?.page, album?.songs, playingPage, song?.page, songsByPage, youtubeCookies]);

  async function playMp3(item: MusicSong, youtubeId: string) {
    if (!youtubeId || busy || saving) return;
    setBusy(true);
    setFailed(false);
    setNote(`Saving ${item.title} as an MP3…`);
    try {
      const response = await fetch("/api/music/mp3", {
        method: "POST",
        headers: cookieHeaders(cookiesRef.current, { "Content-Type": "application/json" }),
        body: JSON.stringify({ page: item.page, upload: false }),
      });
      if (!response.ok) throw new Error(await messageOf(response, "That song could not be saved as an MP3."));
      setMp3Id(youtubeId);
      setNote("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That song could not be saved as an MP3.";
      setFailed(true);
      setNote(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveToYoto() {
    const plan = musicYotoSavePlan({
      connected,
      count: playlist.songs.length,
      title: "Pokémon music",
    });
    if (!plan.ok) {
      setFailed(true);
      setNote(plan.message);
      if (plan.connect) onConnect?.();
      return;
    }
    if (busy || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const finished: MusicPlaylistTrack[] = [];
      for (const item of playlist.songs) {
        setNote(`Saving ${item.title} as an MP3…`);
        const response = await yotoFetch("/api/music/mp3", {
          method: "POST",
          headers: cookieHeaders(cookiesRef.current, { "Content-Type": "application/json" }),
          body: JSON.stringify({ page: item.page, upload: true }),
        });
        if (!response.ok) throw new Error(await messageOf(response, "That audio could not be saved as an MP3."));
        const payload = (await response.json()) as { tracks?: MusicPlaylistTrack[] };
        const track = payload.tracks?.[0];
        if (!track?.trackUrl?.startsWith("yoto:#")) throw new Error(`${item.title} is not a finished MP3.`);
        finished.push({
          title: item.title,
          youtubeId: track.youtubeId || item.youtubeId,
          trackUrl: track.trackUrl,
          duration: track.duration,
          fileSize: track.fileSize,
          channels: track.channels,
        });
      }
      setNote("Sending the playlist…");
      const upload = uploadForPlaylist(musicPlaylistUpload(plan.title, finished, voiceId), undefined);
      const response = await yotoFetch("/api/yoto/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upload),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        status?: string;
        result?: { cardId?: string };
      } | null;
      if (!response.ok || payload?.status !== "completed" || !payload.result?.cardId) {
        throw new Error(payload?.error || "Yoto did not accept this playlist.");
      }
      setFailed(false);
      setNote(`${plan.title} is in your Yoto library.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The playlist was not sent.";
      if (/connect yoto/i.test(message)) {
        setFailed(true);
        setNote("Connect Yoto before saving this playlist.");
        onConnect?.();
      } else {
        setFailed(true);
        setNote(message);
      }
    } finally {
      setSaving(false);
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
      <YoutubeSignIn
        ready={Boolean(youtubeCookies)}
        onSave={rememberYoutubeCookies}
        onForget={() => rememberYoutubeCookies("")}
      />
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
            <div className="grid max-h-96 gap-2 overflow-y-auto pr-1">
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
                        void (async () => {
                          let youtubeId = foundRef.current[item.page];
                          if (youtubeId === undefined) {
                            youtubeId = await lookupYoutubeId(item.page, cookiesRef.current);
                            foundRef.current = { ...foundRef.current, [item.page]: youtubeId };
                            setFound(foundRef.current);
                          }
                          playlist.addSong({
                            page: item.page,
                            title: item.title,
                            album: album.title,
                            youtubeId,
                          });
                        })();
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
        </section>
      </div>
      {playerSong ? (
        <div id="music-player" className="pk-card min-w-0 p-4">
          <p className="text-lg font-bold break-words text-ink">{playerSong.title}</p>
          {playerSong.album ? <p className="text-sm leading-6 break-words">{playerSong.album}</p> : null}
          {playerSong.youtubeId ? (
            playingSong ? (
              <MusicPlaylistEmbed
                key={`${playingSong.id}-${playlist.playGeneration}`}
                videoId={playingSong.youtubeId}
                title={playingSong.title}
                autoplay={playlist.playing}
                onEnded={playlist.onEnded}
              />
            ) : (
              <iframe
                className="pk-music-frame mt-3"
                title={playerSong.title}
                src={`https://www.youtube-nocookie.com/embed/${playerSong.youtubeId}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            )
          ) : (
            <p className="mt-2 text-sm leading-6">{playerNote}</p>
          )}
          {playerSong.youtubeId ? (
            <p className="mt-3 text-sm leading-6">
              If the player stays blank,{" "}
              <a
                className="font-bold underline decoration-poke-red decoration-2"
                href={`https://www.youtube.com/watch?v=${playerSong.youtubeId}`}
                target="_blank"
                rel="noreferrer"
              >
                open this video on YouTube
              </a>
              .
            </p>
          ) : null}
          {song && !playingSong && playerSong.youtubeId ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-11 px-4"
              disabled={busy}
              onClick={() => void playMp3(song, playerSong.youtubeId || "")}
            >
              {busy && note.startsWith("Saving") && note.includes(song.title) ? "Saving the MP3…" : "Play MP3"}
            </Button>
          ) : null}
          {song && mp3Id && mp3Id === playerSong.youtubeId ? (
            <audio className="mt-3 w-full" controls autoPlay src={`/api/music/mp3/${mp3Id}`} />
          ) : null}
          {playerSong.url ? (
            <p className="mt-2 text-sm leading-6">
              <a className="font-bold underline decoration-poke-red decoration-2" href={playerSong.url} target="_blank" rel="noreferrer">
                Read this song on Bulbapedia
              </a>
            </p>
          ) : null}
          <h3 className="mt-3 text-base font-bold text-ink">Lyrics</h3>
          <SongLyrics page={playerSong.page} />
        </div>
      ) : null}
      {note ? (
        <p role="status" className={`text-sm leading-6 ${failed ? "text-poke-red" : ""}`}>
          {note}
        </p>
      ) : null}
      <MusicPlaylistSection playlist={playlist} saving={saving} onSave={() => void saveToYoto()} />
    </div>
  );
}

function YoutubeSignIn({
  ready,
  onSave,
  onForget,
}: {
  ready: boolean;
  onSave: (cookies: string) => void;
  onForget: () => void;
}) {
  const [problem, setProblem] = useState("");

  async function choose(file: File | undefined) {
    if (!file) return;
    const cookies = netscapeYoutubeCookies(await file.text());
    if (!cookies) {
      setProblem("That file does not look like YouTube cookies from a signed-in browser.");
      return;
    }
    setProblem("");
    onSave(cookies);
  }

  return (
    <section className="pk-card grid gap-2 p-4" aria-label="YouTube sign-in">
      <h2 className="text-base font-bold text-ink">YouTube sign-in</h2>
      <p className="text-sm leading-6">
        YouTube asks for your own sign-in before a song can be saved. Choose a cookies.txt from a browser where you are signed in to YouTube. It stays in this tab and is sent only for the download.
      </p>
      {ready ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm leading-6">Your YouTube sign-in is ready.</p>
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onForget}>
            Forget sign-in
          </Button>
        </div>
      ) : (
        <label className="text-sm font-bold" htmlFor="youtube-cookies">
          cookies.txt
          <input
            id="youtube-cookies"
            className="mt-1 block text-sm font-normal"
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void choose(file);
            }}
          />
        </label>
      )}
      {problem ? <p className="text-sm leading-6 text-poke-red">{problem}</p> : null}
    </section>
  );
}
