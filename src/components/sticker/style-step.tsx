"use client";

import { Button } from "@/components/ui/button";
import { PREVIEW_DPI, cardPixelSize, type CoverStyle } from "@/lib/sticker-layout";
import { STYLE_CHOICES } from "@/lib/sticker-styles";

const THUMB = cardPixelSize(PREVIEW_DPI / 2.5);

/** Step 1: pick a front, name the card, and say whose it is. */
export function StyleStep({
  style,
  sprites,
  title,
  owner,
  thumbRef,
  onStyle,
  onSprites,
  onTitle,
  onOwner,
  onTextFocus,
  onMakeIt,
}: {
  style: CoverStyle;
  sprites: boolean;
  title: string;
  owner: string;
  thumbRef: (style: CoverStyle) => (canvas: HTMLCanvasElement | null) => void;
  onStyle: (style: CoverStyle) => void;
  onSprites: (sprites: boolean) => void;
  onTitle: (title: string) => void;
  onOwner: (owner: string) => void;
  onTextFocus: () => void;
  onMakeIt: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="font-display text-2xl leading-tight">Pick a look</h3>
        <p className="mt-1 text-sm leading-6">Tap the front you like best. You can change it any time.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" role="radiogroup" aria-label="Front style">
        {STYLE_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={style === choice.id}
            className="pk-choice pk-style-choice flex flex-col items-center gap-2 px-2 py-3 text-center"
            onClick={() => onStyle(choice.id)}
          >
            <canvas
              ref={thumbRef(choice.id)}
              width={THUMB.width}
              height={THUMB.height}
              aria-hidden="true"
              className="h-auto w-full max-w-28"
              style={{ borderRadius: "5.9% / 3.7%" }}
            />
            <span className="font-display text-base leading-tight">{choice.label}</span>
            <span className="hidden text-xs leading-4 text-muted-foreground sm:block">{choice.detail}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Pokémon pictures">
        <span className="text-sm font-bold">Pictures</span>
        <button type="button" role="radio" aria-checked={!sprites} className="pk-chip pk-chip-big" onClick={() => onSprites(false)}>
          Full art
        </button>
        <button type="button" role="radio" aria-checked={sprites} className="pk-chip pk-chip-big" onClick={() => onSprites(true)}>
          Game sprites
        </button>
      </div>
      <Button type="button" variant="outline" className="h-12 justify-self-start px-5 text-base" onClick={onMakeIt}>
        Make it for me
      </Button>
      <label className="grid gap-1 text-sm font-bold" htmlFor="sticker-title">
        Name on the card
        <input
          id="sticker-title"
          value={title}
          maxLength={60}
          onFocus={onTextFocus}
          onChange={(event) => onTitle(event.target.value)}
          className="pk-field font-normal"
        />
      </label>
      <label className="grid gap-1 text-sm font-bold" htmlFor="sticker-owner">
        Whose card is it?
        <input
          id="sticker-owner"
          value={owner}
          maxLength={40}
          placeholder="Leave empty to write it by hand"
          onFocus={onTextFocus}
          onChange={(event) => onOwner(event.target.value)}
          className="pk-field font-normal"
        />
        <span className="font-normal text-muted-foreground">Printed on the back under “This card belongs to”.</span>
      </label>
    </div>
  );
}
