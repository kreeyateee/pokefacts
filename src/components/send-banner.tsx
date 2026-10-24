"use client";

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
  queue = [],
  queuePaused = false,
  onRemoveQueued,
  onSendNext,
}: {
  job: SendJobView | null;
  onDismiss?: () => void;
  onPrintStickers?: () => void;
  onShowMyoCard?: () => void;
  /** Stop a send that is still recording. */
  onCancel?: () => void;
  /** Pick a failed send up from its last finished track. */
  onRetry?: () => void;
  /** Sends waiting their turn, in order. */
  queue?: ReadonlyArray<{ id: number; title: string }>;
  /** The line stopped after a send failed or was cancelled, until the parent starts the next one. */
  queuePaused?: boolean;
  onRemoveQueued?: (id: number) => void;
  onSendNext?: () => void;
}) {
  if (!job && queue.length === 0) return null;
  const failed = job?.status === "failed";
  const done = job?.status === "completed";
  const playlistHref = done ? yotoPlaylistUrl(job?.cardId) : undefined;
  const kicker = failed
    ? "Could not finish"
    : done
      ? "Almost done — link a blank card"
      : "Recording in the background";
  return (
    <div className="pk-send-dock">
      <div className="pk-send-dock-card">
        {job ? (
          <>
            <p className="pk-send-kicker">{kicker}</p>
            <StatusBar label={job.detail} done={job.done} total={job.total} failed={failed} />
          </>
        ) : null}
        {done ? (
          <p className="mt-2 text-xs leading-5">
            Open it in the Yoto app, choose Link to a card, then hold a blank Make Your Own card
            to the player. Paper stickers are optional after that.
          </p>
        ) : null}
        {queue.length > 0 ? (
          <div className="mt-2">
            <p className="pk-send-kicker">{queuePaused ? "Waiting for you" : "Up next"}</p>
            <ol className="mt-1 grid gap-1 text-xs leading-5">
              {queue.map((item, index) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {index + 1}. {item.title}
                  </span>
                  {onRemoveQueued ? (
                    <button
                      type="button"
                      className="pk-send-dismiss shrink-0"
                      aria-label={`Take ${item.title} out of the queue`}
                      onClick={() => onRemoveQueued(item.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
            {queuePaused && onSendNext ? (
              <div className="pk-send-actions">
                <p className="text-xs leading-5">The queue stopped after the last send. Carry on when you&apos;re ready.</p>
                <button type="button" className="pk-banner-btn" onClick={onSendNext}>
                  Send next
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {job && (onShowMyoCard || done || failed) ? (
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
