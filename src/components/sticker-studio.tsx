"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { shadowPixelPath, type KidCard } from "@/lib/kid-cards";
import { APP_NAME } from "@/lib/site";
import {
  PREVIEW_DPI,
  PRINT_DPI,
  SHEET_PREVIEW_DPI,
  READABLE_LIST_PT,
  backMode,
  bringToFront,
  cardPixelSize,
  clampScale,
  clampSticker,
  coverListsNames,
  freshCover,
  isNumberRun,
  nameListPlan,
  openSpot,
  pagePixelSize,
  paperId,
  playlistDetail,
  playlistLine,
  sanitizeStickers,
  sheetSlots,
  stickerFilename,
  stickerStorageKey,
  topStickerAt,
  type CoverDraft,
  type PaperId,
  type PlacedSticker,
} from "@/lib/sticker-layout";
import { paintCard, paintSheet, type CardPaint } from "@/lib/sticker-paint";
import { jpegPagePdf } from "@/lib/sticker-pdf";

type StickerMon = {
  key: string;
  name: string;
  src: string;
};

function nounFor(kind: KidCard["kind"]): string {
  if (kind === "guess") return "riddles";
  if (kind === "mega" || kind === "gmax") return "forms";
  return "Pokémon";
}

function monsFor(card: KidCard): StickerMon[] {
  const guess = card.kind === "guess";
  return card.chapters.flatMap((chapter) => {
    if (!chapter.dexId) return [];
    return [
      {
        key: chapter.key,
        name: guess ? `Riddle ${chapter.overlay}` : chapter.title,
        src: guess ? shadowPixelPath(chapter.dexId) : `/sprites/${chapter.dexId}.png`,
      },
    ];
  });
}

function linesFor(card: KidCard): string[] {
  if (card.kind === "guess") return [];
  return card.chapters.flatMap((chapter) =>
    chapter.dexId ? [playlistLine(chapter.overlay, chapter.title)] : [],
  );
}

function detailFor(card: KidCard, count: number): string {
  const names = card.kind === "guess" ? [] : card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.title] : []));
  const ids = card.chapters.flatMap((chapter) => (chapter.dexId ? [chapter.dexId] : []));
  return playlistDetail({
    count,
    noun: nounFor(card.kind),
    names,
    hideNames: card.kind === "guess",
    ordered: isNumberRun(ids),
  });
}

function countLabel(count: number, noun: string): string {
  if (count === 1) {
    const one = noun === "Pokémon" ? "Pokémon" : noun.replace(/s$/, "");
    return `1 ${one}`;
  }
  return `${count} ${noun}`;
}

function kickerFor(card: KidCard): string {
  if (card.kind === "guess") return "Guess Who";
  if (card.kind === "meet") return APP_NAME;
  return card.title;
}

function loadDraft(cardId: string, fresh: CoverDraft, keys: ReadonlySet<string>): CoverDraft {
  if (typeof window === "undefined") return fresh;
  try {
    const raw = localStorage.getItem(stickerStorageKey(cardId));
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<CoverDraft>;
    const rawCount = Array.isArray(parsed.stickers) ? parsed.stickers.length : 0;
    const cleaned = sanitizeStickers(parsed.stickers, keys);
    let stickers = fresh.stickers;
    if (cleaned) stickers = cleaned.length === 0 && rawCount > 0 ? fresh.stickers : cleaned;
    return {
      title: typeof parsed.title === "string" ? parsed.title : fresh.title,
      description: typeof parsed.description === "string" ? parsed.description : fresh.description,
      backText: typeof parsed.backText === "string" ? parsed.backText : fresh.backText,
      backMode: backMode(parsed.backMode),
      paper: paperId(parsed.paper),
      stickers,
    };
  } catch {
    return fresh;
  }
}

function canvasFamily(variable: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const first = raw.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || fallback;
}

