"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <p className="text-xs font-medium tracking-[0.18em] text-[#c6a15b] uppercase">
        Champdex
      </p>
      <h1 className="font-display text-3xl">Signing in</h1>
      <p className="text-sm leading-6 text-[#cbbfa8]">{message}</p>
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
          <p className="text-sm text-[#cbbfa8]">Bringing you back from Yoto…</p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
