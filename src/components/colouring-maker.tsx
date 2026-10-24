"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useFavourites } from "@/components/favourites";
import { canvasFonts, downloadPdf, jpegPage } from "@/components/sticker/print-kit";
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
import { artworkSrc } from "@/lib/page-artwork";
import { jpegPagesPdf } from "@/lib/sticker-pdf";

type Named = { id: number; name: string };

/** At most this many Pokémon in one PDF. */
const MAX_PICKS = 24;
const LAST_SPECIES = 1025;
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

const outlines = new Map<string, Promise<HTMLCanvasElement>>();

/** The artwork as black outlines, about `size` pixels across, kept for the next sheet that needs it. */
function outlineOf(dexId: number, wanted: number): Promise<HTMLCanvasElement> {
  const size = Math.max(64, Math.min(MAX_OUTLINE_PX, Math.round(wanted / 200) * 200 || 200));
  const key = `${dexId}:${size}`;
  let made = outlines.get(key);
  if (!made) {
    made = (async () => {
      const picture = await loadPicture(artworkSrc(dexId));
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("This browser cannot draw the sheet.");
      const scale = Math.min(size / picture.naturalWidth, size / picture.naturalHeight);
      const width = picture.naturalWidth * scale;
      const height = picture.naturalHeight * scale;
      ctx.drawImage(picture, (size - width) / 2, (size - height) / 2, width, height);
      const pixels = ctx.getImageData(0, 0, size, size);
      // Lines stay about the same width on paper whatever the size.
      const thicken = Math.max(1, Math.round(size / 900));
      ctx.putImageData(new ImageData(lineArtPixels(lineMask(pixels.data, size, size, { ...LINE_ART, thicken })), size, size), 0, 0);
      return canvas;
    })();
    made.catch(() => outlines.delete(key));
    outlines.set(key, made);
  }
  return made;
}

/**
 * Draws one sheet in millimetres on `ctx`: a title in outline letters to colour, the Pokémon in a grid,
 * each with its name, and a footer. `pxPerMm` is how many canvas pixels make a millimetre on paper.
 */
