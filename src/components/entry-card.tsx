"use client";

import type { ReactNode } from "react";

import { YotoScreen } from "@/components/yoto-screen";

/**
 * One Pokémon or riddle. A picture column (artwork, then the 16×16 Yoto screen) beside the title and words.
 * The card switches to the stacked phone layout by its own width, so a narrow column also stacks.
 */
export function EntryCard({
  swapKey,
  kicker,
  title,
  meta,
  picture,
  yotoSrc,
  top,
  tabs,
  children,
}: {
  swapKey: string | number;
  kicker: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  picture?: ReactNode;
  yotoSrc?: string;
  top?: ReactNode;
  /** Section tabs. They sit beside the pictures, and the words below run the full width of the card. */
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="pk-card pk-dex pk-entry-card min-w-0">
      {top}
      <div className={tabs ? "pk-entry pk-entry-tabbed" : "pk-entry"}>
        <div key={`head-${swapKey}`} className="pk-entry-head pk-swap">
          <p className="pk-kicker">{kicker}</p>
          <h2 className="pk-entry-title">{title}</h2>
          {meta}
        </div>
        {picture || yotoSrc ? (
          <div key={`pics-${swapKey}`} className="pk-entry-pics pk-swap">
            {picture}
            {yotoSrc ? <YotoScreen src={yotoSrc} /> : null}
          </div>
        ) : null}
        {tabs ? <div className="pk-entry-tabs-slot">{tabs}</div> : null}
        {/* Not keyed, so the audio player and buttons stay put. Key the words inside if they should fade. */}
        <div className="pk-entry-body">{children}</div>
      </div>
    </article>
  );
}

/** Big Previous and Next buttons, with where you are in between. */
export function EntryPager({
  previous,
  next,
  position,
  onPrevious,
  onNext,
}: {
  previous?: string;
  next?: string;
  position: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pk-pager">
      <button
        type="button"
        className="pk-pill pk-pager-btn"
        disabled={!previous}
        onClick={onPrevious}
        aria-label={previous ? `Previous: ${previous}` : "Previous"}
      >
        <span aria-hidden="true">‹</span>
        <span className="pk-pager-name">{previous ?? "Previous"}</span>
      </button>
      <span className="pk-pager-count">{position}</span>
      <button
        type="button"
        className="pk-pill pk-pager-btn"
        disabled={!next}
        onClick={onNext}
        aria-label={next ? `Next: ${next}` : "Next"}
      >
        <span className="pk-pager-name">{next ?? "Next"}</span>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
