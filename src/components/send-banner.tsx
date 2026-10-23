"use client";

import { useState } from "react";
import { toast } from "sonner";

import { markCoffeeAsked } from "@/components/coffee-nudge";
import { StatusBar } from "@/components/status-bar";
import {
  DONATE_LABEL,
  SEND_TOAST_ID,
  SEND_TOAST_MS,
  sendAllReadyCopy,
  sendCheerAction,
  sendReadyCopy,
  sendStartedCopy,
} from "@/lib/send-cheer";
import { isHidden, pillState } from "@/lib/send-pill";
import { yotoPlaylistUrl } from "@/lib/yoto-playlist";

export type SendJobView = {
  status: string;
  detail: string;
  done?: number;
  total?: number;
  cardId?: string;
};

function openDonate() {
  const { href } = sendCheerAction();
  window.open(href, "_blank", "noopener,noreferrer");
}

export function toastSendStarted(title: string) {
  toast(sendStartedCopy(title), { id: SEND_TOAST_ID, duration: 8_000 });
}

export function toastSendReady(title: string, updated = false) {
  markCoffeeAsked();
  toast.success(sendReadyCopy(title, updated), {
    id: SEND_TOAST_ID,
    duration: SEND_TOAST_MS,
    action: {
      label: DONATE_LABEL,
      onClick: openDonate,
    },
  });
}

export function toastSendAllReady(count: number) {
  markCoffeeAsked();
  toast.success(sendAllReadyCopy(count), {
    id: SEND_TOAST_ID,
    duration: SEND_TOAST_MS,
    action: {
      label: DONATE_LABEL,
      onClick: openDonate,
    },
  });
}

export function SendBanner({
  job,
  onDismiss,
  onPrintStickers,
  onShowMyoCard,
  onCancel,
  onRetry,
}: {
  job: SendJobView | null;
  onDismiss?: () => void;
  onPrintStickers?: () => void;
  onShowMyoCard?: () => void;
  /** Stop a send that is still recording. */
  onCancel?: () => void;
  /** Pick a failed send up from its last finished track. */
  onRetry?: () => void;
}) {
  // The status the panel was hidden at. A new status (finished, failed) shows it again.
  const [hiddenAt, setHiddenAt] = useState<string | null>(null);
  if (!job) {
    if (hiddenAt !== null) setHiddenAt(null);
    return null;
  }
  if (isHidden(hiddenAt, job.status)) {
    return <SendPill job={job} onShow={() => setHiddenAt(null)} />;
  }
  const failed = job.status === "failed";
  const done = job.status === "completed";
  const playlistHref = done ? yotoPlaylistUrl(job.cardId) : undefined;
  const kicker = failed
    ? "Could not finish"
    : done
      ? "Almost done — link a blank card"
      : "Recording in the background";
  return (
    <div className="pk-send-dock">
      <div className="pk-send-dock-card">
        <div className="pk-send-head">
          <p className="pk-send-kicker">{kicker}</p>
          <button
            type="button"
            className="pk-send-hide"
            aria-expanded="true"
            onClick={() => setHiddenAt(job.status)}
          >
            Hide
            <span aria-hidden="true">⌄</span>
          </button>
        </div>
        <StatusBar label={job.detail} done={job.done} total={job.total} failed={failed} />
        {done ? (
          <p className="mt-2 text-xs leading-5">
            Open it in the Yoto app, choose Link to a card, then hold a blank Make Your Own card
            to the player. Paper stickers are optional after that.
          </p>
        ) : null}
        {onShowMyoCard || done || failed ? (
          <div className="pk-send-actions">
            {onShowMyoCard ? (
              <button type="button" className="pk-banner-btn" onClick={onShowMyoCard}>
                Make Your Own card
              </button>
            ) : null}
            {playlistHref ? (
              <a className="pk-banner-btn" href={playlistHref} target="_blank" rel="noreferrer">
                Open in the Yoto app
              </a>
            ) : null}
            {done && onPrintStickers ? (
              <button type="button" className="pk-banner-btn" onClick={onPrintStickers}>
                Print stickers
              </button>
            ) : null}
            {done ? (
              <a
                className="pk-banner-btn"
                href={sendCheerAction().href}
                target="_blank"
                rel="noreferrer"
              >
                {DONATE_LABEL}
              </a>
            ) : null}
            {failed && onRetry ? (
              <button type="button" className="pk-banner-btn" onClick={onRetry}>
                Retry
              </button>
            ) : null}
            {!done && !failed && onCancel ? (
              <button type="button" className="pk-send-dismiss" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
            {(done || failed) && onDismiss ? (
              <button type="button" className="pk-send-dismiss" onClick={onDismiss}>
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const RING_R = 22;
const RING_LENGTH = 2 * Math.PI * RING_R;

/** The hidden panel: a small round button with the progress as a ring. Tap it to open the panel again. */
function SendPill({ job, onShow }: { job: SendJobView; onShow: () => void }) {
  const state = pillState(job);
  const arc =
    state.kind === "percent"
      ? (state.percent / 100) * RING_LENGTH
      : state.kind === "working"
        ? RING_LENGTH * 0.28
        : RING_LENGTH;
  const label =
    state.kind === "done"
      ? "Show the finished playlist"
      : state.kind === "failed"
        ? "Show what went wrong"
        : "Show send progress";
  const text =
    state.kind === "percent"
      ? `${state.percent}%`
      : state.kind === "done"
        ? "✓"
        : state.kind === "failed"
          ? "!"
          : "…";
  return (
    <>
      <button
        type="button"
        className={`pk-send-pill pk-send-pill-${state.kind}`}
        aria-expanded="false"
        aria-label={`${label}. ${job.detail}`}
        onClick={onShow}
      >
        <svg className="pk-send-ring" viewBox="0 0 56 56" aria-hidden="true">
          <circle className="pk-send-ring-track" cx="28" cy="28" r={RING_R} />
          <circle
            className="pk-send-ring-arc"
            cx="28"
            cy="28"
            r={RING_R}
            strokeDasharray={`${arc} ${RING_LENGTH}`}
          />
        </svg>
        <span className="pk-send-pill-text" aria-hidden="true">
          {text}
        </span>
      </button>
      <span className="sr-only" role="status">
        {job.detail}
      </span>
    </>
  );
}
