"use client";

import { Button } from "@/components/ui/button";
import { CrowdPicker, HeroPicker } from "@/components/sticker/sticker-pickers";
import type { StickerMon } from "@/lib/sticker-cover";
import type { CoverDraft, DrawLayer } from "@/lib/sticker-layout";

export const BRUSH_COLORS = ["#16324f", "#e10600", "#ffcb05", "#2a75bb", "#7ac74c", "#f95587", "#9b5de5", "#ff8c42", "#fffdf6"] as const;

/** Pen widths on the printed card, in millimetres. */
export const BRUSH_SIZES = [
  { mm: 1.4, label: "Thin" },
  { mm: 2.6, label: "Medium" },
  { mm: 4.6, label: "Fat" },
] as const;

export type Tool = "pictures" | "draw";

function DrawTools({
  brush,
  brushSize,
  layer,
  hasDrawing,
  onBrush,
  onBrushSize,
  onLayer,
  onClear,
}: {
  brush: string;
  brushSize: number;
  layer: DrawLayer;
  hasDrawing: boolean;
  onBrush: (color: string) => void;
  onBrushSize: (mm: number) => void;
  onLayer: (layer: DrawLayer) => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm leading-6">Draw right on the card with your finger or the mouse.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where the drawing goes">
        <button type="button" role="radio" aria-checked={layer === "behind"} className="pk-chip pk-chip-big" onClick={() => onLayer("behind")}>
          Behind the Pokémon
        </button>
        <button type="button" role="radio" aria-checked={layer === "front"} className="pk-chip pk-chip-big" onClick={() => onLayer("front")}>
          On top
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pen colour">
        {BRUSH_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="pk-swatch pk-swatch-big"
            style={{ background: color }}
            aria-label={`Pen colour ${color}`}
            aria-pressed={brush === color}
            onClick={() => onBrush(color)}
          />
        ))}
        <button type="button" className="pk-chip pk-chip-big" aria-pressed={brush === "erase"} onClick={() => onBrush("erase")}>
          Rubber
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pen size">
        {BRUSH_SIZES.map((size) => (
          <button
            key={size.mm}
            type="button"
            className="pk-chip pk-chip-big"
            aria-pressed={brushSize === size.mm}
            onClick={() => onBrushSize(size.mm)}
          >
            {size.label}
          </button>
        ))}
        <button type="button" className="pk-chip pk-chip-big" onClick={onClear} disabled={!hasDrawing}>
          Clear drawing
        </button>
      </div>
    </div>
  );
}

/** Step 2: choose who is on the front, and draw on it. */
export function DecorateStep({
  cover,
  mons,
  hidden,
  tool,
  brush,
  brushSize,
  onTool,
  onBrush,
  onBrushSize,
  onClearDrawing,
  onDrawLayer,
  onHero,
  onCrowd,
  onShake,
}: {
  cover: CoverDraft;
  mons: readonly StickerMon[];
  hidden: boolean;
  tool: Tool;
  brush: string;
  brushSize: number;
  onTool: (tool: Tool) => void;
  onBrush: (color: string) => void;
  onBrushSize: (mm: number) => void;
  onClearDrawing: () => void;
  onDrawLayer: (layer: DrawLayer) => void;
  onHero: (key: string) => void;
  onCrowd: (crowd: string[] | null) => void;
  onShake: () => void;
}) {
  const group = cover.style === "photo" || cover.style === "pile";
  const chosen = new Set(cover.crowd ?? mons.map((mon) => mon.key));
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="font-display text-2xl leading-tight">{group ? "Who's in it?" : "Pick your star"}</h3>
        <p className="mt-1 text-sm leading-6">
          {group
            ? "Everyone on the card is in. Tap a Pokémon to leave it out, or tap again to bring it back."
            : hidden
              ? "Pick the riddle whose shadow goes on the front."
              : "Pick the Pokémon that goes big on the front."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What to do">
        <button type="button" role="radio" aria-checked={tool === "pictures"} className="pk-chip pk-chip-big" onClick={() => onTool("pictures")}>
          {group ? "Choose Pokémon" : "Choose the star"}
        </button>
        <button type="button" role="radio" aria-checked={tool === "draw"} className="pk-chip pk-chip-big" onClick={() => onTool("draw")}>
          Draw
        </button>
        {cover.style === "pile" ? (
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onShake}>
            Shake it up
          </Button>
        ) : null}
      </div>
      {tool === "draw" ? (
        <DrawTools
          brush={brush}
          brushSize={brushSize}
          layer={cover.drawLayer}
          hasDrawing={Boolean(cover.painting)}
          onBrush={onBrush}
          onBrushSize={onBrushSize}
          onLayer={onDrawLayer}
          onClear={onClearDrawing}
        />
      ) : group ? (
        <CrowdPicker
          mons={mons}
          chosen={chosen}
          hidden={hidden}
          sprites={cover.sprites}
          onToggle={(key) => {
            const next = new Set(chosen);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            onCrowd(next.size === mons.length ? null : mons.flatMap((mon) => (next.has(mon.key) ? [mon.key] : [])));
          }}
          onEveryone={() => onCrowd(null)}
          onNobody={() => onCrowd([])}
        />
      ) : (
        <HeroPicker mons={mons} hero={cover.hero} hidden={hidden} onPick={onHero} />
      )}
    </div>
  );
}
