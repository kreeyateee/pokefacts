"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BRAND_FILES, canvasFonts, downloadPdf, jpegPage } from "@/components/sticker/print-kit";
import { SceneChooser } from "@/components/sticker/scene-chooser";
import { useImageCache, type ImageEntry } from "@/components/sticker/use-image-cache";
import { useSpeciesSizes } from "@/components/sticker/use-species-sizes";
import { Button } from "@/components/ui/button";
import { ChoiceRow, CrowdPicker, useCrowd } from "@/components/poster-crowd";
import type { KidCard } from "@/lib/kid-cards";
import { artworkSrc as artworkApi } from "@/lib/artwork-path";
import { artworkSrc } from "@/lib/page-artwork";
import { mmToPx, posterFilename, PRINT_DPI, SHEET_PREVIEW_DPI } from "@/lib/sticker-layout";
import { paintPoster, type CrowdPaint } from "@/lib/sticker-paint";
import type { Scene } from "@/lib/sticker-scenes";
import { jpegPagesPdf } from "@/lib/sticker-pdf";
import { POSTER_PAPER_MM, type PosterStyle } from "@/lib/sticker-styles";

const SOURCE_KEY = "pokefacts.poster-source";

function posterSize(dpi: number) {
  return { width: mmToPx(POSTER_PAPER_MM.width, dpi), height: mmToPx(POSTER_PAPER_MM.height, dpi) };
}

/** How the Pokémon are drawn on a poster. */
type Drawn = "art" | "shiny" | "sprites";

/** A Pokémon's picture in the chosen style. A form keeps its own picture (a Gigantamax, a Mega). */
function pictureOf(dexId: number, drawn: Drawn, form?: string): ImageEntry {
  const src = form
    ? form
    : drawn === "sprites"
      ? `/sprites/${dexId}.png`
      : drawn === "shiny"
        ? artworkApi("shiny", dexId)
        : artworkSrc(dexId);
  return [`picture:${src}`, src];
}

/**
 * A4 posters, on their own: pick who goes on it (a region, the starters, your picks or a playlist),
 * a group photo or a pile, artwork or game sprites, a title, then save a PDF to print.
 */
