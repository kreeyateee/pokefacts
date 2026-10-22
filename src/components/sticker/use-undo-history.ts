"use client";

import { useRef, useState } from "react";

/** Undo and redo for any value. The caller hands in the current value, so nothing is read from a stale closure. */
export function useUndoHistory<T>(limit = 40) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [size, setSize] = useState({ undo: 0, redo: 0 });

  function sync() {
    setSize({ undo: past.current.length, redo: future.current.length });
  }

  return {
    canUndo: size.undo > 0,
    canRedo: size.redo > 0,
    push(snapshot: T) {
      past.current.push(snapshot);
      if (past.current.length > limit) past.current.shift();
      future.current = [];
      sync();
    },
    undo(current: T): T | undefined {
      const previous = past.current.pop();
      if (previous === undefined) return undefined;
      future.current.push(current);
      sync();
      return previous;
    },
    redo(current: T): T | undefined {
      const next = future.current.pop();
      if (next === undefined) return undefined;
      past.current.push(current);
      sync();
      return next;
    },
    reset() {
      past.current = [];
      future.current = [];
      sync();
    },
  };
}
