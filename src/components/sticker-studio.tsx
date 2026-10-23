"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DecorateStep, type Tool } from "@/components/sticker/decorate-step";
import { PrintStep, type PrintKind, type PrintScope } from "@/components/sticker/print-step";
import { StyleStep } from "@/components/sticker/style-step";
import { useCoverStore } from "@/components/sticker/use-cover-store";
import { useHeroEntries } from "@/components/sticker/use-hero-entries";
import { useImageCache, type ImageEntry } from "@/components/sticker/use-image-cache";
import { usePaintLayer, type Point } from "@/components/sticker/use-paint-layer";
import { useSpeciesSizes } from "@/components/sticker/use-species-sizes";
import { useUndoHistory } from "@/components/sticker/use-undo-history";
import { useStoredState } from "@/components/use-stored-state";
import { Button } from "@/components/ui/button";
import { BRAND_IMAGE_KEY, BRAND_LOGO } from "@/lib/brand-logo";
import type { KidCard } from "@/lib/kid-cards";
import { APP_NAME } from "@/lib/site";
import {
  autoCover,
  cardCountLabel,
  cardRangeText,
  crowdFor,
  heroInfo,
  heroMon,
  hidesNames,
  linesFor,
  monsFor,
  pictureFor,
  suggestedCover,
  type StickerMon,
} from "@/lib/sticker-cover";
import {
  COVER_STYLES,
  PREVIEW_DPI,
  PRINT_DPI,
  SHEET_PREVIEW_DPI,
  STICKER_PAPER_KEY,
  cardPixelSize,
  cardsPerSheet,
  mmToPx,
  nameListPlan,
  pagePixelSize,
  paperId,
  posterFilename,
  sheetSlots,
  showsNameList,
  stickerFilename,
  type CoverDraft,
  type CoverStyle,
  type PaperId,
} from "@/lib/sticker-layout";
import { paintCard, paintPoster, paintSheet, type CardPaint } from "@/lib/sticker-paint";
import { jpegPagesPdf } from "@/lib/sticker-pdf";
import { pileSeed } from "@/lib/sticker-pile";
import { POSTER_PAPER_MM, type PosterStyle } from "@/lib/sticker-styles";

type Step = "style" | "decorate" | "print";

const STEPS: { id: Step; label: string }[] = [
  { id: "style", label: "Style" },
  { id: "decorate", label: "Decorate" },
  { id: "print", label: "Print" },
];

const JPEG_QUALITY = 0.93;
const BRAND_FILES = [
  [BRAND_IMAGE_KEY.compact, BRAND_LOGO.compact],
  [BRAND_IMAGE_KEY.vertical, BRAND_LOGO.vertical],
  [BRAND_IMAGE_KEY.horizontal, BRAND_LOGO.horizontal],
] as const satisfies readonly ImageEntry[];

const parsePaper = (raw: string | null): PaperId => paperId(raw);
const writePaper = (paper: PaperId): string => paper;

function canvasFamily(variable: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const first = raw.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || fallback;
}

function fonts() {
  return {
    display: canvasFamily("--font-fredoka", "Fredoka, sans-serif"),
    body: canvasFamily("--font-nunito", "Nunito, sans-serif"),
  };
}

