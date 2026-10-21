"use client";

import { PlaybackPanel } from "@/components/playback-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlaybackSettings } from "@/lib/playback-settings";

export function CardOptionsDialog({
  open,
  onOpenChange,
  confirmLabel,
  onConfirm,
  connected,
  onConnect,
  voiceId,
  onVoiceId,
  playback,
  onPlayback,
  targetPlaylist,
  onTargetPlaylist,
  library,
  newTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmLabel: string;
  onConfirm: () => void;
  connected: boolean;
  onConnect: () => void;
  voiceId: string;
  onVoiceId: (voiceId: string) => void;
  playback: PlaybackSettings;
  onPlayback: (settings: PlaybackSettings) => void;
  targetPlaylist: string;
  onTargetPlaylist: (cardId: string) => void;
  library: Array<{ cardId: string; title: string }>;
  newTitle: string;
}) {
  const destination = library.find((item) => item.cardId === targetPlaylist);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(40rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Before this card is made</DialogTitle>
          <DialogDescription>
            Hear the voice, pick where the playlist goes, then confirm. Nothing is recorded until then.
          </DialogDescription>
        </DialogHeader>
        <ol className="m-0 grid list-none gap-4 p-0">
          <li className="pk-step">
            <span className="pk-step-num" aria-hidden="true">
              1
            </span>
            <div className="min-w-0">
              <PlaybackPanel
                idPrefix="card-options"
                embedded
                voicesOnly
                settings={playback}
                onChange={onPlayback}
                voiceId={voiceId}
                onVoiceId={onVoiceId}
              />
            </div>
          </li>
          <li className="pk-step">
            <span className="pk-step-num" aria-hidden="true">
              2
            </span>
            <label className="grid min-w-0 gap-1 text-sm" htmlFor="card-options-playlist">
              Where it goes
              <select
                id="card-options-playlist"
                aria-label="Yoto playlist"
                className="pk-field"
                value={targetPlaylist}
                onChange={(event) => onTargetPlaylist(event.target.value)}
              >
                <option value="">Make a new playlist</option>
                {library.map((item) => (
                  <option key={item.cardId} value={item.cardId}>
                    Add to {item.title}
                  </option>
                ))}
              </select>
              <span className="text-xs leading-5 text-muted-foreground">
                {destination
                  ? `Adds these tracks at the end of ${destination.title}. Tracks already there stay.`
                  : `Makes a new playlist named ${newTitle}. Playlists you already have stay as they are.`}
              </span>
            </label>
          </li>
          <li className="pk-step">
            <span className="pk-step-num" aria-hidden="true">
              3
            </span>
            <details className="min-w-0">
              <summary className="cursor-pointer text-sm font-bold">Cry, loudness, and units</summary>
              <div className="mt-3">
                <PlaybackPanel
                  idPrefix="card-options-mix"
                  embedded
                  settings={playback}
                  onChange={onPlayback}
                />
              </div>
            </details>
          </li>
        </ol>
        <p className="text-xs leading-5 pk-quiet">
          {connected
            ? "Recording starts after you confirm, and it keeps going in the background."
            : "Hear Piper without a login. Sending the card still needs Connect Yoto."}
        </p>
        <DialogFooter className="border-ink bg-cream">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {connected ? (
            <Button type="button" className="h-11 px-4" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          ) : (
            <Button type="button" className="h-11 px-4" onClick={onConnect}>
              Connect Yoto
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
