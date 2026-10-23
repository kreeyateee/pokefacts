"use client";

import { useRef, type PointerEvent } from "react";

import { swipeNudge, swipeStep } from "@/lib/swipe";

/** A swipe that starts on one of these is the control's own gesture, such as dragging a slider. */
const OWN_GESTURE = "input, textarea, select, audio, video, [role='slider'], [data-no-swipe]";

function scrollsSideways(target: Element, stop: Element): boolean {
  for (let node: Element | null = target; node && node !== stop; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== "visible") return true;
  }
  return false;
}

function settle(element: HTMLElement) {
  element.style.transition = "transform 160ms ease-out";
  element.style.transform = "";
}

/**
 * Left and right swipes on touch screens, for stepping through Pokémon: spread the handlers on the
 * element that moves. It follows the finger a little. Up and down still scrolls the page, and mice and
 * trackpads are left alone.
 */
export function useSwipe<T extends HTMLElement>(onStep: ((step: 1 | -1) => void) | undefined) {
  const start = useRef<{ id: number; x: number; y: number; at: number } | null>(null);

  return {
    onPointerDown(event: PointerEvent<T>) {
      if (!onStep || event.pointerType === "mouse" || !event.isPrimary) return;
      const target = event.target as Element;
      if (target.closest(OWN_GESTURE) || scrollsSideways(target, event.currentTarget)) return;
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
      event.currentTarget.style.transition = "none";
    },
    onPointerMove(event: PointerEvent<T>) {
      const from = start.current;
      if (!from || from.id !== event.pointerId) return;
      const dx = event.clientX - from.x;
      if (Math.abs(dx) > Math.abs(event.clientY - from.y)) {
        event.currentTarget.style.transform = `translateX(${swipeNudge(dx)}px)`;
      }
    },
    onPointerUp(event: PointerEvent<T>) {
      const from = start.current;
      if (!from || from.id !== event.pointerId) return;
      start.current = null;
      settle(event.currentTarget);
      const step = swipeStep(event.clientX - from.x, event.clientY - from.y, event.timeStamp - from.at);
      if (step !== 0) onStep?.(step);
    },
    onPointerCancel(event: PointerEvent<T>) {
      start.current = null;
      settle(event.currentTarget);
    },
  };
}
