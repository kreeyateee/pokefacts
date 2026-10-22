"use client";

import { useCallback, useRef, useState } from "react";

export type ImageEntry = readonly [key: string, src: string];

/**
 * Pictures for the canvas, loaded once and kept by key. A picture that fails to load is kept as null,
 * so painting skips it instead of waiting. `version` changes whenever a picture arrives.
 */
export function useImageCache() {
  const images = useRef(new Map<string, CanvasImageSource | null>());
  const pending = useRef(new Map<string, Promise<void>>());
  const [version, setVersion] = useState(0);

  const load = useCallback((key: string, src: string): Promise<void> => {
    if (!src || images.current.has(key)) return Promise.resolve();
    const waiting = pending.current.get(key);
    if (waiting) return waiting;
    const promise = new Promise<void>((resolve) => {
      const image = new Image();
      const finish = (value: CanvasImageSource | null) => {
        images.current.set(key, value);
        pending.current.delete(key);
        setVersion((count) => count + 1);
        resolve();
      };
      image.onload = () => finish(image);
      image.onerror = () => finish(null);
      image.src = src;
    });
    pending.current.set(key, promise);
    return promise;
  }, []);

  const loadAll = useCallback(
    async (entries: readonly ImageEntry[]) => {
      await Promise.all(entries.map(([key, src]) => load(key, src)));
    },
    [load],
  );

  const put = useCallback((key: string, source: CanvasImageSource) => {
    images.current.set(key, source);
    setVersion((count) => count + 1);
  }, []);

  return { images, version, load, loadAll, put };
}
