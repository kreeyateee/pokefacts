"use client";

import { useEffect, useMemo, useState } from "react";

import { useFavourites } from "@/components/favourites";
import { useStoredState } from "@/components/use-stored-state";
import { CATALOGUE_PICKS_KEY, LAST_SPECIES_ID, readCataloguePicks, serializeCataloguePicks } from "@/lib/catalogue-picks";
import type { KidCard } from "@/lib/kid-cards";
import { posterCollection, REGION_POSTERS, STARTER_POSTERS, type PosterCollection } from "@/lib/poster-collections";
import { artworkSrc } from "@/lib/page-artwork";
import { hidesNames, monsFor } from "@/lib/sticker-cover";

export const MINE = "mine";
export const FAVOURITES = "favourites";
export const PLAYLIST = "playlist";

/**
 * Who goes on a poster or colouring sheet, its title, and whether they are shown as silhouettes.
 * `forms` lines up with `dexIds`: a form's own picture (a Gigantamax, a Mega, an Alolan form) where the
 * playlist has one, so it is drawn as that form and not as its plain species.
 */
export type Crowd = { title: string; dexIds: readonly number[]; hidden: boolean; forms?: readonly (string | undefined)[] };

type Choice = { id: string; label: string; count?: number };

/** Your Make your own picks, as national dex numbers. Regional forms stand in as their species. */
async function pickedSpecies(ids: readonly number[]): Promise<number[]> {
  const forms = ids.filter((id) => id > LAST_SPECIES_ID);
  if (forms.length === 0) return [...ids];
  const response = await fetch(`/api/catalogue?pick=${forms.join(",")}`);
  const payload = (await response.json().catch(() => null)) as { items?: Array<{ id: number; speciesId?: number }> } | null;
  const species = new Map((payload?.items ?? []).map((item) => [item.id, item.speciesId ?? 0]));
  return ids.flatMap((id) => {
    const dexId = id > LAST_SPECIES_ID ? (species.get(id) ?? 0) : id;
    return dexId > 0 && dexId <= LAST_SPECIES_ID ? [dexId] : [];
  });
}

export function ChoiceRow({
  label,
  choices,
  chosen,
  onChoose,
}: {
  label: string;
  choices: ReadonlyArray<Choice>;
  chosen: string;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="pk-kicker">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={chosen === choice.id}
            className="pk-chip"
            onClick={() => onChoose(choice.id)}
          >
            {choice.label}
            {choice.count ? <span className="ml-1 opacity-70">{choice.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Who goes on the page: a region, the starters, or your own (favourites, Make your own picks, the
 * playlist on screen, and any `extra` choices the maker adds). The choice is remembered under `storageKey`.
 */
export function useCrowd(
  playlist: KidCard,
  storageKey: string,
  fallback: string,
  extra: { choices: readonly Choice[]; crowd: (id: string) => Crowd | null } = { choices: [], crowd: () => null },
) {
  const [picks] = useStoredState(CATALOGUE_PICKS_KEY, readCataloguePicks, serializeCataloguePicks);
  const [sourceId, setSourceId] = useStoredState(
    storageKey,
    (raw) => raw || fallback,
    (id: string) => id,
  );
  const [favourites] = useFavourites();
  const [mine, setMine] = useState<number[] | null>(null);

  const pickIds = picks.ids.join(",");
  useEffect(() => {
    if (sourceId !== MINE || !pickIds) return;
    let cancelled = false;
    void pickedSpecies(pickIds.split(",").map(Number)).then((ids) => {
      if (!cancelled) setMine(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId, pickIds]);

  const extraCrowd = extra.crowd(sourceId);
  const crowd: Crowd | null = useMemo(() => {
    if (extraCrowd) return extraCrowd;
    if (sourceId === PLAYLIST) {
      const mons = monsFor(playlist).filter((mon) => mon.dexId);
      const dexIds = mons.map((mon) => mon.dexId as number);
      const forms = mons.map((mon) => (mon.art && mon.art !== artworkSrc(mon.dexId as number) ? mon.art : undefined));
      return { title: playlist.title, dexIds, hidden: hidesNames(playlist), forms };
    }
    if (sourceId === FAVOURITES) {
      if (favourites.length === 0) return null;
      return { title: "My Favourite Pokémon", dexIds: favourites, hidden: false };
    }
    if (sourceId === MINE) {
      if (picks.ids.length === 0) return null;
      return { title: picks.title.trim() || "My Pokémon", dexIds: mine ?? [], hidden: false };
    }
    const collection: PosterCollection = posterCollection(sourceId) ?? REGION_POSTERS[0]!;
    return { title: collection.title, dexIds: collection.dexIds, hidden: false };
  }, [extraCrowd, sourceId, playlist, picks, mine, favourites]);

  const yours: Choice[] = [
    ...extra.choices,
    ...(favourites.length > 0 ? [{ id: FAVOURITES, label: "My favourites", count: favourites.length }] : []),
    ...(picks.ids.length > 0 ? [{ id: MINE, label: "My picks", count: picks.ids.length }] : []),
    { id: PLAYLIST, label: playlist.rangeLabel || playlist.title },
  ];
  const groups = [
    {
      id: "regions",
      label: "Regions",
      row: "Every Pokémon from",
      choices: REGION_POSTERS.map((item) => ({ id: item.id, label: item.label, count: item.dexIds.length })),
    },
    { id: "starters", label: "Starters", row: "Starter Pokémon", choices: STARTER_POSTERS.map((item) => ({ id: item.id, label: item.label })) },
    { id: "yours", label: "Your own", row: "Your own", choices: yours },
  ];
  const group = groups.find((item) => item.choices.some((choice) => choice.id === sourceId)) ?? groups[0]!;
  return { crowd, sourceId, setSourceId, groups, group, hasPicks: picks.ids.length > 0 };
}

/** The tabs and chips for choosing who goes on the page. */
export function CrowdPicker({
  state,
  label,
  idPrefix,
  onChoose,
  onOwnPick,
}: {
  state: ReturnType<typeof useCrowd>;
  label: string;
  idPrefix: string;
  onChoose: (id: string) => void;
  onOwnPick: () => void;
}) {
  const { groups, group, sourceId, hasPicks } = state;
  const openGroup = (id: string) => {
    const next = groups.find((item) => item.id === id);
    if (next && next !== group && next.choices[0]) onChoose(next.choices[0].id);
  };
  return (
    <>
      <div
        className="pk-entry-tabs"
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const index = groups.indexOf(group);
          const next = groups[(index + step + groups.length) % groups.length]!;
          openGroup(next.id);
          document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
        }}
      >
        {groups.map((item) => (
          <button
            key={item.id}
            id={`${idPrefix}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={item === group}
            tabIndex={item === group ? 0 : -1}
            className="pk-tab"
            onClick={() => openGroup(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ChoiceRow label={group.row} choices={group.choices} chosen={sourceId} onChoose={onChoose} />
      {group.id === "yours" && !hasPicks ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Pick Pokémon in{" "}
          <button type="button" className="font-bold underline" onClick={onOwnPick}>
            Make your own
          </button>{" "}
          to use your own choice here too.
        </p>
      ) : null}
    </>
  );
}
