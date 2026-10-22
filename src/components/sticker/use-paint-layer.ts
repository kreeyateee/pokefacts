"use client";

import { useRef } from "react";

import { CARD_MM, PRINT_DPI, cardPixelSize } from "@/lib/sticker-layout";

export type Point = { x: number; y: number };

/**
 * The child's drawing, kept at print resolution so it prints sharp.
 * A stroke starts from the card's saved drawing, so nothing from another card leaks in.
 */
export function usePaintLayer() {
  const surface = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  function begin(base: CanvasImageSource | null) {
    const size = cardPixelSize(PRINT_DPI);
    const canvas = surface.current ?? document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    if (ctx && base) ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    surface.current = canvas;
    drawing.current = true;
  }

  /** `sizeMm` is the brush width on the printed card. "erase" rubs the drawing out. */
  function stroke(from: Point, to: Point, color: string, sizeMm: number) {
    const canvas = surface.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const width = (sizeMm * canvas.width) / CARD_MM.width;
    const erase = color === "erase";
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = width;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = erase ? "#000000" : color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
    ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x * canvas.width, to.y * canvas.height, width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** End the stroke and hand back the drawing as a PNG data URL. */
  function finish(): string {
    drawing.current = false;
    return surface.current?.toDataURL("image/png") ?? "";
  }

  return { surface, drawing, begin, stroke, finish };
}
