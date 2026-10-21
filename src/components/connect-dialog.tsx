"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
      toast.error("Paste the client ID from the Yoto developer dashboard.");
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
      toast.success("Redirect URL copied. Paste it into the Yoto app settings.");
    } catch {
      toast.error("Could not copy. Select the address and copy it by hand.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a Yoto account</DialogTitle>
          <DialogDescription>
            Pokefacts uses the public Yoto developer login. It never asks for a
            client secret. The spoken card lands in your own Make Your Own library.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3 text-sm leading-6 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1. Create a public client.</span>{" "}
            In the{" "}
            <a
              className="font-bold text-poke-red underline decoration-poke-yellow decoration-2 underline-offset-4"
              href="https://dashboard.yoto.dev/"
              target="_blank"
              rel="noreferrer"
            >
              Yoto developer dashboard
            </a>
            , make a public app and copy the client ID.
          </li>
          <li>
            <span className="font-medium text-foreground">2. Allow this redirect.</span>{" "}
            Add the address below to the app&apos;s callback URLs.
            <div className="mt-2 flex gap-2">
              <Input readOnly value={callback} aria-label="Redirect URL" />
              <Button type="button" variant="outline" onClick={copyCallback}>
                Copy
              </Button>
            </div>
          </li>
          <li>
            <span className="font-medium text-foreground">3. Grant the field guide.</span>{" "}
            Login asks for user:content:manage, user:content:view, user:icons:manage, family:library:view, offline_access, and profile.
            That is permission to create and view Make Your Own content, upload a 16×16 icon, view your library, stay signed in, and read your name.
            If you already connected, reconnect. A refresh keeps the old login and will not add user:icons:manage.
          </li>
        </ol>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <label className="grid gap-1.5 text-sm" htmlFor="yoto-client-id">
            <span className="font-medium">Client ID</span>
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
            <p className="text-sm leading-6 text-foreground">
              Open {LOCAL_APP_ORIGIN} in this browser, then connect. Yoto returns to {YOTO_REDIRECT_URI}.
            </p>
          )}
          <Button type="submit" className="h-10" disabled={pending || !canConnect}>
            {pending ? "Opening Yoto…" : "Continue to Yoto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
