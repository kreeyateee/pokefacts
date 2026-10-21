"use client";

import { useLayoutEffect, useRef } from "react";

import { YOTO_MATRIX, yotoLedFill, yotoLedPitch, yotoLedRect, yotoMatrixSize } from "@/lib/yoto-screen";

const HERO_PITCH = 12;
const THUMB_PITCH = 6;

function paintMatrix(canvas: HTMLCanvasElement, image: HTMLImageElement, pitch: number) {
  const { led } = yotoLedPitch(pitch);
  const size = yotoMatrixSize(pitch);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, size, size);

  const source = document.createElement("canvas");
  source.width = YOTO_MATRIX;
  source.height = YOTO_MATRIX;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) return;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(image, 0, 0, YOTO_MATRIX, YOTO_MATRIX);
  const pixels = sourceCtx.getImageData(0, 0, YOTO_MATRIX, YOTO_MATRIX).data;
  const radius = led / 2;

  for (let y = 0; y < YOTO_MATRIX; y += 1) {
    for (let x = 0; x < YOTO_MATRIX; x += 1) {
      const rect = yotoLedRect(x, y, pitch);
      if (!rect) continue;
      const i = (y * YOTO_MATRIX + x) * 4;
      ctx.fillStyle = yotoLedFill(
        pixels[i] ?? 0,
        pixels[i + 1] ?? 0,
        pixels[i + 2] ?? 0,
        pixels[i + 3] ?? 255,
      );
      ctx.beginPath();
      ctx.arc(rect.x + radius, rect.y + radius, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("picture"));
    image.src = url;
  });
}

export function YotoScreen({
  src,
  size = "hero",
  label = "On the Yoto",
}: {
  src: string;
  size?: "hero" | "thumb";
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pitch = size === "thumb" ? THUMB_PITCH : HERO_PITCH;
  const matrix = yotoMatrixSize(pitch);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    let cancel = false;
    void loadImage(src)
      .then((image) => {
        if (!cancel && canvasRef.current) paintMatrix(canvasRef.current, image, pitch);
      })
      .catch(() => {
        // Leave the dark screen if the 16×16 file is missing.
      });
    return () => {
      cancel = true;
    };
  }, [src, pitch]);

  const screen = (
    <div className="pk-yoto-face">
      <canvas
        ref={canvasRef}
        width={matrix}
        height={matrix}
        className="pk-yoto-matrix"
        aria-hidden={size === "thumb" ? true : undefined}
      />
    </div>
  );

  if (size === "thumb") {
    return <div className="pk-yoto pk-yoto-thumb">{screen}</div>;
  }

  return (
    <figure className="pk-yoto">
      {screen}
      <figcaption>{label}</figcaption>
    </figure>
  );
}
