"use client";

import { useEffect, useId, useRef, useState } from "react";

import { PokemonSignboard } from "@/components/pokemon-sign";
import { APP_NAME } from "@/lib/site";
import type { YotoSession } from "@/lib/yoto-session";

export function AppHeader({
  title,
  blurb,
  helpOpen,
  session,
  onHome,
  onHelp,
  onConnect,
  onDisconnect,
}: {
  title: string;
  blurb: string;
  helpOpen: boolean;
  session: YotoSession | null;
  onHome: () => void;
  onHelp: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!accountOpen) return;
    function onPointer(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  return (
    <header className="mx-auto w-full min-w-0 max-w-5xl px-4 pt-8 pb-2 sm:px-6">
      <PokemonSignboard />
      <div className="pk-banner">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <button type="button" className="pk-wordmark" onClick={onHome}>
            <span className="pk-ball" aria-hidden="true" />
            <span>
              <span className="pk-wordmark-name">{APP_NAME}</span>
              <span className="pk-wordmark-tag">Pokémon cards for Yoto</span>
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <button
              type="button"
              className="pk-banner-btn"
              aria-pressed={helpOpen}
              onClick={onHelp}
            >
              Help
            </button>
            {session ? (
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  className="pk-banner-btn"
                  aria-expanded={accountOpen}
                  aria-controls={menuId}
                  aria-haspopup="menu"
                  onClick={() => setAccountOpen((open) => !open)}
                >
                  {session.name ? `Yoto · ${session.name}` : "Yoto connected"}
                </button>
                {accountOpen ? (
                  <div id={menuId} role="menu" className="pk-account-menu">
                    <p className="px-2 py-1 text-xs leading-5 text-muted-foreground">
                      Signed in. Cards already in your library stay there if you disconnect.
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      className="pk-choice mt-1 w-full px-3 py-2 text-sm"
                      onClick={() => {
                        setAccountOpen(false);
                        onDisconnect();
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button type="button" className="pk-banner-btn" onClick={onConnect}>
                Connect Yoto
              </button>
            )}
          </div>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:mt-4 sm:text-4xl">{title}</h1>
        <p className="mt-1 max-w-xl text-sm leading-6 text-white/90">{blurb}</p>
      </div>
    </header>
  );
}
