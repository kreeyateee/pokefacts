"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { useRowDrag } from "@/components/row-drag";
import { PLAYER_STATE } from "@/lib/music-player";
import {
  MUSIC_PLAYLIST_LIMIT,
  MUSIC_PLAYLIST_STORAGE_KEY,
  addToMusicPlaylist,
  hasMusicPlaylistSong,
  moveInMusicPlaylist,
  musicPlaylistNeighbour,
  musicPlaylistRefusalText,
  musicRepeatLabel,
  nextMusicRepeat,
  placeInMusicPlaylist,
  readStoredMusicPlaylist,
  removeFromMusicPlaylist,
  selectInMusicPlaylist,
  serializeMusicPlaylist,
  shuffleMusicPlaylist,
  youtubeNocookieEmbedSrc,
  type MusicPlaylistDraft,
  type MusicPlaylistSong,
  type MusicRepeat,
  type StoredMusicPlaylist,
} from "@/lib/music-playlist";
import { saveMusicPlaylistToYoto } from "@/lib/music-yoto-save";
import { ensureSession, yotoFetch } from "@/lib/yoto-session";
import { musicYotoSavePlan } from "@/lib/youtube-playlist";

/** How long "Added …" and refusals stay beside My playlist. */
const NOTICE_MS = 5_000;

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

function readMusicPlaylist(): StoredMusicPlaylist {
  return readStoredMusicPlaylist(musicPlaylistSnapshot() || null);
}

function writeMusicPlaylist(next: StoredMusicPlaylist) {
  const raw = serializeMusicPlaylist(next);
  if (raw === musicPlaylistSnapshot()) return;
  try {
    localStorage.setItem(MUSIC_PLAYLIST_STORAGE_KEY, raw);
  } catch {
    // Storage is full or blocked. The page keeps working from the last saved copy.
  }
  window.dispatchEvent(new Event(PLAYLIST_CHANGE));
}

/**
 * Every change reads the saved playlist first, not the last render, so two quick
 * Adds, or an Add while a song ends, never overwrite each other.
 */
function updateMusicPlaylist(change: (current: StoredMusicPlaylist) => StoredMusicPlaylist) {
  writeMusicPlaylist(change(readMusicPlaylist()));
}

export type MusicPlaylistStep = { index: number; same: boolean };

export function useMusicPlaylist() {
  const raw = useSyncExternalStore(subscribeMusicPlaylist, musicPlaylistSnapshot, () => "");
  const stored = useMemo(() => readStoredMusicPlaylist(raw || null), [raw]);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const say = useCallback((text: string) => {
    setNotice((current) => ({ text, key: (current?.key ?? 0) + 1 }));
  }, []);

  const has = useCallback((page: string) => hasMusicPlaylistSong(readMusicPlaylist().songs, page), []);

  const addSong = useCallback(
    (draft: MusicPlaylistDraft): boolean => {
      const result = addToMusicPlaylist(readMusicPlaylist(), draft);
      if (result.refusal) {
        say(musicPlaylistRefusalText(result.refusal));
        return false;
      }
      writeMusicPlaylist(result.playlist);
      say(`Added ${draft.title} to My playlist.`);
      return true;
    },
    [say],
  );

  const removeSong = useCallback((at: number) => {
    updateMusicPlaylist((current) => removeFromMusicPlaylist(current, at));
  }, []);

  const moveSong = useCallback((at: number, delta: -1 | 1) => {
    updateMusicPlaylist((current) => moveInMusicPlaylist(current, at, delta));
  }, []);

  const placeSong = useCallback((from: number, to: number) => {
    updateMusicPlaylist((current) => placeInMusicPlaylist(current, from, to));
  }, []);

  const select = useCallback((at: number) => {
    updateMusicPlaylist((current) => selectInMusicPlaylist(current, at));
  }, []);

  /** Move to the next or previous song. Null when the list stops there. */
  const step = useCallback((direction: -1 | 1, reason: "skip" | "ended"): MusicPlaylistStep | null => {
    const current = readMusicPlaylist();
    const index = musicPlaylistNeighbour(current, direction, reason);
    if (index === null) return null;
    writeMusicPlaylist(selectInMusicPlaylist(current, index));
    return { index, same: index === current.index };
  }, []);

  const cycleRepeat = useCallback(() => {
    updateMusicPlaylist((current) => ({ ...current, repeat: nextMusicRepeat(current.repeat) }));
  }, []);

  const toggleShuffle = useCallback(() => {
    updateMusicPlaylist((current) => shuffleMusicPlaylist(current, !current.shuffle));
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    updateMusicPlaylist((current) => ({ ...current, paused }));
  }, []);

  return {
    songs: stored.songs,
    index: stored.index,
    repeat: stored.repeat,
    shuffle: stored.shuffle,
    canPrevious: musicPlaylistNeighbour(stored, -1, "skip") !== null,
    canNext: musicPlaylistNeighbour(stored, 1, "skip") !== null,
    notice: notice?.text ?? "",
    noticeKey: notice?.key ?? 0,
    say,
    has,
    addSong,
    removeSong,
    moveSong,
    placeSong,
    select,
    step,
    cycleRepeat,
    toggleShuffle,
    setPaused,
  };
}

