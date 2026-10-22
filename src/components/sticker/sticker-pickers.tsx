"use client";

import { useState } from "react";

import type { StickerMon } from "@/lib/sticker-cover";
import { crispPicture, isShadowPicture } from "@/lib/sticker-paint";

/** A Pokémon picture: pixel art stays crisp and riddle shadows show solid black, as they print. */
export function StickerPicture({ src, size, className = "" }: { src: string; size: number; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`object-contain ${className}`}
      style={{
        width: size,
        height: size,
        imageRendering: crispPicture(src) ? "pixelated" : "auto",
        filter: isShadowPicture(src) ? "brightness(0)" : undefined,
      }}
    />
  );
}

function matches(mon: StickerMon, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || mon.name.toLowerCase().includes(needle);
}

function SearchField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Name or number"
          className="pk-field"
          autoComplete="off"
        />
        {value ? (
          <button type="button" className="pk-chip shrink-0" onClick={() => onChange("")}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Big buttons to choose the star Pokémon of a Pokédex or trading card front. */
export function HeroPicker({
  mons,
  hero,
  hidden,
  onPick,
}: {
  mons: readonly StickerMon[];
  hero: string;
  hidden: boolean;
  onPick: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = mons.filter((mon) => matches(mon, query));
  return (
    <div className="grid gap-2">
      <SearchField id="sticker-hero-search" label={hidden ? "Find a riddle" : "Find a Pokémon"} value={query} onChange={setQuery} />
      <div className="grid max-h-[26rem] grid-cols-3 content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        {shown.length === 0 ? (
          <p className="col-span-full py-3 text-sm leading-6 text-muted-foreground">Nothing matches that name.</p>
        ) : (
          shown.map((mon) => (
            <button
              key={mon.key}
              type="button"
              className="pk-choice pk-sticker-tile flex min-h-28 flex-col items-center gap-1 px-2 py-2 text-center"
              aria-pressed={mon.key === hero}
              onClick={() => onPick(mon.key)}
            >
              <StickerPicture src={hidden ? mon.src : mon.art} size={64} />
              <span className="line-clamp-2 w-full text-sm leading-4">{mon.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Tap Pokémon in or out of the group photo or pile. */
export function CrowdPicker({
  mons,
  chosen,
  hidden,
  pixels,
  onToggle,
  onEveryone,
  onNobody,
}: {
  mons: readonly StickerMon[];
  chosen: ReadonlySet<string>;
  hidden: boolean;
  pixels: boolean;
  onToggle: (key: string) => void;
  onEveryone: () => void;
  onNobody: () => void;
}) {
  const [query, setQuery] = useState("");
  const shown = mons.filter((mon) => matches(mon, query));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="pk-chip pk-chip-big" onClick={onEveryone}>
          Everyone
        </button>
        <button type="button" className="pk-chip pk-chip-big" onClick={onNobody}>
          Nobody
        </button>
        <span className="text-sm leading-6">
          {chosen.size} of {mons.length} in the picture
        </span>
      </div>
      <SearchField id="sticker-crowd-search" label={hidden ? "Find a riddle" : "Find a Pokémon"} value={query} onChange={setQuery} />
      <div className="grid max-h-[26rem] grid-cols-3 content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        {shown.length === 0 ? (
          <p className="col-span-full py-3 text-sm leading-6 text-muted-foreground">Nothing matches that name.</p>
        ) : (
          shown.map((mon) => (
            <button
              key={mon.key}
              type="button"
              className="pk-choice pk-sticker-tile flex min-h-28 flex-col items-center gap-1 px-2 py-2 text-center"
              aria-pressed={chosen.has(mon.key)}
              onClick={() => onToggle(mon.key)}
            >
              <StickerPicture src={hidden ? mon.src : pixels ? mon.pixel : mon.art} size={64} />
              <span className="line-clamp-2 w-full text-sm leading-4">{mon.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
