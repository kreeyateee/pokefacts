"use client";

import { useEffect, useState } from "react";

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
import { useStoredState } from "@/components/use-stored-state";
import {
  asPartner,
  FAVOURITES_KEY,
  MAX_FAVOURITES,
  readFavourites,
  withFavourite,
  writeFavourites,
} from "@/lib/favourites";

type Named = { id: number; name: string };

/** The child's favourites, kept in this browser. The first is their partner. */
export function useFavourites() {
  return useStoredState(FAVOURITES_KEY, readFavourites, writeFavourites);
}

/** Names for a list of dex numbers, in the same order. */
function useNames(ids: readonly number[]): Record<number, string> {
  const [names, setNames] = useState<Record<number, string>>({});
  const key = ids.join(",");
  useEffect(() => {
    const missing = key ? key.split(",").map(Number).filter((id) => !names[id]) : [];
    if (missing.length === 0) return;
    let cancelled = false;
    void fetch(`/api/catalogue?pick=${missing.join(",")}`)
      .then((response) => response.json() as Promise<{ items?: Named[] }>)
      .then((payload) => {
        if (cancelled) return;
        setNames((current) => ({
          ...current,
          ...Object.fromEntries((payload.items ?? []).map((item) => [item.id, item.name])),
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key, names]);
  return names;
}

function Picture({ id, size = 40 }: { id: number; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/pixels/${id}.png`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded bg-black p-0.5 [image-rendering:pixelated]"
      style={{ width: size, height: size }}
    />
  );
}

/** Asks for up to three favourites, with a search, and lets one be chosen as the partner. */
export function FavouritesDialog({
  open,
  onOpenChange,
  ids,
  onIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: readonly number[];
  onIds: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Named[]>([]);
  const names = useNames(ids);
  const full = ids.length >= MAX_FAVOURITES;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(`/api/catalogue?q=${encodeURIComponent(q)}`)
        .then((response) => response.json() as Promise<{ items?: Named[] }>)
        .then((payload) => {
          if (!cancelled) setResults((payload.items ?? []).filter((item) => item.id <= 1025).slice(0, 8));
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl leading-tight">Who&apos;s your child&apos;s favourite Pokémon?</DialogTitle>
          <DialogDescription>
            Pick up to {MAX_FAVOURITES}. The first is their partner: it comes along on every adventure. All of them turn
            up in Who&apos;s That and on a poster of their own.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {ids.length > 0 ? (
            <ol className="grid gap-2" aria-label="Favourites">
              {ids.map((id, index) => (
                <li key={id} className="flex items-center gap-3 rounded-xl border-2 border-ink/20 bg-white px-2 py-1.5">
                  <Picture id={id} />
                  <span className="min-w-0 grow font-bold">
                    {names[id] ?? `Number ${id}`}
                    {index === 0 ? <span className="ml-2 text-xs font-bold text-poke-red">Partner</span> : null}
                  </span>
                  {index > 0 ? (
                    <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={() => onIds(asPartner(ids, id))}>
                      Make partner
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-3 text-xs"
                    aria-label={`Remove ${names[id] ?? id}`}
                    onClick={() => onIds(ids.filter((item) => item !== id))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ol>
          ) : null}
          <label className="grid gap-1 text-sm font-bold" htmlFor="favourite-search">
            {full ? "That's three. Remove one to choose another." : "Search for a Pokémon"}
            <input
              id="favourite-search"
              className="pk-field font-normal"
              value={query}
              disabled={full}
              autoComplete="off"
              placeholder="Pikachu, Eevee, Charizard…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {!full && query.trim().length >= 2 ? (
            <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Search results">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl border-2 border-ink/20 bg-white px-2 py-1 text-left font-bold hover:bg-[#fff4c2] disabled:opacity-40"
                    disabled={ids.includes(item.id)}
                    onClick={() => {
                      onIds(withFavourite(ids, item.id));
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    <Picture id={item.id} size={32} />
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" className="h-11 px-5" onClick={() => onOpenChange(false)}>
            {ids.length > 0 ? "Done" : "Maybe later"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A small line showing the partner and the other favourites, with a button to change them. */
export function FavouritesBar({ ids, onEdit }: { ids: readonly number[]; onEdit: () => void }) {
  const names = useNames(ids);
  return (
    <section className="pk-panel mt-5 flex flex-wrap items-center gap-3" aria-label="Favourite Pokémon">
      {ids.length > 0 ? (
        <>
          <Picture id={ids[0] as number} size={44} />
          <p className="min-w-0 grow text-sm leading-6">
            <span className="font-bold">Partner: {names[ids[0] as number] ?? "…"}</span>
            {ids.length > 1 ? `, with ${ids.slice(1).map((id) => names[id] ?? "…").join(" and ")}` : ""}. Comes along on every
            adventure.
          </p>
        </>
      ) : (
        <p className="min-w-0 grow text-sm leading-6">
          Add your child&apos;s favourite Pokémon, and it comes along on every adventure as their partner.
        </p>
      )}
      <Button type="button" variant="outline" className="h-10 px-4" onClick={onEdit}>
        {ids.length > 0 ? "Change" : "Add favourites"}
      </Button>
    </section>
  );
}
