"use client";

import { toast } from "sonner";

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

export type SendJobView = {
  status: string;
  detail: string;
  done?: number;
  total?: number;
};

function openDonate() {
  const { href } = sendCheerAction();
  window.open(href, "_blank", "noopener,noreferrer");
}

export function toastSendStarted(title: string) {
  toast(sendStartedCopy(title), { id: SEND_TOAST_ID, duration: 8_000 });
}

export function toastSendReady(title: string, updated = false) {
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
}: {
  job: SendJobView | null;
  onDismiss?: () => void;
}) {
  if (!job) return null;
  const failed = job.status === "failed";
  const done = job.status === "completed";
  const kicker = failed ? "Could not finish" : done ? "Ready to play" : "Recording in the background";
  return (
    <div className="pk-send-dock">
      <div className="pk-send-dock-card">
        <p className="pk-send-kicker">{kicker}</p>
        <StatusBar label={job.detail} done={job.done} total={job.total} failed={failed} />
        {done || failed ? (
          <div className="pk-send-actions">
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
            {onDismiss ? (
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
