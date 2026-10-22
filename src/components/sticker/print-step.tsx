"use client";

import { Button } from "@/components/ui/button";
import { PAPERS, PRINT_STEPS, type BackMode, type PaperId } from "@/lib/sticker-layout";

export type PrintScope = "card" | "all";

/** Step 3: what the back says, the paper, which cards, then the PDF. */
export function PrintStep({
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
}: {
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
  return (
    <div className="grid gap-5">
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