export function PosterMaker({ playlist, onOwnPick }: { playlist: KidCard; onOwnPick: () => void }) {
  const crowdState = useCrowd(playlist, SOURCE_KEY, "region-kanto");
  const { crowd, sourceId, setSourceId } = crowdState;
  const [style, setStyle] = useState<PosterStyle>("photo");
  const [drawn, setDrawn] = useState<Drawn>("art");
  const sprites = drawn === "sprites";
  const [pickedScene, setPickedScene] = useState<Scene | null>(null);
  const scene: Scene = pickedScene ?? (style === "pile" ? "plain" : "sky");
  const [shake, setShake] = useState(0);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const { images, version, loadAll } = useImageCache();
  const { sizes, loadAll: loadSizes } = useSpeciesSizes();

  const title = (titles[sourceId] ?? crowd?.title ?? "").slice(0, 60);
  const entries = useMemo(
    () => [...BRAND_FILES, ...(crowd?.dexIds ?? []).map((dexId, index) => pictureOf(dexId, drawn, crowd?.forms?.[index]))],
    [crowd, drawn],
  );
  const loaded = (crowd?.dexIds ?? []).filter((dexId, index) => images.current.has(pictureOf(dexId, drawn, crowd?.forms?.[index])[0])).length;

  useEffect(() => {
    void loadAll(entries);
    void loadSizes(crowd?.dexIds ?? []);
  }, [entries, crowd, loadAll, loadSizes]);

  function spec(): CrowdPaint {
    return {
      title: title.trim() || "My Pokémon",
      hidden: crowd?.hidden ?? false,
      crowd: (crowd?.dexIds ?? []).map((dexId, index) => ({
        image: pictureOf(dexId, drawn, crowd?.forms?.[index])[0],
        heightDm: sizes[dexId]?.heightDm ?? 0,
        color: sizes[dexId]?.color,
      })),
      pixelated: sprites,
      scene,
      pileSeed: 7919 * (crowd?.dexIds[0] ?? 1) + shake,
      images: images.current,
      fonts: canvasFonts(),
      painting: null,
      drawLayer: "behind",
    };
  }

  const drawPreview = useEffectEvent(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = posterSize(SHEET_PREVIEW_DPI);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    paintPoster(ctx, style, spec());
  });

  useEffect(() => {
    drawPreview();
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) drawPreview();
    });
    return () => {
      cancelled = true;
    };
  }, [crowd, style, drawn, scene, shake, title, version, sizes]);

  function choose(id: string) {
    setSourceId(id);
    setShake(0);
  }

  async function save() {
    if (!crowd || crowd.dexIds.length === 0 || busy) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      await Promise.all([loadAll(entries), loadSizes(crowd.dexIds)]);
      const size = posterSize(PRINT_DPI);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas");
      paintPoster(ctx, style, spec());
      const page = await jpegPage(canvas);
      downloadPdf(jpegPagesPdf([page], POSTER_PAPER_MM.width, POSTER_PAPER_MM.height), posterFilename(title || "Pokémon"));
      toast.success("Poster saved. Print it on A4 paper.");
    } catch {
      toast.error("The poster could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const total = crowd?.dexIds.length ?? 0;

  return (
    <section className="pk-panel min-w-0" aria-labelledby="poster-heading">
      <h2 id="poster-heading" className="font-display text-3xl leading-tight">
        A4 posters
      </h2>
      <p className="mt-1 text-sm leading-6">Choose who goes on it, then save a PDF and print it on A4 paper.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="grid content-start gap-4">
          <CrowdPicker state={crowdState} label="Who goes on the poster" idPrefix="poster" onChoose={choose} onOwnPick={onOwnPick} />

          <label className="grid gap-1 text-sm font-bold" htmlFor="poster-title">
            Title on the ribbon
            <input
              id="poster-title"
              className="pk-field font-normal"
              value={title}
              maxLength={60}
              autoComplete="off"
              onChange={(event) => setTitles((current) => ({ ...current, [sourceId]: event.target.value }))}
            />
          </label>

          <ChoiceRow
            label="Picture"
            choices={[
              { id: "photo", label: "Group photo" },
              { id: "pile", label: "Pile" },
            ]}
            chosen={style}
            onChoose={(id) => setStyle(id as PosterStyle)}
          />
          <ChoiceRow
            label="Pokémon drawn as"
            choices={[
              { id: "art", label: "Artwork" },
              { id: "shiny", label: "Shiny artwork" },
              { id: "sprites", label: "Game sprites" },
            ]}
            chosen={drawn}
            onChoose={(id) => setDrawn(id as Drawn)}
          />
          <SceneChooser scene={scene} onScene={setPickedScene} />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" className="h-12 px-6 text-base" disabled={busy || total === 0} onClick={() => void save()}>
              {busy ? "Making the poster…" : "Save poster PDF"}
            </Button>
            {style === "pile" ? (
              <Button type="button" variant="outline" className="h-12 px-5 text-base" onClick={() => setShake((count) => count + 1)}>
                Shake the pile
              </Button>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">Print it on A4 paper. Fit to page is fine for a poster.</p>
        </div>

        <figure className="grid content-start justify-items-center gap-2">
          <canvas
            ref={previewRef}
            aria-label={`A4 poster: ${title}`}
            className="h-auto w-full max-w-[360px] bg-white shadow-[4px_4px_0_#16324f]"
          />
          <figcaption className="text-xs leading-5 text-muted-foreground" aria-live="polite">
            {total === 0
              ? "Nobody on this poster yet."
              : loaded < total
                ? `Getting the pictures: ${loaded} of ${total}…`
                : `${total} Pokémon.`}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
