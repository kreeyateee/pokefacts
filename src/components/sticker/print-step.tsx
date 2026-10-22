"use client";

import { Button } from "@/components/ui/button";
import { PAPERS, PRINT_STEPS, type BackMode, type PaperId } from "@/lib/sticker-layout";
import type { PosterStyle } from "@/lib/sticker-styles";

export type PrintScope = "card" | "all";

/** Stickers for the Yoto card, or one big A4 poster of the group photo or the pile. */
export type PrintKind = "stickers" | "poster";

const POSTER_CHOICES: ReadonlyArray<{ id: PosterStyle; label: string }> = [
  { id: "photo", label: "Group photo" },
  { id: "pile", label: "Pile" },
];

function PosterSection({
  posterStyle,
  busy,
  sheetRef,
  onPosterStyle,
  onSave,
}: {
  posterStyle: PosterStyle;
  busy: string | null;
  sheetRef: React.Ref<HTMLCanvasElement>;
  onPosterStyle: (style: PosterStyle) => void;
  onSave: () => void;
}) {
  return (
    <section className="grid gap-3" aria-labelledby="sticker-poster-heading">
      <h3 id="sticker-poster-heading" className="font-display text-2xl leading-tight">
        A4 poster
      </h3>
      <p className="text-sm leading-6">The same Pokémon, title and drawing as the card, big enough for a wall.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Poster picture">
        {POSTER_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={posterStyle === choice.id}
            className="pk-chip pk-chip-big"
            onClick={() => onPosterStyle(choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <Button type="button" className="h-12 justify-self-start px-6 text-base" disabled={Boolean(busy)} onClick={onSave}>
        {busy ?? "Save poster PDF"}
      </Button>
      <p className="text-sm leading-6 text-muted-foreground">Print it on A4 paper. Fit to page is fine for a poster.</p>
      <canvas
        ref={sheetRef}
        aria-label="A4 poster"
        className="h-auto w-full max-w-[420px] bg-white shadow-[4px_4px_0_#16324f]"
      />
    </section>
  );
}

/** Step 3: stickers (what the back says, the paper, which cards, then the PDF), or a poster. */
export function PrintStep({
  making,
  posterStyle,
  backMode,
  backText,
  hidden,
  namesFit,
  paper,
  scope,
  cardCount,
  sheet,
  busy,
  sheetRef,
  onBackMode,
  onBackText,
  onSuggestedNote,
  onTextFocus,
  onPaper,
  onScope,
  onSheet,
  onSave,
  onMaking,
  onPosterStyle,
  onSavePoster,
}: {
  making: PrintKind;
  posterStyle: PosterStyle;
  backMode: BackMode;
  backText: string;
  hidden: boolean;
  namesFit: boolean;
  paper: PaperId;
  scope: PrintScope;
  cardCount: number;
  sheet: { page: number; pages: number; titles: readonly string[] };
  busy: string | null;
  sheetRef: React.Ref<HTMLCanvasElement>;
  onBackMode: (mode: BackMode) => void;
  onBackText: (text: string) => void;
  onSuggestedNote: () => void;
  onTextFocus: () => void;
  onPaper: (paper: PaperId) => void;
  onScope: (scope: PrintScope) => void;
  onSheet: (page: number) => void;
  onSave: () => void;
  onMaking: (making: PrintKind) => void;
  onPosterStyle: (style: PosterStyle) => void;
  onSavePoster: () => void;
}) {
  const backChoices: { id: BackMode; label: string; disabled?: boolean; title?: string }[] = [
    { id: "steps", label: "How to play" },
    {
      id: "names",
      label: "Every name",
      disabled: hidden || !namesFit,
      title: hidden ? "Riddle cards keep the names secret" : namesFit ? undefined : "Too many names to fit on the back",
    },
    { id: "note", label: "My own note" },
  ];
  const makingChoices = (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What to print">
      <button type="button" role="radio" aria-checked={making === "stickers"} className="pk-chip pk-chip-big" onClick={() => onMaking("stickers")}>
        Card stickers
      </button>
      <button type="button" role="radio" aria-checked={making === "poster"} className="pk-chip pk-chip-big" onClick={() => onMaking("poster")}>
        A4 poster
      </button>
    </div>
  );
  if (making === "poster") {
    return (
      <div className="grid gap-5">
        {makingChoices}
        <PosterSection posterStyle={posterStyle} busy={busy} sheetRef={sheetRef} onPosterStyle={onPosterStyle} onSave={onSavePoster} />
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      {makingChoices}
      <section className="grid gap-2" aria-labelledby="sticker-back-heading">
        <h3 id="sticker-back-heading" className="font-display text-2xl leading-tight">
          The back
        </h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What the back says">
          {backChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={backMode === choice.id}
              className="pk-chip pk-chip-big"
              disabled={choice.disabled}
              title={choice.title}
              onClick={() => onBackMode(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        {backMode === "note" ? (
          <>
            <label className="grid gap-1 text-sm font-bold" htmlFor="sticker-note">
              Note on the back
              <textarea
                id="sticker-note"
                value={backText}
                maxLength={400}
                onFocus={onTextFocus}
                onChange={(event) => onBackText(event.target.value)}
                className="pk-field py-2 font-normal"
                style={{ height: "auto", minHeight: "7rem" }}
              />
            </label>
            <Button type="button" variant="outline" className="h-10 justify-self-start px-4" onClick={onSuggestedNote}>
              Use the suggested note
            </Button>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            {backMode === "names"
              ? "Every Pokémon on the card, in order."
              : "Three big steps a child can follow, and a space for their name."}
          </p>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="sticker-print-heading">
        <h3 id="sticker-print-heading" className="font-display text-2xl leading-tight">
          Print
        </h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Paper size">
          {(Object.keys(PAPERS) as PaperId[]).map((id) => (
            <button key={id} type="button" role="radio" aria-checked={paper === id} className="pk-chip" onClick={() => onPaper(id)}>
              {PAPERS[id].label}
            </button>
          ))}
        </div>
        {cardCount > 1 ? (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which cards to print">
            <button type="button" role="radio" aria-checked={scope === "card"} className="pk-chip" onClick={() => onScope("card")}>
              This card
            </button>
            <button type="button" role="radio" aria-checked={scope === "all"} className="pk-chip" onClick={() => onScope("all")}>
              All {cardCount} cards
            </button>
          </div>
        ) : null}
        <Button type="button" className="h-12 justify-self-start px-6 text-base" disabled={Boolean(busy)} onClick={onSave}>
          {busy ?? "Save PDF to print"}
        </Button>
        <ol className="grid list-decimal gap-1 pl-5 text-sm leading-6">
          {PRINT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
          <li>Stick the front and back onto a blank Make Your Own card.</li>
        </ol>
        <p className="text-sm leading-6 text-muted-foreground">
          Full-sheet sticker paper works best. Plain paper and glue are fine too.
        </p>
      </section>

      <section className="grid gap-2" aria-labelledby="sticker-sheet-heading">
        <h3 id="sticker-sheet-heading" className="pk-kicker">
          The sheet
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Sheet {sheet.page + 1} of {sheet.pages}: {sheet.titles.join(", ")}.
        </p>
        {sheet.pages > 1 ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10 px-4" disabled={sheet.page <= 0} onClick={() => onSheet(sheet.page - 1)}>
              Previous sheet
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              disabled={sheet.page >= sheet.pages - 1}
              onClick={() => onSheet(sheet.page + 1)}
            >
              Next sheet
            </Button>
          </div>
        ) : null}
        <canvas
          ref={sheetRef}
          aria-label={`${PAPERS[paper].label} print sheet ${sheet.page + 1} of ${sheet.pages}`}
          className="h-auto w-full max-w-[420px] bg-white shadow-[4px_4px_0_#16324f]"
        />
      </section>
    </div>
  );
}
