"use client";

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
import { yotoPlaylistUrl } from "@/lib/yoto-playlist";

export type MyoCardView = {
  title: string;
  cardId?: string;
  sending?: boolean;
};

/** Wait for the previous dialog portal to finish closing before opening this one. */
export function openAfterDialog(run: () => void): number {
  return window.setTimeout(run, 80);
}

export function MyoCardButton({
  onClick,
  className = "h-11 px-4",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button type="button" variant="outline" className={className} onClick={onClick}>
      Make Your Own card
    </Button>
  );
}

export function MyoCardDialog({
  open,
  onOpenChange,
  title,
  cardId,
  sending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  cardId?: string;
  sending?: boolean;
}) {
  const playlistName = title?.trim() || "this playlist";
  const playlistHref = yotoPlaylistUrl(cardId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl leading-tight text-balance">
            Make Your Own card
          </DialogTitle>
          <DialogDescription>
            {sending
              ? "This list is going to Yoto now. Link it to a blank card while it records."
              : "A playlist in Make Your Own still needs a blank card in the player."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="grid list-decimal gap-2 pl-4 text-sm leading-6">
            <li>Open the Yoto app and go to Make Your Own.</li>
            <li>
              Find <span className="font-bold">{playlistName}</span>.
            </li>
            <li>Choose Link to a card.</li>
            <li>Hold a blank Make Your Own card to the player.</li>
            <li>The next playlist needs a different blank card.</li>
          </ol>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Paper stickers are optional after the plastic card is linked.
          </p>
        </DialogBody>
        <DialogFooter>
          {playlistHref ? (
            <a
              className="inline-flex h-11 items-center justify-center rounded-lg border-2 border-ink bg-white px-4 text-sm font-bold"
              href={playlistHref}
              target="_blank"
              rel="noreferrer"
            >
              Open in the Yoto app
            </a>
          ) : null}
          <Button type="button" className="h-11 px-4" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
