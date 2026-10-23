"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { APP_BUILD } from "@/lib/site";
import { isNewerBuild } from "@/lib/update-check";

/** How often an open page asks whether the site was updated. Also asked when the tab comes back. */
const CHECK_EVERY_MS = 5 * 60_000;

/**
 * Tells someone with the page already open that Pokefacts was updated, with a Refresh button.
 * A send in progress picks up again after the refresh, so the toast says so.
 */
export function UpdateNotice() {
  useEffect(() => {
    let told = false;
    let busy = false;

    async function check() {
      if (told || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { build } = (await response.json()) as { build?: unknown };
        if (!isNewerBuild(APP_BUILD, build)) return;
        told = true;
        toast("Pokefacts has been updated", {
          id: "pokefacts-update",
          description: "Refresh to get the newest version. A card that is sending carries on after.",
          duration: Infinity,
          action: { label: "Refresh", onClick: () => window.location.reload() },
        });
      } catch {
        // Offline or the site is restarting. The next check tries again.
      } finally {
        busy = false;
      }
    }

    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
