"use client";

import { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { artworkSrc } from "@/lib/artwork-path";
import {
  movePlaylistItem,
  orderPlaylist,
  reversePlaylist,
  shiftPlaylistItem,
  type PlaylistMon,
} from "@/lib/playlist-order";

function numberLabel(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

export function PlaylistWindow({
  open,
  onOpenChange,
  ids,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: readonly number[];
  onChange: (ids: number[]) => void;
}) {
  const [names, setNames] = useState<Record<number, string>>({});
  const [nameError, setNameError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const namesRef = useRef(names);
  const dragFrom = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number; index: number } | null>(null);
  namesRef.current = names;

  useEffect(() => {
    if (!open || ids.length === 0) return;
    const missing = ids.filter((id) => namesRef.current[id] === undefined);
    if (missing.length === 0) return;
    const controller = new AbortController();
    void fetch(`/api/catalogue?pick=${missing.join(",")}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { items?: Array<{ id: number; name: string }>; error?: string };
        if (!response.ok || !payload.items) throw new Error(payload.error || "Those names could not be loaded.");
        return payload.items;
      })
      .then((items) => {
        setNames((current) => {
          const next = { ...current };
          for (const item of items) next[item.id] = item.name;
          return next;
        });
        setNameError("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNameError(error instanceof Error ? error.message : "Those names could not be loaded.");
      });
    return () => controller.abort();
  }, [open, ids]);

  const mons: PlaylistMon[] = ids.map((id) => ({ id, name: names[id] ?? "" }));
  const namesReady = ids.every((id) => Boolean(names[id]));

  function orderBy(by: "number" | "name") {
    onChange(orderPlaylist(mons, by).map((item) => item.id));
  }

  function indexUnder(event: { clientX: number; clientY: number }): number | null {
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-playlist-index]");
    const raw = hit?.getAttribute("data-playlist-index");
    if (raw == null) return null;
    const index = Number(raw);
    return Number.isInteger(index) ? index : null;
  }

  function clearDrag() {
    pointerStart.current = null;
    dragFrom.current = null;
    setDragIndex(null);
    setOverIndex(null);
  }

  function onPointerDown(event: React.PointerEvent<HTMLLIElement>, index: number) {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, label")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = { x: event.clientX, y: event.clientY, index };
  }

  function onPointerMove(event: React.PointerEvent<HTMLLIElement>) {
    const origin = pointerStart.current;
    if (!origin) return;
    if (dragFrom.current === null) {
      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      if (distance < 6) return;
      dragFrom.current = origin.index;
      setDragIndex(origin.index);
    }
    setOverIndex(indexUnder(event));
  }

  function onPointerUp(event: React.PointerEvent<HTMLLIElement>) {
    const from = dragFrom.current;
    clearDrag();
    if (from === null) return;
    const to = indexUnder(event);
    if (to === null || to === from) return;
    onChange(movePlaylistItem([...ids], from, to));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(42rem,calc(100%-2rem))] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-2xl">Playlist</DialogTitle>
          <DialogDescription>
            Drag a card onto another place. Earlier and Later move one card. The buttons below order the whole list.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="pk-pill px-3 text-xs disabled:opacity-40"
            disabled={ids.length < 2}
            onClick={() => orderBy("number")}
          >
            Order by number
          </button>
          <button
            type="button"
            className="pk-pill px-3 text-xs disabled:opacity-40"
            disabled={ids.length < 2 || !namesReady}
            onClick={() => orderBy("name")}
          >
            Order by name
          </button>
          <button
            type="button"
            className="pk-pill px-3 text-xs disabled:opacity-40"
            disabled={ids.length < 2}
            onClick={() => onChange(reversePlaylist(ids))}
          >
            Reverse
          </button>
        </div>
        {nameError ? (
          <p className="text-sm pk-danger" role="alert">
            {nameError}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          {ids.length === 0 ? (
            <p className="pk-soft px-4 py-6 text-sm text-muted-foreground">
              Tick Pokémon in the catalogue, including their evolutions, and they appear here in that order.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {mons.map((mon, index) => {
                const name = mon.name || numberLabel(mon.id);
                const dropping = overIndex === index && dragIndex !== null && dragIndex !== index;
                return (
                  <li
                    key={mon.id}
                    data-playlist-index={index}
                    onPointerDown={(event) => onPointerDown(event, index)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={clearDrag}
                    className={`pk-soft cursor-grab touch-none px-3 py-2 select-none active:cursor-grabbing ${
                      dragIndex === index ? "opacity-60" : ""
                    } ${dropping ? "bg-poke-yellow" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs font-bold tabular-nums text-poke-red">{index + 1}</span>
                      <img
                        src={artworkSrc("species", mon.id)}
                        alt=""
                        width={48}
                        height={48}
                        draggable={false}
                        className="h-12 w-12 shrink-0 object-contain"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs tabular-nums opacity-70">{numberLabel(mon.id)}</span>
                        <span className="block truncate font-medium">{name}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold disabled:opacity-40"
                        disabled={index === 0}
                        aria-label={`Move ${name} earlier`}
                        onClick={() => onChange(shiftPlaylistItem([...ids], index, -1))}
                      >
                        Earlier
                      </button>
                      <button
                        type="button"
                        className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold disabled:opacity-40"
                        disabled={index === ids.length - 1}
                        aria-label={`Move ${name} later`}
                        onClick={() => onChange(shiftPlaylistItem([...ids], index, 1))}
                      >
                        Later
                      </button>
                      <button
                        type="button"
                        className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold"
                        aria-label={`Remove ${name}`}
                        onClick={() => onChange(ids.filter((id) => id !== mon.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