export type MusicPlaylist = ReturnType<typeof useMusicPlaylist>;

type YoutubePlayer = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
};

type YoutubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YoutubePlayer;
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
      if (!api) youtubeApiPromise = null;
      resolve(api);
    };
    window.setTimeout(() => finish(youtubeWindow.YT?.Player ? youtubeWindow.YT : null), 8000);
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

/** Play, pause, and stop the embed once the YouTube iframe API has attached. */
export type MusicEmbedControls = {
  play: () => void;
  pause: () => void;
  stop: () => void;
};

/**
 * One YouTube embed. The iframe is made here, outside React, so the iframe API
 * can attach to it and `destroy()` can remove it without React noticing.
 * State changes come only from the iframe API. Without it the video still plays,
 * and Next and Previous still work, but the end of a song is not noticed.
 * Give it a new `key` to load another song or start this one again.
 */
export function MusicPlayerEmbed({
  videoId,
  title,
  autoplay,
  controlsRef,
  onPlayingChange,
  onEnded,
}: {
  videoId: string;
  title: string;
  autoplay: boolean;
  controlsRef: RefObject<MusicEmbedControls | null>;
  onPlayingChange: (playing: boolean) => void;
  onEnded: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const startSettings = useEffectEvent(() => ({ autoplay, title }));
  const reportPlaying = useEffectEvent((playing: boolean) => onPlayingChange(playing));
  const reportEnded = useEffectEvent(() => onEnded());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start = startSettings();
    const iframe = document.createElement("iframe");
    iframe.className = "pk-music-frame";
    iframe.title = start.title;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.src = youtubeNocookieEmbedSrc(videoId, window.location.origin, start.autoplay);
    host.replaceChildren(iframe);

    let disposed = false;
    let player: YoutubePlayer | null = null;
    let sawPlayback = false;

    function onStateChange(state: number) {
      if (state === PLAYER_STATE.PLAYING || state === PLAYER_STATE.BUFFERING) {
        sawPlayback = true;
        reportPlaying(true);
      } else if (state === PLAYER_STATE.PAUSED) {
        reportPlaying(false);
      } else if (state === PLAYER_STATE.ENDED && sawPlayback) {
        sawPlayback = false;
        reportEnded();
      }
    }

    void loadYouTubeIframeApi().then((api) => {
      if (disposed || !api) return;
      try {
        const attached = new api.Player(iframe, {
          events: {
            onReady: () => {
              if (disposed) return;
              controlsRef.current = {
                play: () => attached.playVideo(),
                pause: () => attached.pauseVideo(),
                stop: () => attached.stopVideo(),
              };
            },
            onStateChange: (event) => {
              if (!disposed) onStateChange(event.data);
            },
          },
        });
        player = attached;
      } catch {
        // The video still plays in the iframe. Play, Pause, and Stop reload it instead.
      }
    });

    return () => {
      disposed = true;
      controlsRef.current = null;
      try {
        player?.destroy();
      } catch {
        // The iframe API already tore this player down.
      }
      host.replaceChildren();
    };
  }, [videoId, controlsRef]);

  return <div ref={hostRef} className="mt-3 min-w-0" />;
}