async function drawSheet(ctx: CanvasRenderingContext2D, entries: readonly Named[], perPage: PerPage, pxPerMm: number) {
  const fonts = canvasFonts();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_MM.width, A4_MM.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const title = entries.length === 1 ? (entries[0] as Named).name : "Colour us in!";
  ctx.font = `700 16px ${fonts.display}`;
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = "#000000";
  ctx.strokeText(title, A4_MM.width / 2, 12, A4_MM.width - 24);

  const cells = sheetCells(perPage);
  for (const [index, entry] of entries.entries()) {
    const cell = cells[index];
    if (!cell) continue;
    const outline = await outlineOf(entry.id, cell.width * pxPerMm);
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
async function paintSheet(entries: readonly Named[], perPage: PerPage, dpi: number): Promise<HTMLCanvasElement> {
  const { canvas, ctx, pxPerMm } = a4Canvas(dpi);
  ctx.scale(pxPerMm, pxPerMm);
  await drawSheet(ctx, entries, perPage, pxPerMm);
  return canvas;
}

/**
 * The pages of a poster: the sheet enlarged `across` times, one A4 page per part. Each page prints its
 * part inside the printer margins, with a label saying where it goes and corner marks to trim to.
 */
async function paintPoster(entries: readonly Named[], perPage: PerPage, across: PosterSize, dpi: number): Promise<HTMLCanvasElement[]> {
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
    await drawSheet(ctx, entries, perPage, pxPerMm * tile.scale);
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

/** Colouring sheets: Pokémon as black outlines on A4, one or several to a page, or blown up into a poster. */
export function ColouringMaker() {
  const [ids] = useFavourites();
  const [picked, setPicked] = useState<Named[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Named[]>([]);
  const [perPage, setPerPage] = useState<PerPage>(1);
  const [across, setAcross] = useState<PosterSize>(1);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const pages = pagesOf(picked, perPage);
  const firstPage = pages[0];
  const firstKey = firstPage?.map((entry) => entry.id).join(",") ?? "";

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
    void paintSheet(firstPage, perPage, PREVIEW_DPI * (across > 1 ? 2 : 3))
      .then((canvas) => {
        if (cancelled) return;
        canvas.className = "h-auto w-full max-w-[300px] rounded border-2 border-ink/20 bg-white";
        canvas.setAttribute("aria-label", "The first colouring sheet");
        const frame = document.createElement("div");
        frame.className = "relative";
        frame.append(canvas);
        if (across > 1) {
          // Dashed lines where the poster's pages meet.
          const grid = document.createElement("div");
          grid.className = "pointer-events-none absolute inset-0 grid";
          grid.style.gridTemplateColumns = `repeat(${across}, 1fr)`;
          grid.style.gridTemplateRows = `repeat(${across}, 1fr)`;
          for (let cell = 0; cell < across * across; cell += 1) {
            const part = document.createElement("div");
            part.className = "border border-dashed border-poke-red/70";
            grid.append(part);
          }
          frame.append(grid);
        }
        holder.replaceChildren(frame);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // firstKey stands for firstPage's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, perPage, across]);

  async function named(dexIds: number[]): Promise<Named[]> {
    if (dexIds.length === 0) return [];
    const response = await fetch(`/api/catalogue?pick=${dexIds.join(",")}`);
    const payload = (await response.json().catch(() => null)) as { items?: Named[] } | null;
    const byId = new Map((payload?.items ?? []).map((item) => [item.id, item]));
    return dexIds.flatMap((id) => (byId.get(id) ? [byId.get(id) as Named] : []));
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

  async function save() {
    if (pages.length === 0) return;
    setBusy(true);
    try {
      const jpegs = [];
      for (const page of pages) {
        const canvases = across > 1 ? await paintPoster(page, perPage, across, POSTER_DPI) : [await paintSheet(page, perPage, SHEET_DPI)];
        for (const canvas of canvases) jpegs.push(await jpegPage(canvas));
      }
      const first = picked[0] as Named;
      const name = picked.length === 1 ? first.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "pokemon";
      const kind = across > 1 ? `poster-${across}x${across}` : "colouring";
      downloadPdf(jpegPagesPdf(jpegs, A4_MM.width, A4_MM.height), `${kind}-${name}.pdf`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "The sheets could not be made.");
    } finally {
      setBusy(false);
    }
  }

  const sheets = pages.length;
  const paper = sheets * across * across;
  return (
    <section className="pk-panel grid min-w-0 content-start gap-3" aria-labelledby="colouring-heading">
      <h2 id="colouring-heading" className="font-display text-3xl leading-tight">
        Colouring sheets
      </h2>
      <p className="text-sm leading-6">
        Pokémon as big black outlines to colour in, one or several to a page, or blown up into a poster across
        several A4 pages. Save a PDF and print it at 100%.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10 px-4" onClick={() => void surprise(1)}>
          Surprise me
        </Button>
        <Button type="button" variant="outline" className="h-10 px-4" onClick={() => void surprise(perPage)}>
          Surprise me with {perPage === 1 ? "a page" : `${perPage}`}
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
      <ChoicePills
        label="Pokémon on each page"
        choices={PER_PAGE}
        chosen={perPage}
        name={(choice) => String(choice)}
        onChoose={setPerPage}
      />
      <ChoicePills
        label="Print size"
        choices={POSTER_SIZES}
        chosen={across}
        name={(choice) => (choice === 1 ? "One A4 page" : `Poster ${choice} × ${choice} pages`)}
        onChoose={setAcross}
      />
      {picked.length > 0 ? (
        <>
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
          <div ref={preview} className="flex justify-center" />
          <p className="text-xs leading-5 text-muted-foreground">
            {sheets === 1 ? "1 sheet" : `${sheets} sheets`}
            {across > 1 ? `, each a poster of ${across * across} A4 pages: ${paper} pages to print.` : "."}
          </p>
          <Button type="button" className="h-12 px-6 text-base" disabled={busy} onClick={() => void save()}>
            {busy ? "Drawing…" : across > 1 ? "Save the poster as a PDF" : "Save as a PDF"}
          </Button>
        </>
      ) : null}
    </section>
  );
}
