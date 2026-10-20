"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  MUSIC_PLAYLIST_STORAGE_KEY,
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
} from "@/lib/music-playlist";

const ENDED = 0;

type YoutubePlayer = {
  destroy: () => void;
};

type YoutubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      events?: {
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YoutubePlayer;
  PlayerState?: { ENDED: number };
};

type YoutubeWindow = Window & {
  YT?: YoutubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubeApiPromise: Promise<YoutubeApi | null> | null = null;

function loadYouTubeIframeApi(): Promise<YoutubeApi | null> {
  const youtubeWindow = window as YoutubeWindow;
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const previous = youtubeWindow.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = (api: YoutubeApi | null) => {
      if (settled) return;
      settled = true;
      resolve(api);
    };
    window.setTimeout(() => finish(youtubeWindow.YT ?? null), 8000);
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish(youtubeWindow.YT ?? null);
    };
    if (!document.querySelector("script[data-youtube-iframe-api='true']")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.youtubeIframeApi = "true";
      script.onerror = () => finish(null);
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

function playerStateFromMessage(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { event?: unknown; info?: unknown };
  if (row.event !== "onStateChange") return null;
  if (typeof row.info === "number") return row.info;
  if (row.info && typeof row.info === "object" && "playerState" in row.info) {
    const state = (row.info as { playerState?: unknown }).playerState;
    return typeof state === "number" ? state : null;
  }
  return null;
}

const PLAYLIST_CHANGE = "pokefacts-music-playlist-change";

function subscribeMusicPlaylist(listener: () => void) {
  window.addEventListener(PLAYLIST_CHANGE, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(PLAYLIST_CHANGE, listener);
    window.removeEventListener("storage", listener);
  };
}

function musicPlaylistSnapshot(): string {
  try {
    return localStorage.getItem(MUSIC_PLAYLIST_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function publishMusicPlaylist(songs: MusicPlaylistSong[], index: number) {
  localStorage.setItem(MUSIC_PLAYLIST_STORAGE_KEY, serializeMusicPlaylist({ songs, index }));
  window.dispatchEvent(new Event(PLAYLIST_CHANGE));
}

export function useMusicPlaylist() {
  const raw = useSyncExternalStore(subscribeMusicPlaylist, musicPlaylistSnapshot, () => "");
  const stored = readStoredMusicPlaylist(raw || null);
  const [playing, setPlaying] = useState(false);
  const [playGeneration, setPlayGeneration] = useState(0);
  const [notice, setNotice] = useState("");

  const addSong = useCallback(
    (draft: MusicPlaylistDraft) => {
      const result = addMusicPlaylistSong(stored.songs, draft);
      if (!result.added) {
        setNotice(musicPlaylistRefusalText(result.refusal || "novideo"));
        return;
      }
      publishMusicPlaylist(result.songs, stored.index);
      setNotice(`Added ${draft.title} to My playlist.`);
    },
    [stored.songs, stored.index],
  );

  const removeSong = useCallback(
    (at: number) => {
      const songs = removeMusicPlaylistSong(stored.songs, at);
      const index = musicPlaylistIndexAfterRemove(stored.index, at, stored.songs.length);
      publishMusicPlaylist(songs, index);
      if (songs.length === 0) setPlaying(false);
    },
    [stored.songs, stored.index],
  );

  const moveSong = useCallback(
    (at: number, delta: -1 | 1) => {
      publishMusicPlaylist(
        moveMusicPlaylistSong(stored.songs, at, delta),
        musicPlaylistIndexAfterMove(stored.index, at, delta, stored.songs.length),
      );
    },
    [stored.songs, stored.index],
  );

  const play = useCallback(() => {
    if (stored.songs.length === 0) return;
    setPlaying(true);
    setPlayGeneration((current) => current + 1);
  }, [stored.songs.length]);

  const previous = useCallback(() => {
    publishMusicPlaylist(stored.songs, stepMusicPlaylist(stored.index, stored.songs.length, -1));
  }, [stored.songs, stored.index]);

  const next = useCallback(() => {
    publishMusicPlaylist(stored.songs, stepMusicPlaylist(stored.index, stored.songs.length, 1));
  }, [stored.songs, stored.index]);

  const onEnded = useCallback(() => {
    const current = readStoredMusicPlaylist(musicPlaylistSnapshot() || null);
    if (current.index >= current.songs.length - 1) return;
    publishMusicPlaylist(current.songs, current.index + 1);
    setPlaying(true);
  }, []);

  return {
    songs: stored.songs,
    index: stored.index,
    playing,
    playGeneration,
    notice,
    addSong,
    removeSong,
    moveSong,
    play,
    previous,
    next,
    onEnded,
  };
}

export function MusicPlaylistEmbed({
  videoId,
  title,
  autoplay,
  onEnded,
}: {
  videoId: string;
  title: string;
  autoplay: boolean;
  onEnded: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.src = youtubeNocookieEmbedSrc(videoId, window.location.origin, autoplay);
    let dead = false;
    let ended = false;
    let sawPlayback = false;

    function noteState(state: number) {
      if (state === 1 || state === 3) sawPlayback = true;
      if (state === ENDED && sawPlayback) finish();
    }

    function finish() {
      if (ended) return;
      ended = true;
      onEnded();
    }

    function listen() {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      const hello = { event: "listening", id: frame.id, channel: "widget" };
      frame.contentWindow.postMessage(JSON.stringify(hello), "*");
      frame.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: "addEventListener",
          args: ["onStateChange"],
          id: frame.id,
          channel: "widget",
        }),
        "*",
      );
    }

    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.origin !== "https://www.youtube-nocookie.com" && event.origin !== "https://www.youtube.com") return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data) as unknown;
        } catch {
          return;
        }
      }
      const state = playerStateFromMessage(data);
      if (state !== null) noteState(state);
    }

    iframe.addEventListener("load", listen);
    window.addEventListener("message", onMessage);
    listen();

    void loadYouTubeIframeApi().then((api) => {
      if (dead || !api || iframeRef.current !== iframe) return;
      try {
        new api.Player(iframe, {
          events: {
            onStateChange: (event) => {
              noteState(event.data);
            },
          },
        });
      } catch {
        // Next and Previous still move the embed when the iframe API cannot attach.
      }
    });

    return () => {
      dead = true;
      iframe.removeEventListener("load", listen);
      window.removeEventListener("message", onMessage);
    };
  }, [videoId, autoplay, onEnded]);

  return (
    <iframe
      ref={iframeRef}
      id="music-playlist-frame"
      className="pk-music-frame mt-3"
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

export function MusicPlaylistSection({
  playlist,
}: {
  playlist: ReturnType<typeof useMusicPlaylist>;
}) {
  const current = playlist.songs[playlist.index];
  const countLabel =
    playlist.songs.length === 1 ? "1 of 100 songs" : `${playlist.songs.length} of 100 songs`;

  return (
    <section id="my-playlist" className="grid min-w-0 gap-3" aria-label="My playlist">
      <div className="min-w-0">
        <h2 className="text-xl text-ink">My playlist</h2>
        <p className="text-sm leading-6">{countLabel}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pk-pill min-h-11"
          onClick={playlist.play}
          disabled={playlist.songs.length === 0}
          aria-pressed={playlist.playing}
        >
          Play
        </button>
        <button
          type="button"
          className="pk-pill min-h-11"
          onClick={playlist.previous}
          disabled={playlist.songs.length === 0 || playlist.index <= 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="pk-pill min-h-11"
          onClick={playlist.next}
          disabled={playlist.songs.length === 0 || playlist.index >= playlist.songs.length - 1}
        >
          Next
        </button>
      </div>
      {playlist.songs.length === 0 ? (
        <p className="pk-card min-w-0 px-4 py-4 text-sm leading-6">
          Your playlist is empty. Add a song that has a YouTube video.
        </p>
      ) : current ? (
        <div className="pk-card min-w-0 p-3">
          <p className="text-lg font-bold break-words text-ink">{current.title}</p>
          {current.album ? <p className="text-sm leading-6 break-words">{current.album}</p> : null}
          <MusicPlaylistEmbed
            key={`${current.id}-${playlist.playGeneration}`}
            videoId={current.youtubeId}
            title={current.title}
            autoplay={playlist.playing}
            onEnded={playlist.onEnded}
          />
          <p className="mt-3 text-sm leading-6">
            If the player stays blank,{" "}
            <a
              className="font-bold underline decoration-poke-red decoration-2"
              href={`https://www.youtube.com/watch?v=${current.youtubeId}`}
              target="_blank"
              rel="noreferrer"
            >
              open this video on YouTube
            </a>
            .
          </p>
        </div>
      ) : null}
      {playlist.songs.length > 0 ? (
        <ol className="grid min-w-0 gap-2">
          {playlist.songs.map((song, songIndex) => {
            const currentRow = songIndex === playlist.index;
            return (
              <li
                key={song.id}
                className="pk-card pk-playlist-row min-w-0 p-3"
                aria-current={currentRow ? "true" : undefined}
              >
                <p className="break-words font-bold text-ink">
                  {currentRow && playlist.playing ? "Playing: " : ""}
                  {song.title}
                </p>
                {song.album ? <p className="text-sm leading-6 break-words">{song.album}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="pk-pill min-h-11"
                    aria-label={`Move ${song.title} up`}
                    onClick={() => playlist.moveSong(songIndex, -1)}
                    disabled={songIndex === 0}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="pk-pill min-h-11"
                    aria-label={`Move ${song.title} down`}
                    onClick={() => playlist.moveSong(songIndex, 1)}
                    disabled={songIndex === playlist.songs.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="pk-pill min-h-11"
                    aria-label={`Remove ${song.title}`}
                    onClick={() => playlist.removeSong(songIndex)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
