"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BRAND_FILES, canvasFonts, downloadPdf, jpegPage } from "@/components/sticker/print-kit";
import { useImageCache, type ImageEntry } from "@/components/sticker/use-image-cache";
import { useSpeciesSizes } from "@/components/sticker/use-species-sizes";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/components/use-stored-state";
import { CATALOGUE_PICKS_KEY, LAST_SPECIES_ID, readCataloguePicks, serializeCataloguePicks } from "@/lib/catalogue-picks";
import type { KidCard } from "@/lib/kid-cards";
import { artworkSrc } from "@/lib/page-artwork";
import { posterCollection, REGION_POSTERS, STARTER_POSTERS, type PosterCollection } from "@/lib/poster-collections";
import { hidesNames, monsFor } from "@/lib/sticker-cover";
import { mmToPx, posterFilename, PRINT_DPI, SHEET_PREVIEW_DPI } from "@/lib/sticker-layout";
import { paintPoster, type CrowdPaint } from "@/lib/sticker-paint";
import { jpegPagesPdf } from "@/lib/sticker-pdf";
import { POSTER_PAPER_MM, type PosterStyle } from "@/lib/sticker-styles";

const SOURCE_KEY = "pokefacts.poster-source";
const MINE = "mine";
const PLAYLIST = "playlist";

const keepSource = (raw: string | null) => raw || "region-kanto";
const writeSource = (id: string) => id;

/** Who goes on the poster, what its ribbon says, and whether they are shown as silhouettes. */
type Crowd = { title: string; dexIds: readonly number[]; hidden: boolean };

function posterSize(dpi: number) {
  return { width: mmToPx(POSTER_PAPER_MM.width, dpi), height: mmToPx(POSTER_PAPER_MM.height, dpi) };
}

function pictureOf(dexId: number, sprites: boolean): ImageEntry {
  const src = sprites ? `/sprites/${dexId}.png` : artworkSrc(dexId);
  return [`picture:${src}`, src];
}

/** Your Make your own picks, as national dex numbers. Regional forms stand in as their species. */
async function pickedSpecies(ids: readonly number[]): Promise<number[]> {
  const forms = ids.filter((id) => id > LAST_SPECIES_ID);
  if (forms.length === 0) return [...ids];
  const response = await fetch(`/api/catalogue?pick=${forms.join(",")}`);
  const payload = (await response.json().catch(() => null)) as { items?: Array<{ id: number; speciesId?: number }> } | null;
  const species = new Map((payload?.items ?? []).map((item) => [item.id, item.speciesId ?? 0]));
  return ids.flatMap((id) => {
    const dexId = id > LAST_SPECIES_ID ? (species.get(id) ?? 0) : id;
    return dexId > 0 && dexId <= LAST_SPECIES_ID ? [dexId] : [];
  });
}

function ChoiceRow({
  label,
  choices,
  chosen,
  onChoose,
}: {
  label: string;
  choices: ReadonlyArray<{ id: string; label: string; count?: number }>;
  chosen: string;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <p className="pk-kicker">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={chosen === choice.id}
            className="pk-chip"
            onClick={() => onChoose(choice.id)}
          >
            {choice.label}
            {choice.count ? <span className="ml-1 opacity-70">{choice.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A4 posters, on their own: pick who goes on it (a region, the starters, your picks or a playlist),
 * a group photo or a pile, artwork or game sprites, a title, then save a PDF to print.
 */
export function PosterMaker({ playlist, onOwnPick }: { playlist: KidCard; onOwnPick: () => void }) {
  const [picks] = useStoredState(CATALOGUE_PICKS_KEY, readCataloguePicks, serializeCataloguePicks);
  const [sourceId, setSourceId] = useStoredState(SOURCE_KEY, keepSource, writeSource);
  const [style, setStyle] = useState<PosterStyle>("photo");
  const [sprites, setSprites] = useState(false);
  const [shake, setShake] = useState(0);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const { images, version, loadAll } = useImageCache();
  const { sizes, loadAll: loadSizes } = useSpeciesSizes();

  const pickIds = picks.ids.join(",");
  useEffect(() => {
    if (sourceId !== MINE || !pickIds) return;
    let cancelled = false;
    void pickedSpecies(pickIds.split(",").map(Number)).then((ids) => {
      if (!cancelled) setMine(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId, pickIds]);

  const crowd: Crowd | null = useMemo(() => {
    if (sourceId === PLAYLIST) {
      const dexIds = monsFor(playlist).flatMap((mon) => (mon.dexId ? [mon.dexId] : []));
      return { title: playlist.title, dexIds, hidden: hidesNames(playlist) };
    }
    if (sourceId === MINE) {
      if (picks.ids.length === 0) return null;
      return { title: picks.title.trim() || "My Pokémon", dexIds: mine ?? [], hidden: false };
    }
    const collection: PosterCollection = posterCollection(sourceId) ?? REGION_POSTERS[0]!;
    return { title: collection.title, dexIds: collection.dexIds, hidden: false };
  }, [sourceId, playlist, picks, mine]);

  const title = (titles[sourceId] ?? crowd?.title ?? "").slice(0, 60);
  const entries = useMemo(
    () => [...BRAND_FILES, ...(crowd?.dexIds ?? []).map((dexId) => pictureOf(dexId, sprites))],
    [crowd, sprites],
  );
  const loaded = (crowd?.dexIds ?? []).filter((dexId) => images.current.has(pictureOf(dexId, sprites)[0])).length;

  useEffect(() => {
    void loadAll(entries);
    void loadSizes(crowd?.dexIds ?? []);
  }, [entries, crowd, loadAll, loadSizes]);

  function spec(): CrowdPaint {
    return {
      title: title.trim() || "My Pokémon",
      hidden: crowd?.hidden ?? false,
      crowd: (crowd?.dexIds ?? []).map((dexId) => ({
        image: pictureOf(dexId, sprites)[0],
        heightDm: sizes[dexId]?.heightDm ?? 0,
        color: sizes[dexId]?.color,
      })),
      pixelated: sprites,
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
  }, [crowd, style, sprites, shake, title, version, sizes]);

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
  const yours = [
    ...(picks.ids.length > 0 ? [{ id: MINE, label: "My picks", count: picks.ids.length }] : []),
    { id: PLAYLIST, label: playlist.rangeLabel || playlist.title },
  ];

  return (
    <section className="pk-panel min-w-0" aria-labelledby="poster-heading">
      <h2 id="poster-heading" className="font-display text-3xl leading-tight">
        A4 posters
      </h2>
      <p className="mt-1 text-sm leading-6">Choose who goes on it, then save a PDF and print it on A4 paper.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="grid content-start gap-4">
          <ChoiceRow
            label="Every Pokémon from"
            choices={REGION_POSTERS.map((item) => ({ id: item.id, label: item.label, count: item.dexIds.length }))}
            chosen={sourceId}
            onChoose={choose}
          />
          <ChoiceRow
            label="Starter Pokémon"
            choices={STARTER_POSTERS.map((item) => ({ id: item.id, label: item.label }))}
            chosen={sourceId}
            onChoose={choose}
          />
          <ChoiceRow label="Your own" choices={yours} chosen={sourceId} onChoose={choose} />
          {picks.ids.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Pick Pokémon in{" "}
              <button type="button" className="font-bold underline" onClick={onOwnPick}>
                Make your own
              </button>{" "}
              to put your own choice on a poster.
            </p>
          ) : null}

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
              { id: "sprites", label: "Game sprites" },
            ]}
            chosen={sprites ? "sprites" : "art"}
            onChoose={(id) => setSprites(id === "sprites")}
          />

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
