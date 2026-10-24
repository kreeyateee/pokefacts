"use client";

import { useState } from "react";

import { ColouringMaker } from "@/components/colouring-maker";
import { PosterMaker } from "@/components/poster-maker";
import { StickerStudio } from "@/components/sticker-studio";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/components/use-stored-state";
import { CATALOGUE_PICKS_KEY, readCataloguePicks, serializeCataloguePicks } from "@/lib/catalogue-picks";
import type { MeasureUnits } from "@/lib/format";
import type { KidCard } from "@/lib/kid-cards";
import { selectionStickerCards } from "@/lib/selection-playlist";

/** Card stickers for the Pokémon picked in Make your own. Picks live in this browser. */
function OwnPickStickers({ units }: { units: MeasureUnits }) {
  const [picks] = useStoredState(CATALOGUE_PICKS_KEY, readCataloguePicks, serializeCataloguePicks);
  const [cards, setCards] = useState<KidCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const count = picks.ids.length;
  if (count === 0) return null;

  async function open() {
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch(`/api/catalogue?pick=${picks.ids.join(",")}`);
      const payload = (await response.json()) as {
        items?: Array<{ id: number; name: string; speciesId?: number }>;
        error?: string;
      };
      if (!response.ok || !payload.items) throw new Error(payload.error || "Those Pokémon could not be opened.");
      const built = selectionStickerCards(payload.items, picks.kind, picks.title, units);
      if (built.length === 0) throw new Error("Pick at least one Pokémon in Make your own.");
      setCards(built);
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "Your picks could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid content-start gap-2">
      <Button type="button" variant="outline" className="h-12 justify-self-start px-5 text-base" disabled={busy} onClick={() => void open()}>
        {busy ? "Getting them ready…" : `Stickers for my ${count === 1 ? "pick" : `${count} picks`}`}
      </Button>
      {problem ? (
        <p className="text-sm leading-6 pk-danger" role="alert">
          {problem}
        </p>
      ) : null}
      {cards?.[0] ? (
        <StickerStudio key={cards.map((item) => item.id).join("|")} card={cards[0]} cards={cards} onClose={() => setCards(null)} />
      ) : null}
    </div>
  );
}

/** Printables: A4 posters of any group of Pokémon, colouring sheets, then stickers for a Yoto card. */
export function PrintablesPanel({
  card,
  rangeCards,
  units,
  onChooseCard,
  onStickers,
  onOwnPick,
}: {
  card: KidCard;
  rangeCards: readonly KidCard[];
  units: MeasureUnits;
  onChooseCard: (card: KidCard) => void;
  onStickers: () => void;
  onOwnPick: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <PosterMaker playlist={card} onOwnPick={onOwnPick} />

      <ColouringMaker />

      <section className="pk-panel grid min-w-0 content-start gap-3" aria-labelledby="stickers-heading">
        <h2 id="stickers-heading" className="font-display text-3xl leading-tight">
          Card stickers
        </h2>
        <p className="text-sm leading-6">
          A front and a back for a Yoto card, at real card size. Pick a group photo, a pile, a Pokédex screen or a
          trading card, draw on it, then print a sheet.
        </p>
        {rangeCards.length > 1 ? (
          <ul className="pk-scroll flex gap-2 overflow-x-auto pb-1" aria-label={`${card.title} playlists`}>
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
        <div className="flex flex-wrap items-start gap-2">
          <Button type="button" className="h-12 px-6 text-base" onClick={onStickers}>
            Stickers for {card.rangeLabel && card.rangeLabel !== card.title ? card.rangeLabel : card.title}
          </Button>
          <OwnPickStickers units={units} />
        </div>
      </section>
    </div>
  );
}
