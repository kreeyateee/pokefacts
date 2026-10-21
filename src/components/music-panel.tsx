"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useRowDrag } from "@/components/row-drag";
import { SongLyrics } from "@/components/song-lyrics";
import { MusicPlaylistSection, useMusicPlaylist } from "@/components/music-playlist";
import { Button } from "@/components/ui/button";
import { WebaooFiles } from "@/components/webaoo-files";
import rawIndex from "@/data/music-index.json";
import { YOTO_TRACK_LIMIT } from "@/lib/kid-cards";
import { readMusicIndex, type MusicSong } from "@/lib/music-index";
import { movePlaylistItem } from "@/lib/playlist-order";
import { youtubeTarget } from "@/lib/youtube-link";
import { musicPlaylistTitle, musicPlaylistUpload, type MusicPlaylistTrack } from "@/lib/youtube-playlist";
import { uploadForPlaylist } from "@/lib/yoto-send";
import { yotoFetch } from "@/lib/yoto-session";

function songMessage(song: MusicSong, code: string | undefined): string {
  if (code === "missingtitle") return "Bulbapedia does not have a page for this song.";
  if (code) return "This song page did not load from Bulbapedia.";
  if (!song.youtubeId) return "Bulbapedia does not have a YouTube video for this song.";
  return "";
}

type QueueItem = { kind: "page"; page: string } | { kind: "link"; url: string; playlist: boolean };

type SavedTrack = MusicPlaylistTrack & { page?: string };

function queueLabel(item: QueueItem, songsByPage: Map<string, MusicSong>): string {
  if (item.kind === "page") return songsByPage.get(item.page)?.title || "Song";
  return item.playlist ? "YouTube playlist" : "YouTube video";
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error?.trim() || fallback;
}

