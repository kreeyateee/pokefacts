"use client";

import { useEffect, useRef, useState } from "react";

import { YOTO_ICONS } from "@/lib/yoto-icons";
import { asSendFailure, statusErrorText, validYotoCardId } from "@/lib/yoto-error";
import { clearSavedLoginForScopeGap, ensureSession, writeSession, yotoFetch } from "@/lib/yoto-session";
import {
  addLocalTracks,
  emptyWebaooDraft,
  iconOrMusic,
  LOCAL_FILE_ONLY,
  reorderLocalTracks,
  titleFromFileName,
  WEBAOO_TRACK_CAP,
  youtubeStayEmbedMessage,
  type WebaooDraft,
  type WebaooTrack,
} from "@/lib/webaoo";
import {
  deleteWebaooBlob,
  loadWebaooDraft,
  putWebaooBlob,
  readWebaooBlob,
  readWebaooMeta,
  saveWebaooDraft,
} from "@/lib/webaoo-store";

const ICONS = Object.entries(YOTO_ICONS);

function iconName(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function linkNoteFor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return youtubeStayEmbedMessage(trimmed) ?? LOCAL_FILE_ONLY;
}

export function WebaooFiles({
  playlists,
  libraryNote,
  onConnect,
}: {
  playlists: Array<{ cardId: string; title: string }>;
  libraryNote: string;
  onConnect?: () => void;
}) {
  const [draft, setDraft] = useState<WebaooDraft>(emptyWebaooDraft);
  const [clips, setClips] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState("");
  const clipsRef = useRef<Record<string, string>>({});
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const loaded = await loadWebaooDraft();
        if (cancel) {
          for (const url of Object.values(loaded.clips)) URL.revokeObjectURL(url);
          return;
        }
        setDraft(loaded.draft);
        setClips(loaded.clips);
      } catch {
        if (cancel) return;
        const meta = readWebaooMeta();
        if (meta) {
          setDraft(meta);
          setErrors(["These file names were saved, but the audio was not kept. Add the MP3 or M4A files again."]);
        }
      }
    })();
    return () => {
      cancel = true;
      for (const url of Object.values(clipsRef.current)) URL.revokeObjectURL(url);
    };
  }, []);

  async function persist(next: WebaooDraft) {
    draftRef.current = next;
    setDraft(next);
    try {
      await saveWebaooDraft(next);
    } catch {
      setErrors(["The browser could not store this playlist."]);
    }
  }

  async function onFiles(list: FileList | null, input: HTMLInputElement) {
    const files = list ? Array.from(list) : [];
    input.value = "";
    if (files.length === 0) return;
    const incoming = files.map((file) => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      mime: file.type,
      title: titleFromFileName(file.name),
      icon: YOTO_ICONS.music,
    }));
    const result = addLocalTracks(draftRef.current.tracks, incoming);
    const accepted = new Set(result.tracks.map((track) => track.id));
    const urls: Record<string, string> = {};
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const row = incoming[index];
        if (!file || !row || !accepted.has(row.id)) continue;
        await putWebaooBlob(row.id, file);
        urls[row.id] = URL.createObjectURL(file);
      }
    } catch {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
      setErrors(["The browser could not store these files."]);
      return;
    }
    if (Object.keys(urls).length > 0) setClips((current) => ({ ...current, ...urls }));
    setErrors(result.errors);
    setDone("");
    await persist({ ...draftRef.current, tracks: result.tracks });
  }

  async function move(index: number, to: number) {
    const tracks = reorderLocalTracks(draftRef.current.tracks, index, to).map((track, order) => ({ ...track, order }));
    await persist({ ...draftRef.current, tracks });
  }

  async function remove(id: string) {
    const url = clipsRef.current[id];
    if (url) URL.revokeObjectURL(url);
    setClips((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    await deleteWebaooBlob(id);
    const tracks = draftRef.current.tracks.filter((track) => track.id !== id).map((track, order) => ({ ...track, order }));
    await persist({ ...draftRef.current, tracks });
  }

  function updateTrack(id: string, patch: Partial<WebaooTrack>) {
    const tracks = draftRef.current.tracks.map((track) => (track.id === id ? { ...track, ...patch } : track));
    void persist({ ...draftRef.current, tracks });
  }

  async function send() {
    setDone("");
    if (draftRef.current.tracks.length === 0) {
      setErrors([LOCAL_FILE_ONLY]);
      return;
    }
    const cardId = draftRef.current.cardId.trim();
    if (cardId && !validYotoCardId(cardId)) {
      setErrors(["That Yoto playlist id does not look right."]);
      return;
    }
    setSending(true);
    setErrors([]);
    try {
      const session = await ensureSession();
      if (!session) {
        setErrors(["Reconnect Yoto. This login expired."]);
        onConnect?.();
        return;
      }
      const form = new FormData();
      form.set("title", draftRef.current.title.trim() || "My music");
      form.set("cardId", cardId);
      form.set(
        "tracks",
        JSON.stringify(
          draftRef.current.tracks.map((track) => ({
            id: track.id,
            title: track.title,
            icon: iconOrMusic(track.icon),
            fileName: track.fileName,
          })),
        ),
      );
      for (const track of draftRef.current.tracks) {
        const blocked = youtubeStayEmbedMessage(track.fileName);
        if (blocked) {
          setErrors([blocked]);
          return;
        }
        const blob = await readWebaooBlob(track.id);
        if (!blob) {
          setErrors([`${track.title} is missing its audio file. Add it again.`]);
          return;
        }
        form.append("audio", blob, `${track.id}__${track.fileName}`);
      }
      const response = await yotoFetch("/api/yoto/webaoo", { method: "POST", body: form });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = statusErrorText(response.status, payload, "Yoto did not accept this playlist.");
        const scope = clearSavedLoginForScopeGap(message);
        if (scope || response.status === 401) {
          if (!scope) writeSession(null);
          setErrors([scope ?? "Reconnect Yoto. This login expired."]);
          onConnect?.();
          return;
        }
        setErrors([message]);
        return;
      }
      const row = payload && typeof payload === "object" ? (payload as { cardId?: string }) : {};
      setDone(row.cardId ? `Sent to Yoto playlist ${row.cardId}.` : "Sent to Yoto.");
    } catch (error) {
      const failure = asSendFailure(error, "Yoto did not accept this playlist.");
      if (/connect yoto|reconnect yoto/i.test(failure.message)) {
        writeSession(null);
        setErrors(["Reconnect Yoto. This login expired."]);
        onConnect?.();
        return;
      }
      setErrors([failure.message]);
    } finally {
      setSending(false);
    }
  }

  const known = playlists.some((item) => item.cardId === draft.cardId);

  return (
    <section id="webaoo-files" className="pk-card order-1 min-w-0 px-4 py-4 lg:order-2" aria-labelledby="webaoo-heading">
      <h2 id="webaoo-heading" className="font-display text-2xl text-ink">
        My files
      </h2>
      <p className="mt-2 text-sm leading-6">
        Add MP3 or M4A files you already have. YouTube links stay as embeds on this page and are not uploaded.
      </p>
      <p className="mt-2 text-sm leading-6">
        Yoto card artwork is 638×1011. This page does not crop a cover. Use an image that size if you add art in the Yoto app.
      </p>
      <p className="mt-2 text-sm leading-6">
        Each track uses a 16×16 icon. Login includes user:icons:manage. If you connected before that permission was added, reconnect Yoto.
      </p>

      <label className="mt-4 grid min-w-0 gap-1 text-sm font-bold" htmlFor="webaoo-link">
        Paste a link
        <input
          id="webaoo-link"
          value={link}
          onChange={(event) => {
            const next = event.target.value;
            setLink(next);
            setLinkNote(linkNoteFor(next));
          }}
          placeholder="https://"
          autoComplete="off"
          className="pk-field"
          style={{ fontSize: 16 }}
        />
      </label>
      <button
        type="button"
        className="pk-choice mt-2 h-11 px-3"
        onClick={() => setLinkNote(linkNoteFor(link))}
      >
        Check link
      </button>
      {linkNote ? (
        <p className="pk-danger mt-2 text-sm leading-6" role="alert">
          {linkNote}
        </p>
      ) : null}

      <label className="mt-4 grid min-w-0 gap-1 text-sm font-bold" htmlFor="webaoo-files-input">
        Audio files
        <input
          id="webaoo-files-input"
          type="file"
          accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
          multiple
          className="pk-field"
          style={{ fontSize: 16, height: "auto", minHeight: 44, paddingTop: 8, paddingBottom: 8 }}
          onChange={(event) => void onFiles(event.target.files, event.target)}
        />
      </label>
      <p className="mt-2 text-sm leading-6">
        {draft.tracks.length} of {WEBAOO_TRACK_CAP} tracks. Order here is the order on the card.
      </p>

      {draft.tracks.length === 0 ? (
        <p className="mt-3 text-sm leading-6">No files yet. Add an MP3 or M4A you already have.</p>
      ) : (
        <ol className="mt-3 grid min-w-0 gap-3">
          {draft.tracks.map((track, index) => (
            <li key={track.id} className="min-w-0 rounded-2xl border-[3px] border-ink bg-white px-3 py-3">
              <label className="grid min-w-0 gap-1 text-sm font-bold" htmlFor={`webaoo-title-${track.id}`}>
                Title
                <input
                  id={`webaoo-title-${track.id}`}
                  value={track.title}
                  onChange={(event) => updateTrack(track.id, { title: event.target.value.slice(0, 80) })}
                  className="pk-field"
                  style={{ fontSize: 16 }}
                />
              </label>
              <p className="mt-2 break-words text-sm leading-6">{track.fileName}</p>
              {clips[track.id] ? (
                <audio className="mt-2 w-full" controls preload="none" src={clips[track.id]} />
              ) : (
                <p className="mt-2 text-sm leading-6">Add this file again. Its audio is not in this browser.</p>
              )}
              <label className="mt-2 grid min-w-0 gap-1 text-sm font-bold" htmlFor={`webaoo-icon-${track.id}`}>
                16×16 icon
                <select
                  id={`webaoo-icon-${track.id}`}
                  className="pk-field"
                  style={{ fontSize: 16 }}
                  value={iconOrMusic(track.icon)}
                  onChange={(event) => updateTrack(track.id, { icon: event.target.value })}
                >
                  {ICONS.map(([key, value]) => (
                    <option key={key} value={value}>
                      {iconName(key)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pk-choice h-11 px-3"
                  disabled={index === 0}
                  aria-label={`Move ${track.title} earlier`}
                  onClick={() => void move(index, index - 1)}
                >
                  Earlier
                </button>
                <button
                  type="button"
                  className="pk-choice h-11 px-3"
                  disabled={index === draft.tracks.length - 1}
                  aria-label={`Move ${track.title} later`}
                  onClick={() => void move(index, index + 1)}
                >
                  Later
                </button>
                <button type="button" className="pk-choice h-11 px-3" onClick={() => void remove(track.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <label className="mt-4 grid min-w-0 gap-1 text-sm font-bold" htmlFor="webaoo-playlist-title">
        Playlist title
        <input
          id="webaoo-playlist-title"
          value={draft.title}
          onChange={(event) => void persist({ ...draftRef.current, title: event.target.value.slice(0, 80) })}
          className="pk-field"
          style={{ fontSize: 16 }}
        />
      </label>
      <label className="mt-3 grid min-w-0 gap-1 text-sm font-bold" htmlFor="webaoo-playlist">
        Library playlist
        <select
          id="webaoo-playlist"
          className="pk-field"
          style={{ fontSize: 16 }}
          value={known ? draft.cardId : ""}
          onChange={(event) => void persist({ ...draftRef.current, cardId: event.target.value })}
        >
          <option value="">New playlist</option>
          {playlists.map((item) => (
            <option key={item.cardId} value={item.cardId}>
              Add to {item.title}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 grid min-w-0 gap-1 text-sm font-bold" htmlFor="webaoo-card-id">
        Playlist id
        <input
          id="webaoo-card-id"
          value={draft.cardId}
          onChange={(event) => void persist({ ...draftRef.current, cardId: event.target.value.trim().slice(0, 8) })}
          placeholder="Five characters, or blank"
          autoComplete="off"
          className="pk-field"
          style={{ fontSize: 16 }}
        />
      </label>
      <p className="mt-2 text-sm leading-6">
        {libraryNote
          ? libraryNote
          : playlists.length > 0
            ? "Pick a library playlist or type its id. A blank id makes a new playlist."
            : "Connect Yoto to list playlists you already have. You can still type an id."}
      </p>
      <button
        id="webaoo-send"
        type="button"
        className="mt-3 h-11 w-full rounded-full border-[3px] border-ink bg-poke-red px-4 font-bold text-white shadow-[3px_3px_0_var(--ink)] disabled:opacity-60"
        style={{ fontSize: 16 }}
        disabled={sending}
        onClick={() => void send()}
      >
        {sending ? "Sending to Yoto…" : "Send to Yoto"}
      </button>
      {errors.map((message) => (
        <p key={message} className="pk-danger mt-2 text-sm leading-6" role="alert">
          {message}
        </p>
      ))}
      {done ? <p className="mt-2 text-sm leading-6">{done}</p> : null}
    </section>
  );
}
