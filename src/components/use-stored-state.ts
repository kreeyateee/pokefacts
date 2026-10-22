"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORED_CHANGE = "pokefacts-stored-change";

/** Values that could not be written (private mode, full storage) still work for this page load. */
const unsaved = new Map<string, string>();

function subscribe(listener: () => void) {
  window.addEventListener(STORED_CHANGE, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(STORED_CHANGE, listener);
    window.removeEventListener("storage", listener);
  };
}

function readRaw(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, raw: string) {
  try {
    localStorage.setItem(key, raw);
    unsaved.delete(key);
  } catch {
    unsaved.set(key, raw);
  }
  window.dispatchEvent(new Event(STORED_CHANGE));
}

/**
 * State kept in localStorage and shared by every component (and tab) that reads the same key.
 * The server render and hydration use `parse(null)`, then the stored value takes over.
 */
export function useStoredState<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
): [T, (next: T | ((current: T) => T)) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const value = useMemo(() => parse(raw), [parse, raw]);
  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const current = parse(readRaw(key));
      const updated = typeof next === "function" ? (next as (current: T) => T)(current) : next;
      writeRaw(key, serialize(updated));
    },
    [key, parse, serialize],
  );
  return [value, setValue];
}