export function MusicPanel({
  playlists = [],
  libraryNote = "",
  onConnect,
  playlistTarget = "",
  onPlaylistTarget,
  voiceId,
}: {
  playlists?: Array<{ cardId: string; title: string }>;
  libraryNote?: string;
  onConnect?: () => void;
  playlistTarget?: string;
  onPlaylistTarget?: (id: string) => void;
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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [link, setLink] = useState("");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mp3Id, setMp3Id] = useState("");
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
  const playerNote = song ? songMessage(song, gap) : "";
  const queued = queue.length;
  const queueDrag = useRowDrag("data-yoto-queue-index", (from, to) => {
    setQueue((current) => movePlaylistItem(current, from, to));
  });

  function toggleSong(page: string) {
    setQueue((current) => {
      const existing = current.findIndex((item) => item.kind === "page" && item.page === page);
      if (existing >= 0) return current.filter((_, index) => index !== existing);
      if (current.length >= YOTO_TRACK_LIMIT) return current;
      return [...current, { kind: "page", page }];
    });
    setFailed(false);
  }

  function addLink() {
    const target = youtubeTarget(link);
    if (!target) {
      setFailed(true);
      setNote("Paste a YouTube video or playlist link.");
      return;
    }
    if (queue.length >= YOTO_TRACK_LIMIT) {
      setFailed(true);
      setNote(`A playlist holds ${YOTO_TRACK_LIMIT} tracks.`);
      return;
    }
    setQueue((current) =>
      current.some((item) => item.kind === "link" && item.url === target.url) ? current : [...current, { kind: "link", ...target }],
    );
    setLink("");
    setFailed(false);
    setNote("");
  }

  async function playMp3(item: MusicSong) {
    if (!item.youtubeId || busy) return;
    setBusy(true);
    setFailed(false);
    setNote(`Saving ${item.title} as an MP3…`);
    try {
      const response = await fetch("/api/music/mp3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: item.page, upload: false }),
      });
      if (!response.ok) throw new Error(await messageOf(response, "That song could not be saved as an MP3."));
      setMp3Id(item.youtubeId);
      setNote("");
    } catch (caught) {
      setFailed(true);
      setNote(caught instanceof Error ? caught.message : "That song could not be saved as an MP3.");
    } finally {
      setBusy(false);
    }
  }

  async function addToPlaylist() {
    if (busy || queued === 0) return;
    if (queue.length > YOTO_TRACK_LIMIT) {
      setFailed(true);
      setNote(`A playlist holds ${YOTO_TRACK_LIMIT} tracks. ${queue.length} songs are picked. Nothing was sent.`);
      return;
    }
    setBusy(true);
    setFailed(false);
    const title = musicPlaylistTitle(playlistTitle, album?.title || "Pokémon music");
    try {
      const finished: SavedTrack[] = [];
      let remaining = YOTO_TRACK_LIMIT;
      const steps: Array<{ page?: string; url?: string; label: string }> = queue.map((item) =>
        item.kind === "page"
          ? { page: item.page, label: songsByPage.get(item.page)?.title || "Song" }
          : { url: item.url, label: item.playlist ? "YouTube playlist" : "YouTube video" },
      );
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (!step || remaining < 1) break;
        setNote(`Saving ${step.label} as an MP3…`);
        const response = await yotoFetch("/api/music/mp3", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: step.page,
            url: step.url,
            limit: step.url ? remaining : 1,
            upload: true,
          }),
        });
        if (!response.ok) throw new Error(await messageOf(response, "That audio could not be saved as an MP3."));
        const payload = (await response.json()) as { tracks?: SavedTrack[] };
        const tracks = payload.tracks ?? [];
        if (tracks.length > remaining) {
          throw new Error(`A playlist holds ${YOTO_TRACK_LIMIT} tracks. Nothing was sent.`);
        }
        for (const track of tracks) {
          if (!track.trackUrl?.startsWith("yoto:#")) throw new Error(`${track.title} is not a finished MP3.`);
          finished.push(track);
        }
        remaining -= tracks.length;
      }
      if (finished.length === 0) throw new Error("Add at least one song.");
      setNote("Sending the playlist…");
      const upload = uploadForPlaylist(musicPlaylistUpload(title, finished, voiceId), playlistTarget);
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
      const where = playlists.find((item) => item.cardId === playlistTarget)?.title;
      const done = playlistTarget ? `${where || "The playlist"} was updated.` : `${title} is in your Yoto library.`;
      setFailed(false);
      setNote(done);
      toast.success(done);
    } catch (caught) {
      setFailed(true);
      setNote(caught instanceof Error ? caught.message : "The playlist was not sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,26rem)] lg:items-start">
      <div className="order-2 grid min-w-0 gap-4 lg:order-1">
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
                const checked = queue.some((entry) => entry.kind === "page" && entry.page === item.page);
                return (
                  <div key={item.page} className="flex min-w-0 items-stretch gap-2">
                    <input
                      type="checkbox"
                      className="mt-3"
                      checked={checked}
                      disabled={!item.youtubeId || busy || (!checked && queued >= YOTO_TRACK_LIMIT)}
                      aria-label={`Add ${item.title} to the Yoto playlist`}
                      onChange={() => toggleSong(item.page)}
                    />
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
              {song.youtubeId ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-11 px-4"
                    disabled={busy}
                    onClick={() => void playMp3(song)}
                  >
                    {busy && note.startsWith("Saving") && note.includes(song.title) ? "Saving the MP3…" : "Play MP3"}
                  </Button>
                  {mp3Id === song.youtubeId ? (
                    <audio className="mt-3 w-full" controls autoPlay src={`/api/music/mp3/${song.youtubeId}`} />
                  ) : (
                    <p className="mt-2 text-sm leading-6">Play MP3 downloads the YouTube audio and keeps it as an MP3.</p>
                  )}
                  {playlist.playing ? null : (
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
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm leading-6">{playerNote}</p>
              )}
              <p className="mt-2 text-sm leading-6">
                <a className="font-bold underline decoration-poke-red decoration-2" href={song.url} target="_blank" rel="noreferrer">
                  Read this song on Bulbapedia
                </a>
              </p>
              <h3 className="mt-3 text-base font-bold text-ink">Lyrics</h3>
              <SongLyrics page={song.page} />
            </div>
          ) : null}
        </section>
      </div>
      {note ? (
        <p role="status" className={`text-sm leading-6 ${failed ? "text-poke-red" : ""}`}>
          {note}
        </p>
      ) : null}
      <section className="pk-card grid min-w-0 gap-3 p-4" aria-label="Yoto playlist">
        <h2 className="text-xl text-ink">Yoto playlist</h2>
        <p className="text-sm leading-6">
          Tick songs, or paste a YouTube video or playlist. Drag a row to set the order. Each file is saved as a plain MP3 before it is added.
        </p>
        <p className="text-sm font-bold">
          {queued === 1 ? "1 item on this playlist" : `${queued} items on this playlist`}
        </p>
        {queue.length > 0 ? (
          <ol className="grid max-h-80 gap-2 overflow-y-auto text-sm">
            {queue.map((item, itemIndex) => {
              const label = queueLabel(item, songsByPage);
              const dropping =
                queueDrag.overIndex === itemIndex && queueDrag.dragIndex !== null && queueDrag.dragIndex !== itemIndex;
              return (
                <li
                  key={item.kind === "page" ? item.page : item.url}
                  {...queueDrag.rowProps(itemIndex)}
                  className={`flex cursor-grab flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-ink px-2 py-2 select-none ${
                    queueDrag.dragIndex === itemIndex ? "opacity-60" : ""
                  } ${dropping ? "bg-poke-yellow" : ""}`}
                >
                  <span className="min-w-0 break-words">
                    {itemIndex + 1}. {label}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-xs underline disabled:opacity-40"
                      disabled={busy || itemIndex === 0}
                      aria-label={`Move ${label} up`}
                      onClick={() => setQueue((current) => movePlaylistItem(current, itemIndex, itemIndex - 1))}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="text-xs underline disabled:opacity-40"
                      disabled={busy || itemIndex === queue.length - 1}
                      aria-label={`Move ${label} down`}
                      onClick={() => setQueue((current) => movePlaylistItem(current, itemIndex, itemIndex + 1))}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="text-xs underline"
                      disabled={busy}
                      onClick={() =>
                        setQueue((current) => current.filter((_, index) => index !== itemIndex))
                      }
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
        <label className="grid gap-1 text-sm font-bold" htmlFor="music-link">
          YouTube link
          <input
            id="music-link"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Video or playlist link"
            className="pk-field font-normal"
            style={{ fontSize: 16 }}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="justify-self-start text-sm font-bold text-poke-red underline decoration-poke-yellow decoration-2 disabled:opacity-40"
          disabled={busy || !link.trim()}
          onClick={addLink}
        >
          Add link
        </button>
        <label className="grid gap-1 text-sm font-bold" htmlFor="music-playlist-title">
          Title
          <input
            id="music-playlist-title"
            value={playlistTitle}
            onChange={(event) => setPlaylistTitle(event.target.value)}
            placeholder={album?.title || "Pokémon music"}
            className="pk-field font-normal"
            style={{ fontSize: 16 }}
            disabled={busy}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold" htmlFor="music-playlist-target">
          Where it goes
          <select
            id="music-playlist-target"
            aria-label="Yoto playlist"
            className="pk-field font-normal"
            value={playlistTarget}
            disabled={busy}
            onChange={(event) => onPlaylistTarget?.(event.target.value)}
          >
            <option value="">Make a new playlist</option>
            {playlists.map((item) => (
              <option key={item.cardId} value={item.cardId}>
                Add to {item.title}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs leading-5 pk-quiet">
          {playlistTarget
            ? "Adds these MP3s at the end. Tracks already on that playlist stay."
            : "Makes a new playlist. Playlists you already have stay as they are."}
        </p>
        <Button type="button" className="h-11 w-full" disabled={busy || queued === 0} onClick={() => void addToPlaylist()}>
          {busy && note === "Sending the playlist…" ? "Sending…" : "Add to Yoto playlist"}
        </Button>
      </section>
      <MusicPlaylistSection playlist={playlist} />
      </div>
      <WebaooFiles playlists={playlists} libraryNote={libraryNote} onConnect={onConnect} />
    </div>
  );
}
