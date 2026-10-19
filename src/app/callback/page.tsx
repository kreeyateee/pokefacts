"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DONATE_URL } from "@/lib/site";
import { exchangeCode } from "@/lib/yoto-session";

function CallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const denied = params.get("error_description") || params.get("error");
  const code = params.get("code");
  const message =
    exchangeError ??
    denied ??
    (code ? "Bringing you back from Yoto…" : "Yoto did not return a login code.");

  useEffect(() => {
    if (!code || denied) return;
    let cancelled = false;
    exchangeCode(code)
      .then(() => {
        if (!cancelled) router.replace("/");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setExchangeError(
          reason instanceof Error ? reason.message : "Yoto login failed.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [code, denied, router]);

  return (
    <main className="pk-page mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <div className="pk-banner">
        <a className="pk-wordmark" href={DONATE_URL} target="_blank" rel="noreferrer">
          <span className="pk-ball" aria-hidden="true" />
          <span>
            <span className="pk-wordmark-name">Pokefacts</span>
            <span className="pk-wordmark-coffee">Buy me a coffee</span>
          </span>
        </a>
      </div>
      <h1 className="text-3xl font-bold text-ink">Signing in</h1>
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="pk-page mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
          <p className="text-sm text-muted-foreground">Bringing you back from Yoto…</p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
