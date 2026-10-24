"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useFavourites } from "@/components/favourites";
import { ChoiceRow, CrowdPicker, useCrowd, type Crowd } from "@/components/poster-crowd";
import { BRAND_FILES, canvasFonts, downloadPdf, jpegPage } from "@/components/sticker/print-kit";
import { useImageCache, type ImageEntry } from "@/components/sticker/use-image-cache";
import { useSpeciesSizes } from "@/components/sticker/use-species-sizes";
import { Button } from "@/components/ui/button";
import { LINE_ART, lineArtPixels, lineMask } from "@/lib/colouring";
import {
  A4_MM,
  pagesOf,
  PER_PAGE,
  POSTER_SIZES,
  posterTiles,
  PRINTER_MARGIN_MM,
  sheetCells,
  type PerPage,
  type PosterSize,
} from "@/lib/colouring-layout";
import { artworkSrc as artworkApi } from "@/lib/artwork-path";
import { artworkSrc } from "@/lib/page-artwork";
import type { KidCard } from "@/lib/kid-cards";
import { paintPoster, type CrowdPaint } from "@/lib/sticker-paint";
import { jpegPagesPdf } from "@/lib/sticker-pdf";

type Named = { id: number; name: string };

/** How the page is laid out: a grid of separate Pokémon, or the posters' group photo or pile. */
type Layout = "grid" | "photo" | "pile";

const SOURCE_KEY = "pokefacts.colouring-source";
/** The Pokémon chosen on this page with search and Surprise me. */
const HERE = "here";
/** A group photo or pile is drawn at most this many pixels in all before it is turned into outlines. */
const MAX_CROWD_PIXELS = 20_000_000;

/** At most this many Pokémon in one PDF. */
const MAX_PICKS = 24;
const LAST_SPECIES = 1025;
/** The last Pokémon with Dream World art (see artwork-styles.ts). */
const LAST_DREAM_WORLD = 649;
/** Dots per inch for a plain sheet and for each page of a poster; the poster is enlarged on top. */
const SHEET_DPI = 300;
const POSTER_DPI = 200;
const PREVIEW_DPI = 40;
/** Line art is worked out at most this many pixels across, which keeps it quick on a phone. */
const MAX_OUTLINE_PX = 2400;

function loadPicture(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A picture would not load."));
    image.src = src;
  });
}

const cutouts = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * A Pokémon as a cut-out to colour: black lines, white inside its shape, clear around it, about `wanted`
 * pixels across. The lines are traced at the picture's own size, where its edges are sharp: official art
 * is 480 pixels, and tracing it blown up gives broken, dotted lines. Dream World art is drawn as vectors,
 * so it is traced at the size it is needed. The traced lines are then enlarged smoothly and kept solid.
 */
function cutoutOf(dexId: number, wanted: number): Promise<HTMLCanvasElement> {
  const size = Math.max(64, Math.min(MAX_OUTLINE_PX, Math.round(wanted / 200) * 200 || 200));
  const key = `${dexId}:${size}`;
  let made = cutouts.get(key);
  if (!made) {
    made = (async () => {
      const dream = dexId <= LAST_DREAM_WORLD;
      const picture = dream
        ? await loadPicture(artworkApi("dream", dexId)).catch(() => loadPicture(artworkSrc(dexId)))
        : await loadPicture(artworkSrc(dexId));
      const naturalWidth = picture.naturalWidth || size;
      const naturalHeight = picture.naturalHeight || size;
      const vector = dream && /\.svg|dream/.test(picture.src);
      const traceSize = vector ? size : Math.min(size, Math.max(naturalWidth, naturalHeight));
      const trace = document.createElement("canvas");
      trace.width = traceSize;
      trace.height = traceSize;
      const ctx = trace.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("This browser cannot draw the sheet.");
      const scale = Math.min(traceSize / naturalWidth, traceSize / naturalHeight);
      const width = naturalWidth * scale;
      const height = naturalHeight * scale;
      ctx.drawImage(picture, (traceSize - width) / 2, (traceSize - height) / 2, width, height);
      const pixels = ctx.getImageData(0, 0, traceSize, traceSize);
      // Lines stay about the same width on paper whatever the size.
      const thicken = Math.max(1, Math.round(traceSize / 900));
      const mask = lineMask(pixels.data, traceSize, traceSize, { ...LINE_ART, thicken });
      const out = new ImageData(traceSize, traceSize);
      for (let at = 0; at < mask.length; at += 1) {
        const solid = (pixels.data[at * 4 + 3] ?? 0) >= 128;
        const ink = mask[at] ? 0 : 255;
        out.data.set([ink, ink, ink, mask[at] || solid ? 255 : 0], at * 4);
      }
      ctx.putImageData(out, 0, 0);
      return traceSize >= size ? trace : crispEnlarged(trace, size);
    })();
    made.catch(() => cutouts.delete(key));
    cutouts.set(key, made);
  }
  return made;
}