/** Play controls that sit right under the video. */
export function MusicTransport({
  playing,
  canPlay,
  canPrevious,
  canNext,
  repeat,
  shuffle,
  onPlay,
  onPause,
  onStop,
  onPrevious,
  onNext,
  onRepeat,
  onShuffle,
}: {
  playing: boolean;
  canPlay: boolean;
  canPrevious: boolean;
  canNext: boolean;
  repeat: MusicRepeat;
  shuffle: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRepeat: () => void;
  onShuffle: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Player controls">
      <button type="button" className="pk-pill min-h-11" onClick={onPrevious} disabled={!canPrevious}>
        Previous
      </button>
      {playing ? (
        <button type="button" className="pk-pill min-h-11" onClick={onPause}>
          Pause
        </button>
      ) : (
        <button type="button" className="pk-pill min-h-11" onClick={onPlay} disabled={!canPlay}>
          Play
        </button>
      )}
      <button type="button" className="pk-pill min-h-11" onClick={onStop} disabled={!canPlay}>
        Stop
      </button>
      <button type="button" className="pk-pill min-h-11" onClick={onNext} disabled={!canNext}>
        Next
      </button>
      <button
        type="button"
        className="pk-pill min-h-11"
        onClick={onRepeat}
        aria-pressed={repeat !== "off"}
        title="Repeat off, the whole playlist, or this song"
      >
        {musicRepeatLabel(repeat)}
      </button>
      <button type="button" className="pk-pill min-h-11" onClick={onShuffle} aria-pressed={shuffle}>
        {shuffle ? "Shuffle: on" : "Shuffle: off"}
      </button>
    </div>
  );
}

/** True only on a home computer opened at 127.0.0.1 or localhost. The server decides. */
function useSaveToYotoAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/music/mp3", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ available?: unknown }>) : null))
      .then((payload) => setAvailable(payload?.available === true))
      .catch(() => {
        // Leave Save to Yoto hidden.
      });
    return () => controller.abort();
  }, []);
  return available;
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "working"; text: string; done: number; total: number }
  | { kind: "done" | "failed"; text: string };

