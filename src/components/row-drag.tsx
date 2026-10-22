"use client";

import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/**
 * Drag a row onto another row. Buttons and links inside the row still click.
 * The click that ends a drag is swallowed, so a row that plays on click does not play after a drop.
 */
export function useRowDrag(attribute: string, onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number; index: number } | null>(null);
  const swallowClick = useRef(false);

  function indexUnder(event: { clientX: number; clientY: number }): number | null {
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest(`[${attribute}]`);
    const raw = hit?.getAttribute(attribute);
    if (raw == null) return null;
    const index = Number(raw);
    return Number.isInteger(index) ? index : null;
  }

  function clearDrag() {
    pointerStart.current = null;
    dragFrom.current = null;
    setDragIndex(null);
    setOverIndex(null);
  }

  function rowProps(index: number) {
    return {
      [attribute]: String(index),
      onPointerDown(event: PointerEvent<HTMLElement>) {
        swallowClick.current = false;
        if (event.button !== 0) return;
        const target = event.target;
        if (target instanceof Element && target.closest("button, a, input, label, audio, iframe, pre")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerStart.current = { x: event.clientX, y: event.clientY, index };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const origin = pointerStart.current;
        if (!origin) return;
        if (dragFrom.current === null) {
          if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 6) return;
          dragFrom.current = origin.index;
          setDragIndex(origin.index);
        }
        setOverIndex(indexUnder(event));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const from = dragFrom.current;
        clearDrag();
        if (from === null) return;
        swallowClick.current = true;
        const to = indexUnder(event);
        if (to === null || to === from) return;
        onMove(from, to);
      },
      onPointerCancel: clearDrag,
      onClickCapture(event: MouseEvent<HTMLElement>) {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      },
    };
  }

  return { dragIndex, overIndex, rowProps };
}