function pointOn(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

function trackPointer(pointerId: number, onMove: (event: PointerEvent) => void, onEnd: () => void) {
  function move(event: PointerEvent) {
    if (event.pointerId === pointerId) onMove(event);
  }
  function end(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    stop();
    onEnd();
  }
  function stop() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  return stop;
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function pictureKey(mon: StickerMon, sprites: boolean): string {
  return `picture:${pictureFor(mon, sprites)}`;
}

function usesCrowd(style: CoverStyle): boolean {
  return style === "photo" || style === "pile";
}

/** Who appears on a card's front: its crowd, or its star. */
function frontMons(item: KidCard, cover: CoverDraft): StickerMon[] {
  const mons = monsFor(item);
  if (usesCrowd(cover.style)) return crowdFor(mons, cover);
  const star = heroMon(mons, cover);
  return star ? [star] : [];
}

/** Every picture a card's faces need: everyone on the front, and the drawing. */
function picturesFor(item: KidCard, cover: CoverDraft): ImageEntry[] {
  const entries: ImageEntry[] = frontMons(item, cover).map((mon) => [pictureKey(mon, cover.sprites), pictureFor(mon, cover.sprites)]);
  if (cover.painting) entries.push([cover.painting, cover.painting]);
  return entries;
}

function posterPixelSize(dpi: number): { width: number; height: number } {
  return { width: mmToPx(POSTER_PAPER_MM.width, dpi), height: mmToPx(POSTER_PAPER_MM.height, dpi) };
}

function dexIds(mons: readonly StickerMon[]): number[] {
  return mons.flatMap((mon) => (mon.dexId ? [mon.dexId] : []));
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  // iPad Safari runs out of canvas memory on a long PDF unless finished canvases are emptied.
  canvas.width = 0;
  canvas.height = 0;
}

export function StickerStudio({
  card,
  cards = [],
  start = "stickers",
  onClose,
}: {
  card: KidCard;
  cards?: KidCard[];
  /** "poster" opens straight on the A4 poster in the Print step. */
  start?: PrintKind;
  onClose: () => void;
}) {
  // The studio is opened for one card and its playlist, so the list of cards is read once.
  const [roster] = useState(() => (cards.some((item) => item.id === card.id) ? cards : [card, ...cards]));
  const [focusId, setFocusId] = useState(card.id);
  const focus = roster.find((item) => item.id === focusId) ?? card;
  const store = useCoverStore(roster);
  const cover = store.covers[focus.id] ?? suggestedCover(focus);
  const mons = useMemo(() => monsFor(focus), [focus]);
  const hidden = hidesNames(focus);
  const lines = useMemo(() => linesFor(focus), [focus]);

  const [step, setStep] = useState<Step>(start === "poster" ? "print" : "style");
  const [face, setFace] = useState<"front" | "back">("front");
  const [tool, setTool] = useState<Tool>("pictures");
  const [brush, setBrush] = useState("#e10600");
  const [brushSize, setBrushSize] = useState(2.6);
  const [paper, setPaper] = useStoredState(STICKER_PAPER_KEY, parsePaper, writePaper);
  const [scope, setScope] = useState<PrintScope>(roster.length > 1 ? "all" : "card");
  const [sheetPage, setSheetPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [strokes, setStrokes] = useState(0);
  const [making, setMaking] = useState<PrintKind>(start);
  const [posterPick, setPosterPick] = useState<PosterStyle | null>(null);
  // A poster is a group photo or a pile. Cards with another front start on the group photo.
  const posterStyle: PosterStyle = posterPick ?? (cover.style === "pile" ? "pile" : "photo");
  const posterCover = useMemo(() => ({ ...cover, style: posterStyle }), [cover, posterStyle]);
  const makingPoster = step === "print" && making === "poster";

  const history = useUndoHistory<CoverDraft>();
  const { images, version, loadAll: loadImages, put: putImage } = useImageCache();
  const { entries: heroEntries, loadAll: loadHeroes } = useHeroEntries();
  const { sizes, loadAll: loadSizes } = useSpeciesSizes();
  const paint = usePaintLayer();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const thumbs = useRef(new Map<CoverStyle, HTMLCanvasElement>());
  const dragStop = useRef<(() => void) | null>(null);

  const preview = cardPixelSize(PREVIEW_DPI);
  const printed = useMemo(() => (scope === "all" ? roster : [focus]), [scope, roster, focus]);
  const perSheet = cardsPerSheet(paper);
  const pages = Math.max(1, Math.ceil(printed.length / perSheet));
  const page = Math.min(sheetPage, pages - 1);
  const pageCards = printed.slice(page * perSheet, page * perSheet + perSheet);
  const shown = useMemo(() => (step === "print" ? printed : [focus]), [step, printed, focus]);

  const needed = useMemo(() => {
    const entries: ImageEntry[] = [...BRAND_FILES];
    for (const item of shown) entries.push(...picturesFor(item, store.covers[item.id] ?? suggestedCover(item)));
    // The style thumbnails show every look at once, so they need the crowd and the star.
    if (step === "style") {
      for (const style of COVER_STYLES) entries.push(...picturesFor(focus, { ...cover, style }));
    }
    if (makingPoster) entries.push(...picturesFor(focus, posterCover));
    return entries;
  }, [shown, store.covers, step, focus, cover, makingPoster, posterCover]);

  useEffect(() => {
    void loadImages(needed);
  }, [needed, loadImages]);

  useEffect(() => {
    void loadSizes(dexIds(shown.flatMap((item) => monsFor(item))));
    const stars = shown.flatMap((item) => {
      if (hidesNames(item)) return [];
      const star = heroMon(monsFor(item), store.covers[item.id] ?? suggestedCover(item));
      return star?.dexId ? [star.dexId] : [];
    });
    void loadHeroes(stars);
  }, [shown, store.covers, loadSizes, loadHeroes]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      dragStop.current?.();
    };
  }, []);

  function specFor(item: KidCard, itemCover: CoverDraft, live: CanvasImageSource | null): CardPaint {
    const pictures = images.current;
    const itemMons = monsFor(item);
    const itemHidden = hidesNames(item);
    const itemLines = linesFor(item);
    const star = heroMon(itemMons, itemCover);
    return {
      style: itemCover.style,
      kind: item.kind,
      title: itemCover.title,
      countLabel: cardCountLabel(item),
      rangeText: cardRangeText(item),
      backText: itemCover.backText,
      backMode: itemCover.backMode,
      showNames: showsNameList(itemLines, itemCover.backMode, itemHidden),
      lines: itemLines,
      owner: itemCover.owner,
      hidden: itemHidden,
      crowd: crowdFor(itemMons, itemCover).map((mon) => ({
        image: pictureKey(mon, itemCover.sprites),
        heightDm: mon.dexId ? (sizes[mon.dexId]?.heightDm ?? 0) : 0,
        color: mon.dexId ? sizes[mon.dexId]?.color : undefined,
      })),
      pixelated: itemCover.sprites,
      pileSeed: pileSeed(item.id) + itemCover.pileSeed,
      images: pictures,
      fonts: fonts(),
      painting: live ?? (itemCover.painting ? (pictures.get(itemCover.painting) ?? null) : null),
      drawLayer: itemCover.drawLayer,
      hero: star
        ? {
            image: pictures.get(pictureKey(star, itemCover.sprites)) ?? null,
            info: heroInfo(star, itemHidden, star.dexId ? heroEntries[star.dexId] : null),
          }
        : null,
    };
  }

  function renderFaces(items: readonly KidCard[], dpi: number): HTMLCanvasElement[] {
    const size = cardPixelSize(dpi);
    return items.flatMap((item) => {
      const spec = specFor(item, store.covers[item.id] ?? suggestedCover(item), null);
      return (["front", "back"] as const).map((which) => {
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (ctx) paintCard(ctx, which, spec);
        return canvas;
      });
    });
  }

  const drawPreviews = useEffectEvent(() => {
    const live = paint.drawing.current ? paint.surface.current : null;
    const ctx = previewRef.current?.getContext("2d");
    if (ctx) paintCard(ctx, face, specFor(focus, cover, live));
    if (step === "style") {
      for (const style of COVER_STYLES) {
        const thumb = thumbs.current.get(style)?.getContext("2d");
        if (thumb) paintCard(thumb, "front", specFor(focus, { ...cover, style }, null));
      }
    }
    const sheet = sheetRef.current;
    const sheetCtx = sheet?.getContext("2d");
    if (makingPoster && sheet && sheetCtx) {
      const size = posterPixelSize(SHEET_PREVIEW_DPI);
      if (sheet.width !== size.width) sheet.width = size.width;
      if (sheet.height !== size.height) sheet.height = size.height;
      paintPoster(sheetCtx, posterStyle, specFor(focus, posterCover, null));
    } else if (step === "print" && sheet && sheetCtx) {
      const size = pagePixelSize(paper, SHEET_PREVIEW_DPI);
      if (sheet.width !== size.width) sheet.width = size.width;
      if (sheet.height !== size.height) sheet.height = size.height;
      const faces = renderFaces(pageCards, SHEET_PREVIEW_DPI);
      paintSheet(sheetCtx, {
        paper,
        dpi: SHEET_PREVIEW_DPI,
        images: faces,
        labels: pageCards.map((item, index) => ({
          number: page * perSheet + index + 1,
          total: printed.length,
          title: item.rangeLabel,
        })),
        fonts: fonts(),
        logo: images.current.get(BRAND_IMAGE_KEY.compact),
      });
      faces.forEach(releaseCanvas);
    }
  });

  useEffect(() => {
    drawPreviews();
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) drawPreviews();
    });
    return () => {
      cancelled = true;
    };
  }, [cover, focus, step, face, version, heroEntries, sizes, strokes, paper, scope, sheetPage, store.covers]);

  function change(next: (current: CoverDraft) => CoverDraft, remember = true) {
    if (remember) history.push(cover);
    store.update(focus.id, next);
  }

  function undo() {
    const previous = history.undo(cover);
    if (previous) store.update(focus.id, () => previous);
  }

  function redo() {
    const next = history.redo(cover);
    if (next) store.update(focus.id, () => next);
  }

  function chooseCard(id: string) {
    if (id === focus.id) return;
    setFocusId(id);
    setFace("front");
    history.reset();
    const index = scope === "all" ? roster.findIndex((item) => item.id === id) : -1;
    if (index >= 0) setSheetPage(Math.floor(index / perSheet));
  }

  function startAgain() {
    if (!window.confirm("Start this card again? Its picture choices and drawing will be cleared.")) return;
    change((current) => ({ ...suggestedCover(focus), style: current.style, owner: current.owner, sprites: current.sprites }));
  }

  function onPreviewPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || step !== "decorate" || face !== "front" || tool !== "draw") return;
    const base = cover.painting ? (images.current.get(cover.painting) ?? null) : null;
    if (cover.painting && !base) {
      toast("The drawing is still loading. Try again in a moment.");
      return;
    }
    history.push(cover);
    paint.begin(base);
    let last = pointOn(event.currentTarget, event);
    paint.stroke(last, last, brush, brushSize);
    setStrokes((count) => count + 1);
    dragStop.current?.();
    dragStop.current = trackPointer(
      event.pointerId,
      (move) => {
        const canvas = previewRef.current;
        if (!canvas) return;
        const next = pointOn(canvas, move);
        paint.stroke(last, next, brush, brushSize);
        last = next;
        setStrokes((count) => count + 1);
      },
      () => {
        const url = paint.finish();
        if (url && paint.surface.current) putImage(url, paint.surface.current);
        store.update(focus.id, (current) => ({ ...current, painting: url }));
      },
    );
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
    if (event.key === "Escape") {
      if (!busy && !typing) onClose();
      return;
    }
    if (typing) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      if (key === "y" || event.shiftKey) redo();
      else undo();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  async function savePdf() {
    const items = printed;
    setBusy("Getting the pictures ready…");
    try {
      await document.fonts.ready;
      const covers = items.map((item) => store.covers[item.id] ?? suggestedCover(item));
      await Promise.all([
        loadImages([...BRAND_FILES, ...items.flatMap((item, index) => picturesFor(item, covers[index] ?? suggestedCover(item)))]),
        loadSizes(dexIds(items.flatMap((item) => monsFor(item)))),
        loadHeroes(
          items.flatMap((item, index) => {
            const star = hidesNames(item) ? undefined : heroMon(monsFor(item), covers[index] ?? suggestedCover(item));
            return star?.dexId ? [star.dexId] : [];
          }),
        ),
      ]);
      const layout = sheetSlots(paper);
      const pixels = pagePixelSize(paper, PRINT_DPI);
      const sheets = [];
      for (let start = 0, number = 1; start < items.length; start += perSheet, number += 1) {
        setBusy(`Making sheet ${number} of ${Math.ceil(items.length / perSheet)}…`);
        const group = items.slice(start, start + perSheet);
        const sheet = document.createElement("canvas");
        sheet.width = pixels.width;
        sheet.height = pixels.height;
        const ctx = sheet.getContext("2d");
        if (!ctx) throw new Error("No canvas");
        const faces = renderFaces(group, PRINT_DPI);
        paintSheet(ctx, {
          paper,
          dpi: PRINT_DPI,
          images: faces,
          labels: group.map((item, index) => ({ number: start + index + 1, total: items.length, title: item.rangeLabel })),
          fonts: fonts(),
          logo: images.current.get(BRAND_IMAGE_KEY.compact),
        });
        faces.forEach(releaseCanvas);
        const blob = await new Promise<Blob | null>((resolve) => sheet.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
        releaseCanvas(sheet);
        if (!blob) throw new Error("No JPEG");
        sheets.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pixelWidth: pixels.width, pixelHeight: pixels.height });
      }
      downloadPdf(
        jpegPagesPdf(sheets, layout.width, layout.height),
        stickerFilename(items.length > 1 ? `${APP_NAME} cards` : cover.title, paper),
      );
      toast.success(`PDF saved${sheets.length > 1 ? ` with ${sheets.length} sheets` : ""}. Print it at 100% size, not Fit to page.`);
    } catch {
      toast.error("The PDF could not be saved. Try again, or print fewer cards at once.");
    } finally {
      setBusy(null);
    }
  }

  async function savePoster() {
    setBusy("Making the poster…");
    try {
      await document.fonts.ready;
      await Promise.all([loadImages([...BRAND_FILES, ...picturesFor(focus, posterCover)]), loadSizes(dexIds(mons))]);
      const pixels = posterPixelSize(PRINT_DPI);
      const canvas = document.createElement("canvas");
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas");
      paintPoster(ctx, posterStyle, specFor(focus, posterCover, null));
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      releaseCanvas(canvas);
      if (!blob) throw new Error("No JPEG");
      const page = { jpeg: new Uint8Array(await blob.arrayBuffer()), pixelWidth: pixels.width, pixelHeight: pixels.height };
      downloadPdf(jpegPagesPdf([page], POSTER_PAPER_MM.width, POSTER_PAPER_MM.height), posterFilename(cover.title));
      toast.success("Poster saved. Print it on A4 paper.");
    } catch {
      toast.error("The poster could not be saved. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div className="pk-studio fixed inset-0 z-50 overflow-y-auto bg-ink/45 p-2 sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticker-heading"
        tabIndex={-1}
        className="pk-studio-panel pk-card mx-auto w-full max-w-6xl bg-cream px-3 py-4 outline-none sm:px-6 sm:py-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="sticker-heading" className="font-display text-3xl leading-tight">
              Make stickers
            </h2>
            <p className="mt-1 text-sm leading-6">A front and a back for {focus.rangeLabel}. Print them and stick them on the Yoto card.</p>
          </div>
          <Button type="button" variant="outline" className="h-11 shrink-0 px-4" onClick={onClose}>
            Done
          </Button>
        </div>

        {roster.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Card to make">
            {roster.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === focus.id}
                className="pk-chip shrink-0"
                onClick={() => chooseCard(item.id)}
              >
                {item.rangeLabel}
              </button>
            ))}
          </div>
        ) : null}

        <nav className="mt-4 grid grid-cols-3 gap-2" aria-label="Steps">
          {STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="pk-studio-step"
              aria-current={item.id === step ? "step" : undefined}
              onClick={() => {
                setStep(item.id);
                setFace("front");
              }}
            >
              <span className="pk-studio-step-number" aria-hidden="true">
                {index + 1}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        {store.saveFailed ? (
          <p className="mt-3 rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm leading-6" role="status">
            This browser is full, so changes to this card will not be kept after you close it. Printing still works.
          </p>
        ) : null}

        <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="grid gap-3 lg:sticky lg:top-4">
            <canvas
              ref={previewRef}
              width={preview.width}
              height={preview.height}
              aria-label={
                face === "back"
                  ? "Back of the card"
                  : step === "decorate" && tool === "draw"
                    ? "Front of the card. Draw on it."
                    : "Front of the card"
              }
              className="pk-card-preview mx-auto h-auto w-full max-w-80 touch-none"
              style={{ borderRadius: "5.9% / 3.7%" }}
              onPointerDown={onPreviewPointerDown}
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setFace(face === "front" ? "back" : "front")}>
                {face === "front" ? "Turn it over" : "Show the front"}
              </Button>
              <Button type="button" variant="outline" className="h-11 px-4" disabled={!history.canUndo} onClick={undo}>
                Undo
              </Button>
              <Button type="button" variant="outline" className="h-11 px-4" disabled={!history.canRedo} onClick={redo}>
                Redo
              </Button>
            </div>
          </div>

          <div className="min-w-0">
            {step === "style" ? (
              <StyleStep
                style={cover.style}
                sprites={cover.sprites}
                title={cover.title}
                owner={cover.owner}
                thumbRef={(style) => (canvas) => {
                  if (canvas) thumbs.current.set(style, canvas);
                  else thumbs.current.delete(style);
                }}
                onStyle={(style) => {
                  if (style !== cover.style) change((current) => ({ ...current, style }));
                }}
                onSprites={(sprites) => {
                  if (sprites !== cover.sprites) change((current) => ({ ...current, sprites }));
                }}
                onTitle={(title) => change((current) => ({ ...current, title }), false)}
                onOwner={(owner) => change((current) => ({ ...current, owner }), false)}
                onTextFocus={() => history.push(cover)}
                onMakeIt={() => {
                  setFace("front");
                  change((current) => autoCover(focus, current));
                }}
              />
            ) : step === "decorate" ? (
              <DecorateStep
                cover={cover}
                mons={mons}
                hidden={hidden}
                tool={tool}
                brush={brush}
                brushSize={brushSize}
                onTool={setTool}
                onBrush={setBrush}
                onBrushSize={setBrushSize}
                onClearDrawing={() => change((current) => ({ ...current, painting: "" }))}
                onDrawLayer={(layer) => change((current) => ({ ...current, drawLayer: layer }))}
                onHero={(key) => {
                  if (key !== cover.hero) change((current) => ({ ...current, hero: key }));
                }}
                onCrowd={(crowd) => change((current) => ({ ...current, crowd }))}
                onShake={() => change((current) => ({ ...current, pileSeed: current.pileSeed + 1 }))}
              />
            ) : (
              <PrintStep
                making={making}
                posterStyle={posterStyle}
                backMode={cover.backMode}
                backText={cover.backText}
                hidden={hidden}
                namesFit={nameListPlan(lines) !== null}
                paper={paper}
                scope={scope}
                cardCount={roster.length}
                sheet={{ page, pages, titles: pageCards.map((item) => item.rangeLabel) }}
                busy={busy}
                sheetRef={sheetRef}
                onBackMode={(backMode) => {
                  setFace("back");
                  if (backMode !== cover.backMode) change((current) => ({ ...current, backMode }));
                }}
                onBackText={(backText) => change((current) => ({ ...current, backText }), false)}
                onSuggestedNote={() => change((current) => ({ ...current, backText: suggestedCover(focus).backText }))}
                onTextFocus={() => history.push(cover)}
                onPaper={setPaper}
                onScope={(next) => {
                  setScope(next);
                  setSheetPage(0);
                }}
                onSheet={setSheetPage}
                onSave={() => void savePdf()}
                onMaking={setMaking}
                onPosterStyle={setPosterPick}
                onSavePoster={() => void savePoster()}
              />
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t-2 border-ink/20 pt-4">
              <Button type="button" variant="outline" className="h-11 px-4" onClick={startAgain}>
                Start again
              </Button>
              <div className="flex gap-2">
                {stepIndex > 0 ? (
                  <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setStep(STEPS[stepIndex - 1]?.id ?? "style")}>
                    Back
                  </Button>
                ) : null}
                {stepIndex < STEPS.length - 1 ? (
                  <Button
                    type="button"
                    className="h-11 px-5"
                    onClick={() => {
                      setStep(STEPS[stepIndex + 1]?.id ?? "print");
                      setFace("front");
                    }}
                  >
                    Next: {STEPS[stepIndex + 1]?.label}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <p className="pk-print-only">Use Save PDF to print stickers at the right size.</p>
      </div>
    </div>
  );
}
