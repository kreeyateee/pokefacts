"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import {
  COFFEE_NUDGE_COPY,
  COFFEE_NUDGE_KEY,
  COFFEE_NUDGE_MS,
  readAskedAt,
  shouldNudge,
} from "@/lib/coffee-nudge";
import { DONATE_LABEL } from "@/lib/send-cheer";
import { DONATE_URL } from "@/lib/site";

const TICK_S = 5;

function askedAt(): number {
  try {
    return readAskedAt(window.localStorage.getItem(COFFEE_NUDGE_KEY));
  } catch {
    // Storage blocked, as in some private windows: never ask, rather than ask on every visit.
    return Date.now();
  }
}

/** Remembers that this browser was just asked for a coffee, here or in the "ready to link" toast. */
export function markCoffeeAsked() {
  try {
    window.localStorage.setItem(COFFEE_NUDGE_KEY, String(Date.now()));
  } catch {
    // Nothing to remember it in. The next visit may ask again, after its own few minutes.
  }
}

/** Asks browsers, kindly and at most once a day, after a few minutes on the page. Renders nothing. */
export function CoffeeNudge() {
  useEffect(() => {
    if (!shouldNudge(Number.POSITIVE_INFINITY, askedAt(), Date.now())) return;
    let seen = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      seen += TICK_S;
      if (!shouldNudge(seen, askedAt(), Date.now())) return;
      window.clearInterval(timer);
      markCoffeeAsked();
      toast(COFFEE_NUDGE_COPY, {
        duration: COFFEE_NUDGE_MS,
        action: {
          label: DONATE_LABEL,
          onClick: () => window.open(DONATE_URL, "_blank", "noopener,noreferrer"),
        },
      });
    }, TICK_S * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
