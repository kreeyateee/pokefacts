"use client";

import { useLayoutEffect, useRef } from "react";

import { silhouetteRgba } from "@/lib/silhouette";

const SIZE = 480;

/** Black Pokémon shape whose pixels are opaque white everywhere else. */
export function MysterySilhouette({ src, fallback }: { src: string; fallback: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintWhite(canvas);
    let cancel = false;
    const urls = fallback && fallback !== src ? [src, fallback] : [src];
    void (async () => {
      for (const url of urls) {
        try {
          const image = await loadImage(url);
          if (cancel) return;
          paintSilhouette(canvas, image);
          return;
        } catch {
          // Try the catalogue copy of the same picture.
        }
      }
      if (!cancel) paintWhite(canvas);
    })();
    return () => {
      cancel = true;
    };
  }, [src, fallback]);

  return <canvas ref={canvasRef} width={SIZE} height={SIZE} className="pk-silhouette-shape" aria-hidden="true" />;
}

function paintWhite(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function paintSilhouette(canvas: HTMLCanvasElement, image: HTMLImageElement): void {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width < 1 || height < 1) return;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) return;
  sourceCtx.drawImage(image, 0, 0);
  const frame = sourceCtx.getImageData(0, 0, width, height);
  frame.data.set(silhouetteRgba(frame.data, width, height));
  sourceCtx.putImageData(frame, 0, 0);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintWhite(canvas);
  const scale = Math.min(canvas.width / width, canvas.height / height);
  const dw = width * scale;
  const dh = height * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("picture"));
    image.src = url;
  });
}
