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
  voiceId: string;
  onVoiceId: (voiceId: string) => void;
  playback: PlaybackSettings;
  onPlayback: (settings: PlaybackSettings) => void;
  targetPlaylist: string;
  onTargetPlaylist: (cardId: string) => void;
  library: Array<{ cardId: string; title: string }>;
  newTitle: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(36rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Before this card is made</DialogTitle>
          <DialogDescription>
            Pick the voice, hear a sample, and choose where the playlist goes. Recording starts after you confirm.
          </DialogDescription>
        </DialogHeader>
        <PlaybackPanel
          idPrefix="card-options"
          embedded
          settings={playback}
          onChange={onPlayback}
          voiceId={voiceId}
          onVoiceId={onVoiceId}
        />
        <label className="grid gap-1 text-sm" htmlFor="card-options-playlist">
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
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          {targetPlaylist
            ? "Adds these tracks at the end. Tracks already on that playlist stay."
            : `Makes a new playlist named ${newTitle}. Playlists you already have stay as they are.`}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="h-11 px-4" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