function pointOn(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function trackPointer(
  pointerId: number,
  onMove: (event: PointerEvent) => void,
  onUp: (event: PointerEvent) => void,
): () => void {
  function move(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    onMove(event);
  }
  function up(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    stop();
    onUp(event);
  }
  function stop() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return stop;
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function StickerStudio({ card, onClose }: { card: KidCard; onClose: () => void }) {
  const mons = useMemo(() => monsFor(card), [card]);
  const lines = useMemo(() => linesFor(card), [card]);
  const noun = nounFor(card.kind);
  const hideNames = card.kind === "guess";
  const fresh = useMemo(
    () =>
      freshCover({
        libraryTitle: card.libraryTitle,
        rangeLabel: card.rangeLabel,
        blurb: card.blurb,
        childDoes: card.childDoes,
        detail: detailFor(card, mons.length),
        keys: mons.map((mon) => mon.key),
      }),
    [card, mons],
  );
  const [draft, setDraft] = useState<CoverDraft>(() => loadDraft(card.id, fresh, new Set(mons.map((mon) => mon.key))));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number } | null>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const images = useRef(new Map<string, CanvasImageSource | null>());
  const closeRef = useRef<() => void>(() => {});
  const draftRef = useRef(draft);
  const dragCleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const fontsReady = useRef(false);
  draftRef.current = draft;

  const preview = cardPixelSize(PREVIEW_DPI);
  const plan = nameListPlan(lines);
  const showNames = coverListsNames(lines, draft.backMode, hideNames);
  const layout = sheetSlots(draft.paper);
  const visible = mons.filter((mon) => mon.name.toLowerCase().includes(query.trim().toLowerCase()));
  const needed = useMemo(
    () => [...new Set(draft.stickers.map((sticker) => sticker.key))].sort().join("|"),
    [draft.stickers],
  );

  function remember(next: CoverDraft = draft) {
    try {
      localStorage.setItem(stickerStorageKey(card.id), JSON.stringify(next));
    } catch {
      // The cover still prints if the browser cannot store it.
    }
  }

  function close() {
    remember();
    onClose();
  }
  closeRef.current = close;

  function fonts() {
    return {
      display: canvasFamily("--font-fredoka", "Fredoka, sans-serif"),
      body: canvasFamily("--font-nunito", "Nunito, sans-serif"),
    };
  }

  function specFor(selectedId: string | null): CardPaint {
    return {
      title: draft.title,
      kicker: kickerFor(card),
      description: draft.description,
      backText: draft.backText,
      countLabel: countLabel(mons.length, noun),
      lines,
      showNames,
      stickers: draft.stickers,
      images: images.current,
      fonts: fonts(),
      selectedId,
    };
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      dragCleanup.current?.();
    };
  }, []);

  useEffect(() => {
    const id = card.id;
    return () => {
      try {
        localStorage.setItem(stickerStorageKey(id), JSON.stringify(draftRef.current));
      } catch {
        // The cover still prints if the browser cannot store it.
      }
    };
  }, [card.id]);

  useEffect(() => {
    const id = card.id;
    const snapshot = draft;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(stickerStorageKey(id), JSON.stringify(snapshot));
      } catch {
        // The cover still prints if the browser cannot store it.
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, card.id]);

  useEffect(() => {
    let cancelled = false;
    const keys = new Set(needed.split("|").filter(Boolean));
    for (const mon of mons) {
      if (!keys.has(mon.key) || images.current.has(mon.key)) continue;
      const image = new Image();
      image.onload = () => {
        images.current.set(mon.key, image);
        if (!cancelled) setLoaded((count) => count + 1);
      };
      image.onerror = () => {
        images.current.set(mon.key, null);
        if (!cancelled) setLoaded((count) => count + 1);
      };
      image.src = mon.src;
    }
    return () => {
      cancelled = true;
    };
  }, [needed, mons]);

  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      const front = frontRef.current?.getContext("2d");
      const back = backRef.current?.getContext("2d");
      const spec = specFor(selected);
      if (front) paintCard(front, "front", spec);
      if (back) paintCard(back, "back", { ...spec, selectedId: null });
      const sheet = sheetRef.current;
      const sheetCtx = sheet?.getContext("2d");
      if (sheet && sheetCtx) {
        const size = pagePixelSize(draft.paper, SHEET_PREVIEW_DPI);
        if (sheet.width !== size.width) sheet.width = size.width;
        if (sheet.height !== size.height) sheet.height = size.height;
        const face = (which: "front" | "back") => {
          const cardSize = cardPixelSize(SHEET_PREVIEW_DPI);
          const canvas = document.createElement("canvas");
          canvas.width = cardSize.width;
          canvas.height = cardSize.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return canvas;
          paintCard(ctx, which, { ...specFor(null), fonts: fonts() });
          return canvas;
        };
        paintSheet(sheetCtx, {
          paper: draft.paper,
          dpi: SHEET_PREVIEW_DPI,
          front: face("front"),
          back: face("back"),
          fonts: fonts(),
          brand: APP_NAME,
        });
      }
    };
    draw();
    if (!fontsReady.current) {
      void document.fonts.ready.then(() => {
        fontsReady.current = true;
        draw();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [draft, loaded, selected, showNames, card]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || !selected) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        setSelected(null);
        setDraft((current) => ({
          ...current,
          stickers: current.stickers.filter((sticker) => sticker.id !== selected),
        }));
        return;
      }
      const nudge =
        event.key === "ArrowLeft"
          ? { x: -0.02, y: 0 }
          : event.key === "ArrowRight"
            ? { x: 0.02, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: -0.02 }
              : event.key === "ArrowDown"
                ? { x: 0, y: 0.02 }
                : null;
      if (!nudge) return;
      event.preventDefault();
      setDraft((current) => ({
        ...current,
        stickers: current.stickers.map((sticker) => {
          if (sticker.id !== selected) return sticker;
          const next = clampSticker({ x: sticker.x + nudge.x, y: sticker.y + nudge.y }, sticker.scale);
          return { ...sticker, ...next };
        }),
      }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function place(key: string, at?: { x: number; y: number }) {
    const id = `sticker-${crypto.randomUUID()}`;
    setSelected(id);
    setDraft((current) => {
      const spot = clampSticker(at ?? openSpot(current.stickers), 0.3);
      const sticker: PlacedSticker = { id, key, x: spot.x, y: spot.y, scale: 0.3 };
      return { ...current, stickers: [...current.stickers, sticker] };
    });
  }

  function onTrayPointerDown(event: React.PointerEvent<HTMLButtonElement>, mon: StickerMon) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    setGhost({ src: mon.src, x: startX, y: startY });
    dragCleanup.current?.();
    dragCleanup.current = trackPointer(
      event.pointerId,
      (move) => setGhost({ src: mon.src, x: move.clientX, y: move.clientY }),
      (up) => {
        setGhost(null);
        const moved = Math.hypot(up.clientX - startX, up.clientY - startY) > 6;
        const canvas = frontRef.current;
        const rect = canvas?.getBoundingClientRect();
        const over =
          rect &&
          up.clientX >= rect.left &&
          up.clientX <= rect.right &&
          up.clientY >= rect.top &&
          up.clientY <= rect.bottom;
        if (moved && canvas && over) {
          suppressClick.current = true;
          place(mon.key, pointOn(canvas, up));
          return;
        }
        if (moved) suppressClick.current = true;
      },
    );
  }

  function onFrontPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const point = pointOn(event.currentTarget, event);
    const hit = topStickerAt(draft.stickers, point.x, point.y);
    if (!hit) {
      setSelected(null);
      return;
    }
    setSelected(hit.id);
    setDraft((current) => ({ ...current, stickers: bringToFront(current.stickers, hit.id) }));
    dragCleanup.current?.();
    dragCleanup.current = trackPointer(
      event.pointerId,
      (move) => {
        const canvas = frontRef.current;
        if (!canvas) return;
        const next = clampSticker(pointOn(canvas, move), hit.scale);
        setDraft((current) => ({
          ...current,
          stickers: current.stickers.map((sticker) =>
            sticker.id === hit.id ? { ...sticker, x: next.x, y: next.y } : sticker,
          ),
        }));
      },
      () => undefined,
    );
  }

  function resize(delta: number) {
    if (!selected) return;
    setDraft((current) => ({
      ...current,
      stickers: current.stickers.map((sticker) => {
        if (sticker.id !== selected) return sticker;
        const scale = clampScale(sticker.scale + delta);
        return { ...sticker, ...clampSticker(sticker, scale), scale };
      }),
    }));
  }

  async function savePdf() {
    setBusy(true);
    try {
      await document.fonts.ready;
      remember();
      const drawn = fonts();
      const face = (which: "front" | "back") => {
        const size = cardPixelSize(PRINT_DPI);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas");
        paintCard(ctx, which, { ...specFor(null), fonts: drawn });
        return canvas;
      };
      const page = pagePixelSize(draft.paper, PRINT_DPI);
      const sheet = document.createElement("canvas");
      sheet.width = page.width;
      sheet.height = page.height;
      const ctx = sheet.getContext("2d");
      if (!ctx) throw new Error("canvas");
      paintSheet(ctx, {
        paper: draft.paper,
        dpi: PRINT_DPI,
        front: face("front"),
        back: face("back"),
        fonts: drawn,
        brand: APP_NAME,
      });
      const blob = await new Promise<Blob | null>((resolve) => sheet.toBlob(resolve, "image/jpeg", 0.93));
      if (!blob) throw new Error("jpeg");
      const pdf = jpegPagePdf(
        new Uint8Array(await blob.arrayBuffer()),
        sheet.width,
        sheet.height,
        layout.width,
        layout.height,
      );
      downloadBytes(pdf, stickerFilename(draft.title, draft.paper));
      toast.success("PDF saved on this computer. Print it at 100% size, not Fit to page.");
    } catch {
      toast.error("The PDF could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#16324f]/50 p-3 sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticker-heading"
        tabIndex={-1}
        className="pk-card mx-auto w-full max-w-6xl bg-cream px-4 py-4 outline-none sm:px-6 sm:py-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="sticker-heading" className="font-display text-3xl leading-tight">
              Stickers for {card.rangeLabel}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              The front is the cover. Drag a {hideNames ? "riddle" : "Pokémon"} onto it, or click one to add it, then
              move it around the picture. The back is the playlist. Save a PDF and print it at 100%
              size. Cut on the corner marks.
            </p>
          </div>
          <Button type="button" variant="outline" className="h-10 shrink-0 px-4" onClick={close}>
            Close
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex gap-2" role="group" aria-label="Paper size">
            {(["a4", "letter"] as const).map((paper) => (
              <button
                key={paper}
                type="button"
                className="pk-pill"
                aria-pressed={draft.paper === paper}
                onClick={() => setDraft((current) => ({ ...current, paper }))}
              >
                {paper === "a4" ? "A4" : "US Letter"}
              </button>
            ))}
          </div>
          {hideNames ? (
            <p className="text-sm leading-6 text-muted-foreground">
              The back leaves the names off, so the card does not give away the answers.
            </p>
          ) : (
            <div className="flex gap-2" role="group" aria-label="Back of the sticker">
              <button
                type="button"
                className="pk-pill"
                aria-pressed={!showNames}
                onClick={() => setDraft((current) => ({ ...current, backMode: "note" }))}
              >
                Note
              </button>
              <button
                type="button"
                className="pk-pill"
                aria-pressed={showNames}
                disabled={!plan}
                title={plan ? "Print every name" : "Too many names to fit on the sticker"}
                onClick={() => setDraft((current) => ({ ...current, backMode: "names" }))}
              >
                Name list
              </button>
            </div>
          )}
          <Button type="button" className="h-10 px-4" disabled={busy} onClick={() => void savePdf()}>
            {busy ? "Saving PDF…" : "Save PDF"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4"
            onClick={() => {
              setSelected(null);
              setDraft((current) => ({ ...fresh, paper: current.paper }));
            }}
          >
            Start again
          </Button>
        </div>
        {!hideNames && !plan ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The names will not fit on the back of a card this size, so the note is printed there.
          </p>
        ) : null}
        {!hideNames && plan && plan.fontPt < READABLE_LIST_PT && !showNames ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The names fit only in small type. The note is easier to read.
          </p>
        ) : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="order-3 lg:order-1">
            <label className="grid gap-1 text-sm" htmlFor="sticker-search">
              {hideNames ? "Riddles" : "Pokémon"} for the cover
              <input
                id="sticker-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={hideNames ? "Riddle number" : "Name"}
                className="pk-field"
                autoComplete="off"
              />
            </label>
            <div className="mt-2 grid max-h-[28rem] grid-cols-3 content-start gap-2 overflow-y-auto lg:max-h-[70dvh]">
              {visible.map((mon) => (
                <button
                  key={mon.key}
                  type="button"
                  className="pk-choice flex flex-col items-center gap-1 px-1 py-2 text-center"
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    place(mon.key);
                  }}
                  onPointerDown={(event) => onTrayPointerDown(event, mon)}
                >
                  <img
                    src={mon.src}
                    alt=""
                    width={56}
                    height={56}
                    draggable={false}
                    className="h-14 w-14 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="w-full truncate text-xs">{mon.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="pk-kicker">Front</p>
            <canvas
              ref={frontRef}
              width={preview.width}
              height={preview.height}
              aria-label={`Card front. Drag a ${hideNames ? "riddle" : "Pokémon"} to move it.`}
              className="mt-2 h-auto w-full max-w-[280px] touch-none shadow-[4px_4px_0_#16324f]"
              style={{ borderRadius: "5.9% / 3.7%" }}
              onPointerDown={onFrontPointerDown}
            />
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {draft.stickers.length} on the cover. Drag to move. Delete removes the selected one.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-10 px-4" disabled={!selected} onClick={() => resize(0.04)}>
                Bigger
              </Button>
              <Button type="button" variant="outline" className="h-10 px-4" disabled={!selected} onClick={() => resize(-0.04)}>
                Smaller
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                disabled={!selected}
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    stickers: current.stickers.filter((sticker) => sticker.id !== selected),
                  }));
                  setSelected(null);
                }}
              >
                Remove
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                onClick={() => {
                  setSelected(null);
                  setDraft((current) => ({ ...current, stickers: [] }));
                }}
              >
                Clear cover
              </Button>
            </div>
            <label className="mt-4 grid gap-1 text-sm" htmlFor="sticker-title">
              Cover title
              <input
                id="sticker-title"
                value={draft.title}
                maxLength={80}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                className="pk-field"
              />
            </label>
            <label className="mt-3 grid gap-1 text-sm" htmlFor="sticker-line">
              Cover line
              <textarea
                id="sticker-line"
                value={draft.description}
                maxLength={280}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                className="pk-field py-2"
                style={{ height: "auto", minHeight: "5.5rem" }}
              />
            </label>
          </div>

          <div className="order-2 lg:order-3">
            <p className="pk-kicker">Back</p>
            <canvas
              ref={backRef}
              width={preview.width}
              height={preview.height}
              aria-label="Card back"
              className="mt-2 h-auto w-full max-w-[280px] shadow-[4px_4px_0_#16324f]"
              style={{ borderRadius: "5.9% / 3.7%" }}
            />
            <label className="mt-3 grid gap-1 text-sm" htmlFor="sticker-note">
              Note on the back
              <textarea
                id="sticker-note"
                value={draft.backText}
                maxLength={700}
                onChange={(event) => setDraft((current) => ({ ...current, backText: event.target.value }))}
                className="pk-field py-2"
                style={{ height: "auto", minHeight: "8rem" }}
              />
            </label>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {showNames
                ? "The name list is on the sticker. This note stays here if you switch back."
                : "This note is printed on the back."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-10 px-4"
              onClick={() => setDraft((current) => ({ ...current, backText: fresh.backText }))}
            >
              Use the suggested note
            </Button>
            <div className="mt-4">
              <p className="pk-kicker">Print layout</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {layout.label} page, {layout.slots.length} stickers, marked 1 of {layout.slots.length}{" "}
                through {layout.slots.length} of {layout.slots.length}. Each row is a front and a back.
                Print this page at 100% size and cut on the corner marks.
              </p>
              <canvas
                ref={sheetRef}
                aria-label={`${layout.label} print layout, ${layout.slots.length} stickers`}
                className="mt-2 h-auto w-full max-w-[420px] bg-white shadow-[4px_4px_0_#16324f]"
              />
            </div>
          </div>
        </div>
      </div>
      {ghost ? (
        <img
          src={ghost.src}
          alt=""
          className="pointer-events-none fixed z-[60] h-16 w-16 object-contain"
          style={{ left: ghost.x, top: ghost.y, transform: "translate(-50%, -50%)", imageRendering: "pixelated" }}
        />
      ) : null}
    </div>
  );
}
