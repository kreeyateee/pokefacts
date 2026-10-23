"use client";

import { useState } from "react";

import { StickerStudio } from "@/components/sticker-studio";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/components/use-stored-state";
import { CATALOGUE_PICKS_KEY, readCataloguePicks, serializeCataloguePicks } from "@/lib/catalogue-picks";
import type { MeasureUnits } from "@/lib/format";
import type { KidCard } from "@/lib/kid-cards";
import { selectionStickerCards } from "@/lib/selection-playlist";

export type PrintStart = "stickers" | "poster";

/** The Pokémon picked in Make your own, as a poster or stickers. Picks live in this browser. */
function OwnPicks({ units, onOwnPick }: { units: MeasureUnits; onOwnPick: () => void }) {
  const [picks] = useStoredState(CATALOGUE_PICKS_KEY, readCataloguePicks, serializeCataloguePicks);
  const [studio, setStudio] = useState<{ cards: KidCard[]; start: PrintStart } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const count = picks.ids.length;
  const title = picks.title.trim();

  async function open(start: PrintStart) {
    if (count === 0 || busy) return;
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch(`/api/catalogue?pick=${picks.ids.join(",")}`);
      const payload = (await response.json()) as {
        items?: Array<{ id: number; name: string; speciesId?: number }>;
        error?: string;
      };
      if (!response.ok || !payload.items) throw new Error(payload.error || "Those Pokémon could not be opened.");
      const cards = selectionStickerCards(payload.items, picks.kind, picks.title, units);
      if (cards.length === 0) throw new Error("Pick at least one Pokémon in Make your own.");
      setStudio({ cards, start });
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "Your picks could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pk-panel grid content-start gap-3" aria-labelledby="own-picks-heading">
      <h2 id="own-picks-heading" className="font-display text-2xl leading-tight">
        Your own picks
      </h2>
      {count > 0 ? (
        <>
          <p className="text-sm leading-6">
            {count === 1 ? "1 Pokémon is" : `${count} Pokémon are`} on your Make your own playlist
            {title ? ` (${title})` : ""}. Put all of them on a poster, or on card stickers.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-12 px-6 text-base" disabled={busy} onClick={() => void open("poster")}>
              {busy ? "Getting them ready…" : "Poster of my picks"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 px-5 text-base"
              disabled={busy}
              onClick={() => void open("stickers")}
            >
              Stickers for my picks
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm leading-6">
          Pick Pokémon in{" "}
          <button type="button" className="font-bold underline" onClick={onOwnPick}>
            Make your own
          </button>
          , then come back here to make a poster of them.
        </p>
      )}
      {problem ? (
        <p className="text-sm leading-6 pk-danger" role="alert">
          {problem}
        </p>
      ) : null}
      {studio?.cards[0] ? (
        <StickerStudio
          key={studio.cards.map((item) => item.id).join("|")}
          card={studio.cards[0]}
          cards={studio.cards}
          start={studio.start}
          onClose={() => setStudio(null)}
        />
      ) : null}
    </section>
  );
}

/** Printables: pick a set above, a playlist here, then stickers for its card or an A4 poster. */
export function PrintablesPanel({
  card,
  rangeCards,
  units,
  onChooseCard,
  onPrint,
  onOwnPick,
}: {
  card: KidCard;
  rangeCards: readonly KidCard[];
  units: MeasureUnits;
  onChooseCard: (card: KidCard) => void;
  onPrint: (start: PrintStart) => void;
  onOwnPick: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <OwnPicks units={units} onOwnPick={onOwnPick} />

      <section className="pk-panel min-w-0" aria-labelledby="print-playlist-heading">
        <h2 id="print-playlist-heading" className="pk-section-title">
          {rangeCards.length > 1 ? "Or pick a ready-made playlist" : "Or use this ready-made playlist"}
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
    </div>
  );
}
