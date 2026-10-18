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
import { beginYotoLogin, CLIENT_KEY, redirectUri } from "@/lib/yoto-session";

export function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [callback, setCallback] = useState("http://localhost:3847/callback");
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open && !wasOpen) {
    setWasOpen(true);
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(CLIENT_KEY) ?? "";
      setDraft(stored || process.env.NEXT_PUBLIC_YOTO_CLIENT_ID || "");
      setCallback(redirectUri());
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
            Champdex uses the public Yoto developer login. It never asks for a
            client secret. The spoken card lands in your own Make Your Own library.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3 text-sm leading-6 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1. Create a public client.</span>{" "}
            In the{" "}
            <a
              className="underline decoration-[#c6a15b] underline-offset-4"
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
            Login asks to create Make Your Own content, stay signed in, and read your name.
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
          <Button type="submit" className="h-10" disabled={pending}>
            {pending ? "Opening Yoto…" : "Continue to Yoto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
