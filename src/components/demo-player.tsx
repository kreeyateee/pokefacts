"use client";

import { useState } from "react";

import { demoTrackSrc, FEEDBACK_NOTE_LIMIT, type Demo } from "@/lib/demos";

type Vote = "up" | "down" | null;

/** A thumbs up or down and a note, sent on its own for one track or for the whole demo. */
function FeedbackBox({ slug, track, label }: { slug: string; track: string; label: string }) {
  const [vote, setVote] = useState<Vote>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const response = await fetch("/api/demo-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, track, vote, note }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(response.ok ? "Thanks, that's saved." : body.error || "That did not send. Try again.");
    } catch {
      setStatus("That did not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  const thumb = (value: "up" | "down", text: string) => (
    <button
      type="button"
      className={`pk-pill min-h-11 ${vote === value ? "" : "opacity-60"}`}
      aria-pressed={vote === value}
      onClick={() => {
        setVote(vote === value ? null : value);
        setStatus("");
      }}
    >
      {text}
    </button>
  );

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {thumb("up", "👍 Good")}
        {thumb("down", "👎 Not yet")}
      </div>
      <label className="grid gap-1 text-sm leading-6">
        <span>{label}</span>
        <textarea
          className="min-h-16 w-full rounded-md border border-current/20 bg-transparent p-2 text-base"
          maxLength={FEEDBACK_NOTE_LIMIT}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setStatus("");
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="pk-pill min-h-11" onClick={send} disabled={sending || (!vote && !note.trim())}>
          {sending ? "Sending…" : "Send feedback"}
        </button>
        {status ? (
          <span className="text-sm leading-6" role="status">
            {status}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DemoPlayer({ demo }: { demo: Demo }) {
  const sets = [...new Set(demo.tracks.map((track) => track.set))];
  return (
    <section className="grid min-w-0 gap-5" aria-labelledby="demo-heading">
      <div className="min-w-0">
        <h1 id="demo-heading" className="font-display text-3xl leading-tight">
          {demo.title}
        </h1>
        <p className="mt-2 text-base leading-7">{demo.blurb}</p>
        <p className="mt-2 text-base leading-7">
          Give any track a thumbs up or down, and say what you would change. Nothing asks for your name.
        </p>
      </div>
      {sets.map((set) => (
        <div key={set} className="grid min-w-0 gap-3">
          <h2 className="font-display text-2xl leading-tight">{set}</h2>
          <ol className="grid min-w-0 gap-3">
            {demo.tracks
              .filter((track) => track.set === set)
              .map((track) => (
                <li key={track.id} className="pk-card grid min-w-0 gap-3 p-4">
                  <p className="font-bold">{track.title}</p>
                  <audio controls preload="none" src={demoTrackSrc(demo, track)} className="w-full" />
                  <FeedbackBox slug={demo.slug} track={track.id} label={`Notes on ${track.title} (optional)`} />
                </li>
              ))}
          </ol>
        </div>
      ))}
      <div className="pk-card grid min-w-0 gap-3 p-4">
        <h2 className="font-display text-2xl leading-tight">The whole demo</h2>
        <FeedbackBox slug={demo.slug} track="" label="Anything else? The voice, the pace, the sounds, the jokes." />
      </div>
    </section>
  );
}
