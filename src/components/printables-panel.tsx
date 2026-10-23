"use client";

import { Button } from "@/components/ui/button";
import type { KidCard } from "@/lib/kid-cards";

export type PrintStart = "stickers" | "poster";

/** Printables: pick a set above, a playlist here, then stickers for its card or an A4 poster. */
export function PrintablesPanel({
  card,
  rangeCards,
  onChooseCard,
  onPrint,
  onOwnPick,
}: {
  card: KidCard;
  rangeCards: readonly KidCard[];
  onChooseCard: (card: KidCard) => void;
  onPrint: (start: PrintStart) => void;
  onOwnPick: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <section className="pk-panel min-w-0" aria-labelledby="print-playlist-heading">
        <h2 id="print-playlist-heading" className="pk-section-title">
          {rangeCards.length > 1 ? "Pick a playlist" : "This playlist"}
        </h2>
        {rangeCards.length > 1 ? (
          <ul className="pk-scroll mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={`${card.title} playlists`}>
            {rangeCards.map((item) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={item.id === card.id ? "true" : undefined}
                  onClick={() => onChooseCard(item)}
                  className="pk-pill"
                >
                  {item.rangeLabel}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {card.rangeLabel && card.rangeLabel !== card.title ? `${card.title}, ${card.rangeLabel}` : card.title}. The
          stickers and the poster show the Pokémon on this playlist.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="What to print">
        <div className="pk-panel grid content-start gap-3">
          <h2 className="font-display text-2xl leading-tight">Card stickers</h2>
          <p className="text-sm leading-6">
            A front and a back for the Yoto card, at real card size. Pick a group photo, a pile, a Pokédex screen or a
            trading card, draw on it, then print a sheet.
          </p>
          <Button type="button" className="h-12 justify-self-start px-6 text-base" onClick={() => onPrint("stickers")}>
            Make card stickers
          </Button>
        </div>
        <div className="pk-panel grid content-start gap-3">
          <h2 className="font-display text-2xl leading-tight">A4 poster</h2>
          <p className="text-sm leading-6">
            The group photo or the pile across a whole A4 page, with the playlist name on a ribbon. Big enough for a wall.
          </p>
          <Button type="button" className="h-12 justify-self-start px-6 text-base" onClick={() => onPrint("poster")}>
            Make a poster
          </Button>
        </div>
      </section>

      <p className="text-sm leading-6">
        Picked your own Pokémon?{" "}
        <button type="button" className="font-bold underline" onClick={onOwnPick}>
          Open Make your own
        </button>{" "}
        and press Make stickers there.
      </p>
    </div>
  );
}
