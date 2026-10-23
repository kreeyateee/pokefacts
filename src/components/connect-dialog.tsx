"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScopeList } from "@/components/setup-guide";
import { LOCAL_APP_ORIGIN } from "@/lib/local-origin";
import {
  beginYotoLogin,
  callbackForOrigin,
  CLIENT_KEY,
  redirectUri,
  YOTO_REDIRECT_URI,
} from "@/lib/yoto-session";

export function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [callback, setCallback] = useState(YOTO_REDIRECT_URI);
  const [canConnect, setCanConnect] = useState(false);
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open && !wasOpen) {
    setWasOpen(true);
    if (typeof window !== "undefined") {
      setDraft(localStorage.getItem(CLIENT_KEY) ?? "");
      setCallback(redirectUri());
      const origin = window.location.origin;
      setCanConnect(origin === LOCAL_APP_ORIGIN || callbackForOrigin(origin) !== YOTO_REDIRECT_URI);
    }
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const clientId = draft ?? "";

  async function connect() {
    const id = clientId.trim();
    if (!id) {
      toast.error("Paste the long ID from Yoto’s developer page.");
      return;
    }
    setPending(true);
    try {
      await beginYotoLogin(id);
    } catch (error) {
      setPending(false);
      toast.error(error instanceof Error ? error.message : "Could not start Yoto login.");
    }
  }

  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(callback);
      toast.success("Return address copied. Paste it into the Yoto app settings.");
    } catch {
      toast.error("Could not copy. Select the address and copy it by hand.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl leading-tight text-balance">
            Sign in with your Yoto account
          </DialogTitle>
          <DialogDescription>
            Yoto does not let this website use your password. Once, you make a free public
            app on Yoto’s site, paste its long ID here, then sign in as usual.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <ol className="grid gap-3 text-sm leading-6">
            <li>
              <span className="font-bold">1. Make a public app.</span> Open{" "}
              <a
                className="font-bold text-poke-red underline decoration-poke-yellow decoration-2 underline-offset-4"
                href="https://dashboard.yoto.dev/"
                target="_blank"
                rel="noreferrer"
              >
                dashboard.yoto.dev
              </a>
              , sign in, and create a public app. Under Scopes, or Yoto turns the login away:
              <ScopeList />
              Copy the long Client ID.
            </li>
            <li>
              <span className="font-bold">2. Allow this return address.</span> Paste it into
              the app’s callback list.
              <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                <Input readOnly value={callback} aria-label="Return address for Yoto" className="min-w-0 flex-1" />
                <Button type="button" variant="outline" onClick={copyCallback}>
                  Copy
                </Button>
              </div>
            </li>
            <li>
              <span className="font-bold">3. Paste the ID below</span>, then continue. Yoto
              will ask you to allow playlists in your library.
            </li>
          </ol>
          <details className="text-sm leading-6">
            <summary className="cursor-pointer font-bold">What Pokefacts can do</summary>
            <p className="mt-2 text-muted-foreground">
              It can create and view Make Your Own playlists, upload a tiny icon, see your
              library, stay signed in, and read your name. It never asks for your password.
            </p>
          </details>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <label className="grid gap-1.5 text-sm" htmlFor="yoto-client-id">
              <span className="font-medium">The long ID from Yoto</span>
              <Input
                id="yoto-client-id"
                autoComplete="off"
                spellCheck={false}
                placeholder="From dashboard.yoto.dev"
                value={clientId}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            {canConnect ? null : (
              <p className="text-sm leading-6">
                Open {LOCAL_APP_ORIGIN} in this browser, then connect. Yoto returns to{" "}
                {YOTO_REDIRECT_URI}.
              </p>
            )}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            className="h-11 w-full sm:w-auto"
            disabled={pending || !canConnect}
            onClick={() => void connect()}
          >
            {pending ? "Opening Yoto…" : "Continue to Yoto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
