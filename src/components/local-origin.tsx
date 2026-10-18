"use client";

import { useEffect } from "react";

import { LOCAL_APP_ORIGIN, LOCAL_PORT } from "@/lib/local-origin";

/**
 * localhost and 127.0.0.1 are different sites to the browser.
 * Yoto is registered for 127.0.0.1, so send that host back to the same port.
 */
export function LocalOrigin() {
  useEffect(() => {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "::1") return;
    if (window.location.port !== String(LOCAL_PORT)) return;
    const next = new URL(window.location.href);
    const local = new URL(LOCAL_APP_ORIGIN);
    next.protocol = local.protocol;
    next.hostname = local.hostname;
    next.port = local.port;
    window.location.replace(next.toString());
  }, []);
  return null;
}