/** Convert My playlist to MP3s and send it to Yoto as a new playlist. */
function MusicSaveToYoto({ songs }: { songs: MusicPlaylistSong[] }) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const working = status.kind === "working";

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function save() {
    const session = await ensureSession();
    const plan = musicYotoSavePlan({ connected: Boolean(session), count: songs.length, title });
    if (!plan.ok) {
      setStatus({
        kind: "failed",
        text: plan.connect ? `${plan.message} Use Connect Yoto at the top of the page.` : plan.message,
      });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus({ kind: "working", text: "Starting…", done: 0, total: songs.length });
    try {
      const saved = await saveMusicPlaylistToYoto({
        title: plan.title,
        songs: songs.map(({ page, title: songTitle, youtubeId }) => ({ page, title: songTitle, youtubeId })),
        fetcher: yotoFetch,
        signal: controller.signal,
        onStep: (step) => setStatus({ kind: "working", ...step }),
      });
      setStatus({
        kind: "done",
        text: `Saved ${saved.title} to your Yoto library. In the Yoto app, link it to a Make Your Own card.`,
      });
    } catch (error) {
      setStatus({
        kind: "failed",
        text: controller.signal.aborted
          ? "Saving stopped. No playlist was added to your Yoto library."
          : error instanceof Error
            ? error.message
            : "My playlist could not be saved to Yoto.",
      });
    } finally {
      controllerRef.current = null;
    }
  }

  return (
    <div className="pk-card grid min-w-0 gap-2 p-4">
      <h3 className="text-base font-bold text-ink">Save to Yoto</h3>
      <p className="text-sm leading-6">
        Saves each song as an MP3 on this computer, then adds My playlist to your Yoto library as a new playlist.
      </p>
      <label className="grid min-w-0 gap-1 text-sm font-bold" htmlFor="music-yoto-title">
        Playlist name
        <input
          id="music-yoto-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Pokémon music"
          maxLength={80}
          className="pk-field"
          style={{ fontSize: 16 }}
          disabled={working}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pk-pill min-h-11"
          onClick={() => void save()}
          disabled={working || songs.length === 0}
        >
          {working ? "Saving…" : "Save to Yoto"}
        </button>
        {working ? (
          <button type="button" className="pk-pill min-h-11" onClick={() => controllerRef.current?.abort()}>
            Cancel
          </button>
        ) : null}
      </div>
      {status.kind === "working" ? (
        <progress className="w-full" value={status.done} max={status.total} aria-label="Saving to Yoto" />
      ) : null}
      {status.kind !== "idle" ? (
        <p role="status" className={`text-sm leading-6 break-words ${status.kind === "failed" ? "text-poke-red" : ""}`}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}

export function MusicPlaylistSection({
  playlist,
  playingIndex,
  onPlayAt,
  onRemove,
}: {
  playlist: MusicPlaylist;
  /** The row that is playing now, or null. */
  playingIndex: number | null;
  onPlayAt: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const count = playlist.songs.length;
  const countLabel = `${count} of ${MUSIC_PLAYLIST_LIMIT} songs`;
  const drag = useRowDrag("data-music-index", playlist.placeSong);
  const saveAvailable = useSaveToYotoAvailable();

  return (
    <section id="my-playlist" className="grid min-w-0 gap-3" aria-label="My playlist">
      <div className="min-w-0">
        <h2 className="text-xl text-ink">My playlist</h2>
        <p className="text-sm leading-6">{countLabel}</p>
        <p className="text-sm leading-6">Add songs, then play them here as YouTube videos.</p>
      </div>
      <p role="status" aria-live="polite" className="min-h-6 text-sm leading-6 font-bold text-ink">
        <span key={playlist.noticeKey}>{playlist.notice}</span>
      </p>
      {count === 0 ? (
        <p className="pk-card min-w-0 px-4 py-4 text-sm leading-6">
          Your playlist is empty. Add a song and it plays in the player above.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="pk-pill min-h-11"
              onClick={() => onPlayAt(playlist.index)}
              disabled={playingIndex !== null}
            >
              {playingIndex !== null ? "Playing" : "Play My playlist"}
            </button>
          </div>
          <p className="text-sm leading-6">Tap a song to play it. Drag a song onto another place, or use Up and Down.</p>
          <ol className="grid min-w-0 gap-2">
            {playlist.songs.map((song, songIndex) => {
              const currentRow = songIndex === playlist.index;
              const dropping =
                drag.overIndex === songIndex && drag.dragIndex !== null && drag.dragIndex !== songIndex;
              return (
                <li
                  key={song.id}
                  {...drag.rowProps(songIndex)}
                  onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest("button, a")) return;
                    onPlayAt(songIndex);
                  }}
                  className={`pk-card pk-playlist-row min-w-0 cursor-grab touch-none p-3 select-none active:cursor-grabbing ${
                    drag.dragIndex === songIndex ? "opacity-60" : ""
                  } ${dropping ? "bg-poke-yellow" : ""}`}
                  aria-current={currentRow ? "true" : undefined}
                >
                  <p className="break-words font-bold text-ink">
                    {playingIndex === songIndex ? "Playing: " : ""}
                    {song.title}
                  </p>
                  {song.album ? <p className="text-sm leading-6 break-words">{song.album}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="pk-pill min-h-11"
                      aria-label={`Play ${song.title}`}
                      onClick={() => onPlayAt(songIndex)}
                    >
                      Play
                    </button>
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
                      disabled={songIndex === count - 1}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="pk-pill min-h-11"
                      aria-label={`Remove ${song.title}`}
                      onClick={() => onRemove(songIndex)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {saveAvailable ? <MusicSaveToYoto songs={playlist.songs} /> : null}
    </section>
  );
}