/** A cut-out drawn bigger: smoothed, then every pixel made black, white or clear again, so lines stay crisp. */
function crispEnlarged(small: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot draw the sheet.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size);
  const data = pixels.data;
  for (let at = 0; at < data.length; at += 4) {
    const alpha = data[at + 3] ?? 0;
    if (alpha < 128) {
      data[at + 3] = 0;
      continue;
    }
    // Colour here is premultiplied out by the browser; a dark pixel is part of a line.
    const ink = (data[at] ?? 255) < 128 ? 0 : 255;
    data[at] = ink;
    data[at + 1] = ink;
    data[at + 2] = ink;
    data[at + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * Draws one sheet in millimetres on `ctx`: a title in outline letters to colour, the Pokémon in a grid,
 * each with its name, and a footer. `pxPerMm` is how many canvas pixels make a millimetre on paper.
 */
async function drawSheet(ctx: CanvasRenderingContext2D, entries: readonly Named[], perPage: PerPage, pxPerMm: number, heading: string) {
  const fonts = canvasFonts();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_MM.width, A4_MM.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const title = entries.length === 1 && heading === "Colour us in!" ? (entries[0] as Named).name : heading;
  ctx.font = `700 16px ${fonts.display}`;
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = "#000000";
  ctx.strokeText(title, A4_MM.width / 2, 12, A4_MM.width - 24);

  const cells = sheetCells(perPage);
  for (const [index, entry] of entries.entries()) {
    const cell = cells[index];
    if (!cell) continue;
    const outline = await cutoutOf(entry.id, cell.width * pxPerMm);
    ctx.drawImage(outline, cell.x, cell.y, cell.width, cell.height);
    if (perPage > 1) {
      ctx.fillStyle = "#000000";
      ctx.font = `600 5px ${fonts.body}`;
      ctx.fillText(entry.name, cell.x + cell.width / 2, cell.y + cell.height + 1.5, cell.width);
    }
  }
  ctx.fillStyle = "#000000";
  ctx.font = `600 5px ${fonts.body}`;
  const numbers = entries.map((entry) => `No. ${entry.id}`).join("  ·  ");
  ctx.fillText(entries.length === 1 ? `${numbers}  ·  Colour me in!` : numbers, A4_MM.width / 2, A4_MM.height - 19, A4_MM.width - 24);
  ctx.font = `400 3.2px ${fonts.body}`;
  ctx.fillStyle = "#555555";
  ctx.fillText("pokefacts.online · Pokémon belongs to Nintendo, Game Freak and Creatures", A4_MM.width / 2, A4_MM.height - 10);
}

function a4Canvas(dpi: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((A4_MM.width / 25.4) * dpi);
  canvas.height = Math.round((A4_MM.height / 25.4) * dpi);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the sheet.");
  return { canvas, ctx, pxPerMm: dpi / 25.4 };
}

/** A plain A4 sheet. */
async function paintSheet(entries: readonly Named[], perPage: PerPage, dpi: number, heading: string): Promise<HTMLCanvasElement> {
  const { canvas, ctx, pxPerMm } = a4Canvas(dpi);
  ctx.scale(pxPerMm, pxPerMm);
  await drawSheet(ctx, entries, perPage, pxPerMm, heading);
  return canvas;
}

/** The picture a Pokémon is outlined from: Dream World's clean vector art up to No. 649, then official art. */
function colouringPicture(dexId: number): ImageEntry {
  const src = dexId <= LAST_DREAM_WORLD ? artworkApi("dream", dexId) : artworkSrc(dexId);
  return [`colouring:${src}`, src];
}

/**
 * A group photo or a pile, as on the posters, turned into black outlines on white: the Pokémon, the
 * ribbon and its letters are all left to colour in. `dpi` is for one A4 page; `across` enlarges it.
 */
async function paintCrowdOutline(layout: "photo" | "pile", spec: CrowdPaint, dexIds: readonly number[], dpi: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((A4_MM.width / 25.4) * dpi);
  canvas.height = Math.round((A4_MM.height / 25.4) * dpi);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot draw the sheet.");
  // Each Pokémon is drawn at most about half the page across, so that is as big as its cut-out needs to be.
  const wanted = Math.min(MAX_OUTLINE_PX, Math.round(canvas.width * 0.6));
  const images = new Map(spec.images);
  await Promise.all(
    dexIds.map(async (dexId) => {
      images.set(colouringPicture(dexId)[0], await cutoutOf(dexId, wanted).catch(() => null));
    }),
  );
  paintPoster(ctx, layout, { ...spec, images });
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const thicken = Math.max(1, Math.round(canvas.width / 1800));
  const mask = lineMask(pixels.data, canvas.width, canvas.height, { ...LINE_ART, thicken });
  ctx.putImageData(new ImageData(lineArtPixels(mask), canvas.width, canvas.height), 0, 0);
  return canvas;
}

/**
 * The pages of a poster: the sheet enlarged `across` times, one A4 page per part. Each page prints its
 * part inside the printer margins, with a label saying where it goes and corner marks to trim to.
 */
async function paintTiles(
  draw: (ctx: CanvasRenderingContext2D, pxPerMm: number) => Promise<void> | void,
  across: PosterSize,
  dpi: number,
): Promise<HTMLCanvasElement[]> {
  const fonts = canvasFonts();
  const pages: HTMLCanvasElement[] = [];
  for (const tile of posterTiles(across)) {
    const { canvas, ctx, pxPerMm } = a4Canvas(dpi);
    ctx.scale(pxPerMm, pxPerMm);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, A4_MM.width, A4_MM.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(PRINTER_MARGIN_MM, PRINTER_MARGIN_MM, A4_MM.width - PRINTER_MARGIN_MM * 2, A4_MM.height - PRINTER_MARGIN_MM * 2);
    ctx.clip();
    ctx.translate(PRINTER_MARGIN_MM, PRINTER_MARGIN_MM);
    ctx.scale(tile.scale, tile.scale);
    ctx.translate(-tile.source.x, -tile.source.y);
    await draw(ctx, pxPerMm * tile.scale);
    ctx.restore();
    // Trim marks at the corners of the printed part, and where this page goes.
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 0.25;
    const m = PRINTER_MARGIN_MM;
    for (const [x, y] of [
      [m, m],
      [A4_MM.width - m, m],
      [m, A4_MM.height - m],
      [A4_MM.width - m, A4_MM.height - m],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
    }
    ctx.fillStyle = "#777777";
    ctx.font = `400 2.6px ${fonts.body}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Poster page: row ${tile.row + 1}, column ${tile.column + 1} of ${across} × ${across}. Trim the white edge and tape together.`,
      m,
      m / 2,
    );
    pages.push(canvas);
  }
  return pages;
}

/** The sheet's own drawing for a grid page, for paintTiles. */
function gridDrawer(entries: readonly Named[], perPage: PerPage, heading: string) {
  return (ctx: CanvasRenderingContext2D, pxPerMm: number) => drawSheet(ctx, entries, perPage, pxPerMm, heading);
}

function ChoicePills<T extends number>({
  label,
  choices,
  chosen,
  name,
  onChoose,
}: {
  label: string;
  choices: readonly T[];
  chosen: T;
  name: (choice: T) => string;
  onChoose: (choice: T) => void;
}) {
  return (
    <div className="grid gap-1">
      <p className="text-sm font-bold">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {choices.map((choice) => (
          <button key={choice} type="button" className="pk-pill" aria-pressed={choice === chosen} onClick={() => onChoose(choice)}>
            {name(choice)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Colouring sheets: Pokémon as black outlines on A4. Choose who goes on it the same way as a poster (a
 * region, the starters, your own, or Pokémon found here), then a grid of separate Pokémon or the
 * posters' group photo or pile, on one page or blown up across several.
 */
export function ColouringMaker({ playlist, onOwnPick }: { playlist: KidCard; onOwnPick: () => void }) {
  const [ids] = useFavourites();
  const [picked, setPicked] = useState<Named[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Named[]>([]);
  const [layout, setLayout] = useState<Layout>("grid");
  const [perPage, setPerPage] = useState<PerPage>(1);
  const [across, setAcross] = useState<PosterSize>(1);
  const [shake, setShake] = useState(0);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const { images, version, loadAll } = useImageCache();
  const { sizes, loadAll: loadSizes } = useSpeciesSizes();

  const hereCrowd: Crowd = useMemo(
    () => ({ title: "Colour us in!", dexIds: picked.map((item) => item.id), hidden: false }),
    [picked],
  );
  const crowdState = useCrowd(playlist, SOURCE_KEY, HERE, {
    choices: [{ id: HERE, label: "Found here", count: picked.length }],
    crowd: (id) => (id === HERE ? hereCrowd : null),
  });
  const { crowd, sourceId, setSourceId } = crowdState;
  const dexIds = useMemo(() => crowd?.dexIds ?? [], [crowd]);
  const title = (titles[sourceId] ?? crowd?.title ?? "").slice(0, 60) || "Colour us in!";
  const grid = layout === "grid";

  // Names for the grid's labels: known for Pokémon found here, fetched for a region or a playlist.
  const known = useMemo(() => {
    const out: Record<number, string> = { ...names };
    for (const item of picked) out[item.id] = item.name;
    return out;
  }, [names, picked]);
  const missing = dexIds.filter((id) => !known[id]).join(",");
  useEffect(() => {
    if (!grid || !missing) return;
    let cancelled = false;
    const wanted = missing.split(",").map(Number);
    void (async () => {
      for (let start = 0; start < wanted.length; start += 200) {
        const batch = await named(wanted.slice(start, start + 200)).catch(() => []);
        if (cancelled) return;
        setNames((current) => ({ ...current, ...Object.fromEntries(batch.map((item) => [item.id, item.name])) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [grid, missing]);

  const entries: Named[] = useMemo(
    () => dexIds.map((id) => ({ id, name: known[id] ?? `No. ${id}` })),
    [dexIds, known],
  );
  const pages = grid ? pagesOf(entries, perPage) : dexIds.length > 0 ? [entries] : [];
  const firstPage = pages[0];
  const firstKey = firstPage?.map((entry) => `${entry.id}:${entry.name}`).join(",") ?? "";

  // The crowd layouts draw with the posters' painter, so their pictures and sizes load first.
  const pictures = useMemo(() => (grid ? [] : [...BRAND_FILES, ...dexIds.map(colouringPicture)]), [grid, dexIds]);
  useEffect(() => {
    if (grid) return;
    void loadAll(pictures);
    void loadSizes(dexIds);
  }, [grid, pictures, dexIds, loadAll, loadSizes]);

  function crowdSpec(): CrowdPaint {
    return {
      title,
      hidden: crowd?.hidden ?? false,
      crowd: dexIds.map((dexId) => ({
        image: colouringPicture(dexId)[0],
        heightDm: sizes[dexId]?.heightDm ?? 0,
        color: sizes[dexId]?.color,
      })),
      pixelated: false,
      scene: "plain",
      pileSeed: 7919 * (dexIds[0] ?? 1) + shake,
      images: images.current,
      fonts: canvasFonts(),
      painting: null,
      drawLayer: "behind",
    };
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(`/api/catalogue?q=${encodeURIComponent(q)}`)
        .then((response) => response.json() as Promise<{ items?: Named[] }>)
        .then((payload) => {
          if (!cancelled) setResults((payload.items ?? []).filter((item) => item.id <= LAST_SPECIES).slice(0, 8));
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  // The first page, drawn small, so you can see what will print. A poster shows its grid of pages.
  useEffect(() => {
    const holder = preview.current;
    if (!holder || !firstPage) return;
    let cancelled = false;
    const dpi = PREVIEW_DPI * (across > 1 ? 2 : 3);
    const painted = grid
      ? paintSheet(firstPage, perPage, dpi, title)
      : document.fonts.ready.then(() => paintCrowdOutline(layout, crowdSpec(), dexIds, dpi));
    void painted
      .then((canvas) => {
        if (cancelled) return;
        canvas.className = "h-auto w-full max-w-[300px] rounded border-2 border-ink/20 bg-white";
        canvas.setAttribute("aria-label", "The first colouring sheet");
        const frame = document.createElement("div");
        frame.className = "relative";
        frame.append(canvas);
        if (across > 1) {
          // Dashed lines where the poster's pages meet.
          const lines = document.createElement("div");
          lines.className = "pointer-events-none absolute inset-0 grid";
          lines.style.gridTemplateColumns = `repeat(${across}, 1fr)`;
          lines.style.gridTemplateRows = `repeat(${across}, 1fr)`;
          for (let cell = 0; cell < across * across; cell += 1) {
            const part = document.createElement("div");
            part.className = "border border-dashed border-poke-red/70";
            lines.append(part);
          }
          frame.append(lines);
        }
        holder.replaceChildren(frame);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // firstKey stands for firstPage's contents; version and sizes redraw a crowd as its pictures arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, perPage, across, layout, title, shake, version, sizes]);

  async function named(wanted: number[]): Promise<Named[]> {
    if (wanted.length === 0) return [];
    const response = await fetch(`/api/catalogue?pick=${wanted.join(",")}`);
    const payload = (await response.json().catch(() => null)) as { items?: Named[] } | null;
    const byId = new Map((payload?.items ?? []).map((item) => [item.id, item]));
    return wanted.flatMap((id) => (byId.get(id) ? [byId.get(id) as Named] : []));
  }

  function add(items: Named[]) {
    setPicked((current) => {
      const next = [...current];
      for (const item of items) if (!next.some((kept) => kept.id === item.id)) next.push(item);
      return next.slice(0, MAX_PICKS);
    });
  }

  async function surprise(count: number) {
    const draw = new Set<number>();
    while (draw.size < count) draw.add(1 + Math.floor(Math.random() * LAST_SPECIES));
    add(await named([...draw]));
  }

  function choose(id: string) {
    setSourceId(id);
    setShake(0);
  }

  async function save() {
    if (pages.length === 0 || busy) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      const jpegs = [];
      if (grid) {
        for (const page of pages) {
          const canvases =
            across > 1 ? await paintTiles(gridDrawer(page, perPage, title), across, POSTER_DPI) : [await paintSheet(page, perPage, SHEET_DPI, title)];
          for (const canvas of canvases) jpegs.push(await jpegPage(canvas));
        }
      } else {
        await Promise.all([loadAll(pictures), loadSizes(dexIds)]);
        // Big posters are drawn once, as large as a phone can manage, then shared out across the pages.
        const pagePixels = (A4_MM.width / 25.4) * (A4_MM.height / 25.4);
        const dpi = Math.min(SHEET_DPI * across, Math.floor(Math.sqrt(MAX_CROWD_PIXELS / pagePixels)));
        const outline = await paintCrowdOutline(layout, crowdSpec(), dexIds, dpi);
        const canvases =
          across > 1
            ? await paintTiles((ctx) => ctx.drawImage(outline, 0, 0, A4_MM.width, A4_MM.height), across, POSTER_DPI)
            : [outline];
        for (const canvas of canvases) jpegs.push(await jpegPage(canvas));
      }
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pokemon";
      const kind = across > 1 ? `poster-${across}x${across}` : "colouring";
      downloadPdf(jpegPagesPdf(jpegs, A4_MM.width, A4_MM.height), `${kind}-${slug}.pdf`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "The sheets could not be made.");
    } finally {
      setBusy(false);
    }
  }

  const sheets = pages.length;
  const paper = sheets * across * across;
  const total = dexIds.length;
  return (
    <section className="pk-panel grid min-w-0 content-start gap-3" aria-labelledby="colouring-heading">
      <h2 id="colouring-heading" className="font-display text-3xl leading-tight">
        Colouring sheets
      </h2>
      <p className="text-sm leading-6">
        Pokémon as big black outlines to colour in. Choose who goes on it, as a grid or a group photo or pile like the
        posters, on one page or blown up across several. Save a PDF and print it at 100%.
      </p>
      <CrowdPicker state={crowdState} label="Who goes on the colouring sheet" idPrefix="colouring" onChoose={choose} onOwnPick={onOwnPick} />

      {sourceId === HERE ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10 px-4" onClick={() => void surprise(1)}>
              Surprise me
            </Button>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={() => void surprise(grid ? perPage : 6)}>
              Surprise me with {grid && perPage === 1 ? "a page" : grid ? `${perPage}` : "6"}
            </Button>
            {ids.length > 0 ? (
              <Button type="button" variant="outline" className="h-10 px-4" onClick={() => void named([...ids]).then(add)}>
                Add our favourites
              </Button>
            ) : null}
            {picked.length > 0 ? (
              <Button type="button" variant="outline" className="h-10 px-4" onClick={() => setPicked([])}>
                Clear
              </Button>
            ) : null}
          </div>
          <label className="grid gap-1 text-sm font-bold" htmlFor="colouring-search">
            Find a Pokémon
            <input
              id="colouring-search"
              className="pk-field font-normal"
              value={query}
              autoComplete="off"
              placeholder="Pikachu, Eevee, Gengar…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {query.trim().length >= 2 && results.length > 0 ? (
            <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Search results">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl border-2 border-ink/20 bg-white px-2 py-1 text-left font-bold hover:bg-[#fff4c2]"
                    onClick={() => {
                      add([item]);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {picked.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Pokémon to colour">
              {picked.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="pk-pill"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => setPicked((current) => current.filter((kept) => kept.id !== item.id))}
                  >
                    {item.name} ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <label className="grid gap-1 text-sm font-bold" htmlFor="colouring-title">
        Title
        <input
          id="colouring-title"
          className="pk-field font-normal"
          value={title}
          maxLength={60}
          autoComplete="off"
          onChange={(event) => setTitles((current) => ({ ...current, [sourceId]: event.target.value }))}
        />
      </label>
      <ChoiceRow
        label="Layout"
        choices={[
          { id: "grid", label: "Grid" },
          { id: "photo", label: "Group photo" },
          { id: "pile", label: "Pile" },
        ]}
        chosen={layout}
        onChoose={(id) => setLayout(id as Layout)}
      />
      {grid ? (
        <ChoicePills
          label="Pokémon on each page"
          choices={PER_PAGE}
          chosen={perPage}
          name={(choice) => String(choice)}
          onChoose={setPerPage}
        />
      ) : null}
      <ChoicePills
        label="Print size"
        choices={POSTER_SIZES}
        chosen={across}
        name={(choice) => (choice === 1 ? "One A4 page" : `Poster ${choice} × ${choice} pages`)}
        onChoose={setAcross}
      />
      {total > 0 ? (
        <>
          <div ref={preview} className="flex justify-center" />
          <p className="text-xs leading-5 text-muted-foreground" aria-live="polite">
            {total} Pokémon. {sheets === 1 ? "1 sheet" : `${sheets} sheets`}
            {across > 1 ? `, each a poster of ${across * across} A4 pages: ${paper} pages to print.` : "."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" className="h-12 px-6 text-base" disabled={busy} onClick={() => void save()}>
              {busy ? "Drawing…" : across > 1 ? "Save the poster as a PDF" : "Save as a PDF"}
            </Button>
            {layout === "pile" ? (
              <Button type="button" variant="outline" className="h-12 px-5 text-base" onClick={() => setShake((count) => count + 1)}>
                Shake the pile
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">Nobody on this sheet yet.</p>
      )}
    </section>
  );
}
