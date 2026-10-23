/**
 * The child's favourite Pokémon, chosen by the parent and kept in this browser. The first is their
 * partner: it comes along on every adventure. All of them turn up in Who's That and on a poster.
 */
export const FAVOURITES_KEY = "pokefacts.favourites";

/** Set once the question has been asked, so it is not asked on every visit. */
export const FAVOURITES_ASKED_KEY = "pokefacts.favourites-asked";

export const MAX_FAVOURITES = 3;

const LAST_SPECIES = 1025;

function isSpeciesId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= LAST_SPECIES;
}

/** Saved favourites: up to three national dex numbers, no repeats. Anything else is dropped. */
export function readFavourites(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(isSpeciesId))].slice(0, MAX_FAVOURITES);
  } catch {
    return [];
  }
}

export function writeFavourites(ids: readonly number[]): string {
  return JSON.stringify([...new Set(ids.filter(isSpeciesId))].slice(0, MAX_FAVOURITES));
}

/** Adds one at the end, or does nothing when it is already there or the list is full. */
export function withFavourite(ids: readonly number[], id: number): number[] {
  if (!isSpeciesId(id) || ids.includes(id) || ids.length >= MAX_FAVOURITES) return [...ids];
  return [...ids, id];
}

/** Makes one the partner by moving it to the front. */
export function asPartner(ids: readonly number[], id: number): number[] {
  return ids.includes(id) ? [id, ...ids.filter((item) => item !== id)] : [...ids];
}

/** A partner sent to an adventure: a real species, or none. */
export function partnerParam(raw: string | null): number | undefined {
  if (!raw || !/^\d{1,4}$/.test(raw)) return undefined;
  const id = Number(raw);
  return isSpeciesId(id) ? id : undefined;
}
