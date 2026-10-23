"use client";

import { PlaybackPanel } from "@/components/playback-panel";
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
import type { PlaybackSettings } from "@/lib/playback-settings";
import { nextFreeTitle, playlistNamed, type NameClash } from "@/lib/playlist-names";

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
  nameClash,
  onNameClash,
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
  /** When the new list's name is already in the library: a numbered name, or in place of the old one. */
  nameClash: NameClash;
  onNameClash: (choice: NameClash) => void;
  library: Array<{ cardId: string; title: string }>;
  newTitle: string;
}) {
  const destination = library.find((item) => item.cardId === targetPlaylist);
  const clash = destination ? undefined : playlistNamed(library, newTitle);
  const numbered = clash ? nextFreeTitle(newTitle, library.map((item) => item.title)) : newTitle;
  const replacing = Boolean(clash) && nameClash === "replace";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl leading-tight text-balance">Send to Yoto</DialogTitle>
          <DialogDescription>
            Hear the voice, pick where this list goes, then confirm. Nothing is recorded until then.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
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
                Where it goes in your Yoto app
                <select
                  id="card-options-playlist"
                  aria-label="Yoto playlist"
                  className="pk-field"
                  value={targetPlaylist}
                  onChange={(event) => onTargetPlaylist(event.target.value)}
                >
                  <option value="">Make a new Yoto card list</option>
                  {library.map((item) => (
                    <option key={item.cardId} value={item.cardId}>
                      Add to {item.title}
                    </option>
                  ))}
                </select>
                <span className="text-xs leading-5 text-muted-foreground">
                  {destination
                    ? `Adds these entries at the end of ${destination.title}. What is already there stays.`
                    : replacing
                      ? `Replaces every track on ${clash?.title}.`
                      : `Makes a new list named ${numbered}. Lists you already have stay as they are.`}
                </span>
              </label>
              {clash ? (
                <fieldset className="mt-3 grid gap-2 rounded-xl border-2 border-ink/30 p-3 text-sm">
                  <legend className="px-1 font-bold">You already have a list called {clash.title}</legend>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="card-options-clash"
                      className="mt-1"
                      checked={nameClash === "number"}
                      onChange={() => onNameClash("number")}
                    />
                    <span>
                      Make a new list called <span className="font-bold">{numbered}</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="card-options-clash"
                      className="mt-1"
                      checked={nameClash === "replace"}
                      onChange={() => onNameClash("replace")}
                    />
                    <span>
                      Replace the tracks on <span className="font-bold">{clash.title}</span> with these
                    </span>
                  </label>
                  {replacing ? (
                    <p className="text-xs leading-5 pk-danger">
                      The old tracks are removed. A card linked to {clash.title} keeps working and plays the new ones.
                      You will be asked to confirm.
                    </p>
                  ) : null}
                </fieldset>
              ) : null}
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
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {connected ? (
            <Button type="button" className="h-11 px-4" onClick={onConfirm}>
              {replacing ? `Replace ${clash?.title}` : confirmLabel}
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
