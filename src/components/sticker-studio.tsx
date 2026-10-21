"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { shadowPixelPath, type KidCard, type KidChapter } from "@/lib/kid-cards";
import { artworkSrc } from "@/lib/page-artwork";
import { APP_NAME } from "@/lib/site";
import {
  PREVIEW_DPI,
  PRINT_DPI,
  SHEET_PREVIEW_DPI,
  READABLE_LIST_PT,
  backMode,
  bringToFront,
  cardPixelSize,
  clampRotation,
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
  type StickerShape,
} from "@/lib/sticker-layout";
import { decorationArt } from "@/lib/sticker-decor";
import { paintCard, paintSheet, type CardPaint } from "@/lib/sticker-paint";
import { jpegPagesPdf } from "@/lib/sticker-pdf";

type StickerMon = {
  key: string;
  name: string;
  src: string;
};

const BRUSHES = ["#16324f", "#e10600", "#ffcb05", "#2a75bb", "#7ac74c", "#f95587", "#9b5de5", "#ff8c42", "#fffdf6"] as const;
const BRUSH_SIZES = [
  { id: 10, label: "Small" },
  { id: 18, label: "Medium" },
  { id: 32, label: "Big" },
] as const;
const SHAPE_LABELS: { id: StickerShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "round", label: "Square" },
  { id: "hex", label: "Hex" },
  { id: "star", label: "Star" },
  { id: "diamond", label: "Diamond" },
];

function paintingUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("data:image/png;base64,")) return "";
  if (value.length > 1_800_000) return "";
  return value;
}

function nounFor(kind: KidCard["kind"]): string {
  if (kind === "guess") return "riddles";
  if (kind === "mega" || kind === "gmax" || kind === "alola" || kind === "hisui") return "forms";
  return "Pokémon";
}

function crispPicture(src: string): boolean {
  return src.includes("/pixels/") || src.includes("/sprites/");
}

function stickerSrc(chapter: KidChapter, guess: boolean): string {
  if (guess && chapter.dexId) return shadowPixelPath(chapter.dexId);
  if (chapter.sprite?.includes("/artwork/")) return chapter.sprite;
  if (chapter.dexId) return artworkSrc(chapter.dexId);
  return chapter.sprite ?? "";
}

function monsFor(card: KidCard): StickerMon[] {
  const guess = card.kind === "guess";
  return card.chapters.flatMap((chapter) => {
    if (!chapter.dexId) return [];
    return [
      {
        key: chapter.key,
        name: guess ? `Riddle ${chapter.overlay}` : chapter.title,
        src: stickerSrc(chapter, guess),
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

function suggestedCover(item: KidCard): CoverDraft {
  const itemMons = monsFor(item);
  return freshCover({
    libraryTitle: item.libraryTitle,
    rangeLabel: item.rangeLabel,
    blurb: item.blurb,
    childDoes: item.childDoes,
    detail: detailFor(item, itemMons.length),
    keys: itemMons.map((mon) => mon.key),
  });
}

function savedCover(item: KidCard): CoverDraft {
  const fresh = suggestedCover(item);
  return loadDraft(item.id, fresh, new Set(monsFor(item).map((mon) => mon.key)));
}

function paintFor(
  item: KidCard,
  cover: CoverDraft,
  images: Map<string, CanvasImageSource | null>,
  fonts: { display: string; body: string },
  selectedId: string | null,
  painting: CanvasImageSource | null,
): CardPaint {
  const itemMons = monsFor(item);
  const lines = linesFor(item);
  return {
    title: cover.title,
    kicker: kickerFor(item),
    description: cover.description,
    backText: cover.backText,
    countLabel: countLabel(itemMons.length, nounFor(item.kind)),
    lines,
    showNames: coverListsNames(lines, cover.backMode, item.kind === "guess"),
    stickers: cover.stickers,
    images,
    fonts,
    selectedId,
    painting,
  };
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
      painting: paintingUrl(parsed.painting),
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

export function StickerStudio({
  card,
  cards = [],
  onClose,
}: {
  card: KidCard;
  cards?: KidCard[];
  onClose: () => void;
}) {
  const [focusId, setFocusId] = useState(card.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tray, setTray] = useState<"all" | "placed" | "spare">("all");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number } | null>(null);
  const [sheetPage, setSheetPage] = useState(0);
  const rosterIds = (cards.length > 0 ? cards : [card]).map((item) => item.id).join("|");
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const roster = useMemo(() => {
    const list = cardsRef.current.length > 0 ? cardsRef.current : [card];
    return list.some((item) => item.id === card.id) ? list : [card, ...list];
  }, [rosterIds, card]);
  const focus = roster.find((item) => item.id === focusId) ?? roster[0] ?? card;
  const mons = useMemo(() => monsFor(focus), [focus]);
  const lines = useMemo(() => linesFor(focus), [focus]);
  const noun = nounFor(focus.kind);
  const hideNames = focus.kind === "guess";
  const fresh = useMemo(
    () =>
      freshCover({
        libraryTitle: focus.libraryTitle,
        rangeLabel: focus.rangeLabel,
        blurb: focus.blurb,
        childDoes: focus.childDoes,
        detail: detailFor(focus, mons.length),
        keys: mons.map((mon) => mon.key),
      }),
    [focus, mons],
  );
  const [draft, setDraft] = useState<CoverDraft>(() => loadDraft(focus.id, fresh, new Set(mons.map((mon) => mon.key))));
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const images = useRef(new Map<string, CanvasImageSource | null>());
  const closeRef = useRef<() => void>(() => {});
  const draftRef = useRef(draft);
  const draftCard = useRef(focus.id);
  const dragCleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const pastRef = useRef<{ draft: CoverDraft; selected: string | null }[]>([]);
  const futureRef = useRef<{ draft: CoverDraft; selected: string | null }[]>([]);
  const selectedRef = useRef<string | null>(null);
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const pushRef = useRef<() => void>(() => {});
  const removeRef = useRef<() => void>(() => {});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [tool, setTool] = useState<"move" | "draw">("move");
  const [brush, setBrush] = useState<string>("#e10600");
  const [brushSize, setBrushSize] = useState(18);
  const [decor, setDecor] = useState<StickerMon[]>([]);
  const [drawSerial, setDrawSerial] = useState(0);
  const paintCanvas = useRef<HTMLCanvasElement | null>(null);
  const paintReady = useRef(false);
  const paintCache = useRef(new Map<string, CanvasImageSource>());
  const paintLoading = useRef(new Set<string>());
  const drawingRef = useRef(false);
  const fontsReady = useRef(false);
  draftRef.current = draft;

  const preview = cardPixelSize(PREVIEW_DPI);
  const plan = nameListPlan(lines);
  const showNames = coverListsNames(lines, draft.backMode, hideNames);
  const layout = sheetSlots(draft.paper);
  const capacity = Math.max(1, layout.slots.filter((slot) => slot.face === "front").length);
  const pageCount = Math.max(1, Math.ceil(roster.length / capacity));
  const page = Math.min(sheetPage, pageCount - 1);
  const pageCards = roster.slice(page * capacity, page * capacity + capacity);
  const pageKey = `${page}:${pageCards.map((item) => item.id).join("|")}`;
  const stickerCount = pageCards.length * 2;
  const libraryMons = useMemo(() => {
    const byKey = new Map<string, StickerMon>();
    for (const item of roster) {
      for (const mon of monsFor(item)) byKey.set(mon.key, mon);
    }
    return [...byKey.values()];
  }, [roster]);
  const placedByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sticker of draft.stickers) counts.set(sticker.key, (counts.get(sticker.key) ?? 0) + 1);
    return counts;
  }, [draft.stickers]);
  selectedRef.current = selected;
  const selectedSticker = draft.stickers.find((sticker) => sticker.id === selected) ?? null;
  const selectedMon = selectedSticker
    ? (mons.find((mon) => mon.key === selectedSticker.key) ?? decor.find((mon) => mon.key === selectedSticker.key) ?? null)
    : null;
  const coverMons = mons.filter((mon) => (placedByKey.get(mon.key) ?? 0) > 0);
  const visible = mons.filter((mon) => {
    if (!mon.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    const count = placedByKey.get(mon.key) ?? 0;
    if (tray === "placed") return count > 0;
    if (tray === "spare") return count === 0;
    return true;
  });
  const needed = useMemo(() => {
    const keys = new Set<string>();
    for (const item of roster) {
      const cover = item.id === focus.id ? draft : savedCover(item);
      for (const sticker of cover.stickers) keys.add(sticker.key);
    }
    return [...keys].sort().join("|");
  }, [roster, draft, focus.id]);

  function remember(next: CoverDraft = draft) {
    try {
      localStorage.setItem(stickerStorageKey(focus.id), JSON.stringify(next));
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

  function chooseCard(id: string) {
    if (id === focus.id) return;
    remember();
    setSelected(null);
    setQuery("");
    setTray("all");
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setFocusId(id);
  }

  function syncHistory() {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }

  function pushHistory() {
    pastRef.current.push({ draft: draftRef.current, selected: selectedRef.current });
    if (pastRef.current.length > 40) pastRef.current.shift();
    futureRef.current = [];
    syncHistory();
  }

  function undo() {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({ draft: draftRef.current, selected: selectedRef.current });
    setDraft(prev.draft);
    setSelected(prev.selected);
    syncHistory();
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({ draft: draftRef.current, selected: selectedRef.current });
    setDraft(next.draft);
    setSelected(next.selected);
    syncHistory();
  }
  undoRef.current = undo;
  redoRef.current = redo;
  pushRef.current = pushHistory;

  function cachePainting(url: string) {
    if (!url || paintCache.current.has(url) || paintLoading.current.has(url)) return;
    paintLoading.current.add(url);
    const image = new Image();
    image.onload = () => {
      paintCache.current.set(url, image);
      paintLoading.current.delete(url);
      setLoaded((count) => count + 1);
    };
    image.onerror = () => {
      paintLoading.current.delete(url);
    };
    image.src = url;
  }

  function activePainting(url: string): CanvasImageSource | null {
    if (drawingRef.current && paintCanvas.current) return paintCanvas.current;
    if (!url) return null;
    cachePainting(url);
    return paintCache.current.get(url) ?? null;
  }

  function specFor(selectedId: string | null): CardPaint {
    return paintFor(focus, draft, images.current, fonts(), selectedId, activePainting(draft.painting));
  }

  function renderFaces(items: readonly KidCard[], dpi: number, selectedId: string | null) {
    const size = cardPixelSize(dpi);
    const drawn = fonts();
    return items.flatMap((item) => {
      const cover = item.id === focus.id ? draft : savedCover(item);
      const spec = paintFor(
        item,
        cover,
        images.current,
        drawn,
        item.id === focus.id ? selectedId : null,
        item.id === focus.id ? activePainting(cover.painting) : cover.painting ? (paintCache.current.get(cover.painting) ?? null) : null,
      );
      if (item.id !== focus.id && cover.painting) cachePainting(cover.painting);
      return (["front", "back"] as const).map((which) => {
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (ctx) paintCard(ctx, which, { ...spec, selectedId: which === "front" ? (spec.selectedId ?? null) : null });
        return canvas;
      });
    });
  }

  useEffect(() => {
    const made = decorationArt();
    const next: StickerMon[] = [];
    for (const item of made) {
      images.current.set(item.key, item.canvas);
      next.push({ key: item.key, name: item.name, src: item.canvas.toDataURL("image/png") });
    }
    setDecor(next);
    setLoaded((count) => count + 1);
  }, []);

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
    if (draftCard.current === focusId) return;
    const next = roster.find((item) => item.id === focusId);
    if (!next) return;
    draftCard.current = next.id;
    const nextMons = monsFor(next);
    setDraft(loadDraft(next.id, suggestedCover(next), new Set(nextMons.map((mon) => mon.key))));
  }, [focusId, roster]);

  useEffect(() => {
    const index = Math.max(0, roster.findIndex((item) => item.id === focus.id));
    setSheetPage(Math.floor(index / capacity));
  }, [focus.id, draft.paper, capacity, roster]);

  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(stickerStorageKey(draftCard.current), JSON.stringify(draftRef.current));
      } catch {
        // The cover still prints if the browser cannot store it.
      }
    };
  }, []);

  useEffect(() => {
    const id = focus.id;
    const snapshot = draft;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(stickerStorageKey(id), JSON.stringify(snapshot));
      } catch {
        // The cover still prints if the browser cannot store it.
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, focus.id]);

  useEffect(() => {
    let cancelled = false;
    const keys = new Set(needed.split("|").filter(Boolean));
    for (const mon of libraryMons) {
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
  }, [needed, libraryMons]);

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
        paintSheet(sheetCtx, {
          paper: draft.paper,
          dpi: SHEET_PREVIEW_DPI,
          images: renderFaces(pageCards, SHEET_PREVIEW_DPI, null),
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
  }, [draft, loaded, selected, showNames, focus, pageKey, roster, drawSerial]);

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
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoRef.current();
        else undoRef.current();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoRef.current();
        return;
      }
      if (!selected) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeRef.current();
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
      pushRef.current();
      setDraft((current) => ({
        ...current,
        stickers: current.stickers.map((sticker) => {
          if (sticker.id !== selected) return sticker;
          const next = clampSticker({ x: sticker.x + nudge.x, y: sticker.y + nudge.y }, sticker.scale, sticker.rotation);
          return { ...sticker, ...next };
        }),
      }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function place(key: string, at?: { x: number; y: number }) {
    pushHistory();
    const id = `sticker-${crypto.randomUUID()}`;
    setSelected(id);
    setDraft((current) => {
      const style = { shape: "hex" as const, color: "transparent", rotation: 0 };
      const spot = clampSticker(at ?? openSpot(current.stickers), 0.3, style.rotation);
      const sticker: PlacedSticker = { id, key, x: spot.x, y: spot.y, scale: 0.3, ...style };
      return { ...current, stickers: [...current.stickers, sticker] };
    });
  }

  function selectPlaced(key: string) {
    const matches = draft.stickers.filter((sticker) => sticker.key === key);
    if (matches.length === 0) {
      place(key);
      return;
    }
    const currentIndex = matches.findIndex((sticker) => sticker.id === selected);
    const next = currentIndex === -1 ? matches[matches.length - 1] : matches[(currentIndex + 1) % matches.length];
    if (!next) return;
    if (next.id === selected && draft.stickers.at(-1)?.id === next.id) return;
    pushHistory();
    setSelected(next.id);
    setDraft((current) => ({ ...current, stickers: bringToFront(current.stickers, next.id) }));
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

  function ensurePaint() {
    const size = cardPixelSize(PREVIEW_DPI);
    if (!paintCanvas.current) {
      const surface = document.createElement("canvas");
      surface.width = size.width;
      surface.height = size.height;
      paintCanvas.current = surface;
    }
    const surface = paintCanvas.current;
    if (!paintReady.current) {
      const ctx = surface.getContext("2d");
      const saved = draftRef.current.painting ? paintCache.current.get(draftRef.current.painting) : null;
      if (ctx) {
        ctx.clearRect(0, 0, surface.width, surface.height);
        if (saved) ctx.drawImage(saved, 0, 0, surface.width, surface.height);
      }
      paintReady.current = true;
    }
    return surface;
  }

  function strokeTo(from: { x: number; y: number }, to: { x: number; y: number }) {
    const surface = ensurePaint();
    const ctx = surface.getContext("2d");
    if (!ctx) return;
    const erase = brush === "erase";
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = erase ? "rgba(0,0,0,1)" : brush;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(from.x * surface.width, from.y * surface.height);
    ctx.lineTo(to.x * surface.width, to.y * surface.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x * surface.width, to.y * surface.height, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function finishStroke() {
    const surface = paintCanvas.current;
    drawingRef.current = false;
    if (!surface) return;
    const copy = document.createElement("canvas");
    copy.width = surface.width;
    copy.height = surface.height;
    copy.getContext("2d")?.drawImage(surface, 0, 0);
    const url = copy.toDataURL("image/png");
    paintCache.current.set(url, copy);
    paintReady.current = false;
    setDraft((current) => ({ ...current, painting: url }));
  }

  function clearPainting() {
    if (!draftRef.current.painting) return;
    pushHistory();
    const surface = ensurePaint();
    surface.getContext("2d")?.clearRect(0, 0, surface.width, surface.height);
    paintReady.current = false;
    setDraft((current) => ({ ...current, painting: "" }));
  }

  function restyle(patch: Partial<Pick<PlacedSticker, "shape" | "color" | "rotation">>) {
    const id = selectedRef.current;
    if (!id) return;
    pushHistory();
    setDraft((current) => ({
      ...current,
      stickers: current.stickers.map((sticker) => {
        if (sticker.id !== id) return sticker;
        const next = { ...sticker, ...patch };
        return { ...next, ...clampSticker(next, next.scale, next.rotation) };
      }),
    }));
  }

  function onFrontPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    if (tool === "draw") {
      pushHistory();
      drawingRef.current = true;
      const start = pointOn(event.currentTarget, event);
      strokeTo(start, start);
      setDrawSerial((count) => count + 1);
      let last = start;
      dragCleanup.current?.();
      dragCleanup.current = trackPointer(
        event.pointerId,
        (move) => {
          const canvas = frontRef.current;
          if (!canvas) return;
          const next = pointOn(canvas, move);
          strokeTo(last, next);
          last = next;
          setDrawSerial((count) => count + 1);
        },
        () => finishStroke(),
      );
      return;
    }
    const point = pointOn(event.currentTarget, event);
    const hit = topStickerAt(draft.stickers, point.x, point.y);
    if (!hit) {
      if (selectedRef.current) {
        pushHistory();
        setSelected(null);
      }
      return;
    }
    pushHistory();
    setSelected(hit.id);
    setDraft((current) => ({ ...current, stickers: bringToFront(current.stickers, hit.id) }));
    dragCleanup.current?.();
    dragCleanup.current = trackPointer(
      event.pointerId,
      (move) => {
        const canvas = frontRef.current;
        if (!canvas) return;
        const next = clampSticker(pointOn(canvas, move), hit.scale, hit.rotation);
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
    pushHistory();
    setDraft((current) => ({
      ...current,
      stickers: current.stickers.map((sticker) => {
        if (sticker.id !== selected) return sticker;
        const scale = clampScale(sticker.scale + delta);
        return { ...sticker, ...clampSticker(sticker, scale, sticker.rotation), scale };
      }),
    }));
  }

  async function savePdf() {
    setBusy(true);
    try {
      await document.fonts.ready;
      remember();
      const drawn = fonts();
      const pixelPage = pagePixelSize(draft.paper, PRINT_DPI);
      const sheets = [];
      for (let index = 0; index < roster.length; index += capacity) {
        const group = roster.slice(index, index + capacity);
        const sheet = document.createElement("canvas");
        sheet.width = pixelPage.width;
        sheet.height = pixelPage.height;
        const ctx = sheet.getContext("2d");
        if (!ctx) throw new Error("canvas");
        paintSheet(ctx, {
          paper: draft.paper,
          dpi: PRINT_DPI,
          images: renderFaces(group, PRINT_DPI, null),
          fonts: drawn,
          brand: APP_NAME,
        });
        const blob = await new Promise<Blob | null>((resolve) => sheet.toBlob(resolve, "image/jpeg", 0.93));
        if (!blob) throw new Error("jpeg");
        sheets.push({
          jpeg: new Uint8Array(await blob.arrayBuffer()),
          pixelWidth: sheet.width,
          pixelHeight: sheet.height,
        });
      }
      const pdf = jpegPagesPdf(sheets, layout.width, layout.height);
      const fileTitle = roster.length > 1 ? `${APP_NAME} cards` : draft.title;
      downloadBytes(pdf, stickerFilename(fileTitle, draft.paper));
      toast.success(
        sheets.length > 1
          ? `PDF saved with ${sheets.length} sheets. Print it at 100% size, not Fit to page.`
          : "PDF saved on this computer. Print it at 100% size, not Fit to page.",
      );
    } catch {
      toast.error("The PDF could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function setPaper(paper: PaperId) {
    if (draftRef.current.paper === paper) return;
    pushHistory();
    setDraft((current) => ({ ...current, paper }));
  }

  function setBackMode(mode: "note" | "names") {
    if (draftRef.current.backMode === mode) return;
    pushHistory();
    setDraft((current) => ({ ...current, backMode: mode }));
  }

  function useSuggestedPictures() {
    pushHistory();
    setSelected(null);
    setDraft((current) => ({ ...current, stickers: fresh.stickers.map((sticker) => ({ ...sticker })) }));
  }

  function startAgain() {
    pushHistory();
    setSelected(null);
    setDraft((current) => ({ ...fresh, paper: current.paper }));
  }

  function clearCover() {
    if (draftRef.current.stickers.length === 0) return;
    pushHistory();
    setSelected(null);
    setDraft((current) => ({ ...current, stickers: [] }));
  }

  function removeSelected() {
    const id = selectedRef.current;
    if (!id) return;
    pushHistory();
    setSelected(null);
    setDraft((current) => ({
      ...current,
      stickers: current.stickers.filter((sticker) => sticker.id !== id),
    }));
  }
  removeRef.current = removeSelected;

  function stickerButton(mon: StickerMon, shelf: boolean) {
    const count = placedByKey.get(mon.key) ?? 0;
    const pressed = selectedSticker?.key === mon.key;
    return (
      <button
        key={mon.key}
        type="button"
        className={
          shelf
            ? "pk-choice pk-sticker-tile flex w-[4.5rem] shrink-0 flex-col items-center px-1 py-1"
            : "pk-choice pk-sticker-tile flex min-h-24 flex-col items-center gap-1 px-2 py-2 text-center"
        }
        aria-pressed={pressed}
        aria-label={
          count === 0
            ? `Add ${mon.name}`
            : pressed
              ? `${mon.name}, selected, ${count} on the cover`
              : `Select ${mon.name}, ${count} on the cover`
        }
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (count === 0) place(mon.key);
          else selectPlaced(mon.key);
        }}
        onPointerDown={(event) => onTrayPointerDown(event, mon)}
      >
        {count > 0 ? <span className="pk-sticker-count">{count}</span> : null}
        <img
          src={mon.src}
          alt=""
          width={shelf ? 56 : 64}
          height={shelf ? 56 : 64}
          draggable={false}
          className={shelf ? "h-14 w-14 object-contain" : "h-16 w-16 object-contain"}
          style={{ imageRendering: crispPicture(mon.src) ? "pixelated" : "auto" }}
        />
        {shelf ? null : <span className="line-clamp-2 w-full text-sm leading-4">{mon.name}</span>}
      </button>
    );
  }

  return (
    <div className="pk-studio fixed inset-0 z-50 overflow-y-auto bg-[#16324f]/50 p-3 sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticker-heading"
        tabIndex={-1}
        className="pk-studio-panel pk-card mx-auto w-full max-w-6xl bg-cream px-4 py-4 outline-none sm:px-6 sm:py-5"
      >
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <h2 id="sticker-heading" className="font-display text-3xl leading-tight">
              Stickers for {focus.rangeLabel}
            </h2>
            {roster.length > 1 ? (
              <label className="mt-2 grid max-w-sm gap-1 text-sm" htmlFor="sticker-card">
                Card to design
                <select
                  id="sticker-card"
                  className="pk-field"
                  value={focus.id}
                  onChange={(event) => chooseCard(event.target.value)}
                >
                  {roster.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.rangeLabel}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              The cover starts as a hex pattern of transparent pictures. Tap one to move it, or add a Poké Ball or a berry.
            </p>
          </div>
          <Button type="button" variant="outline" className="h-10 shrink-0 px-4" onClick={close}>
            Close
          </Button>
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="order-2 lg:order-1">
            <div className="grid gap-1 text-sm">
              <label htmlFor="sticker-search">{hideNames ? "Riddles" : "Pokémon"}</label>
              <div className="flex gap-2">
                <input
                  id="sticker-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={hideNames ? "Riddle number" : "Name"}
                  className="pk-field"
                  autoComplete="off"
                />
                {query ? (
                  <button type="button" className="pk-chip shrink-0" onClick={() => setQuery("")}>
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Which stickers to show">
              {(
                [
                  ["all", "All"],
                  ["placed", "On cover"],
                  ["spare", "Not yet"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="pk-chip"
                  aria-pressed={tray === id}
                  onClick={() => setTray(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <p className="pk-kicker">Poké Balls and berries</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {decor.map((mon) => stickerButton(mon, true))}
              </div>
            </div>
            <p className="mt-2 text-sm leading-5">
              {coverMons.length} of {mons.length} on the cover.
            </p>
            {coverMons.length > 0 ? (
              <div className="mt-3">
                <p className="pk-kicker">On the cover</p>
                <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                  {coverMons.map((mon) => stickerButton(mon, true))}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid max-h-[28rem] grid-cols-3 content-start gap-2 overflow-y-auto sm:grid-cols-4 lg:max-h-[70dvh] lg:grid-cols-2">
              {visible.length === 0 ? (
                <p className="col-span-full px-1 py-3 text-sm leading-6 text-muted-foreground">
                  {query.trim()
                    ? "Nothing matches that name."
                    : tray === "placed"
                      ? "Nothing is on the cover yet."
                      : "Every one is already on the cover."}
                </p>
              ) : (
                visible.map((mon) => stickerButton(mon, false))
              )}
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="pk-kicker">Front</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Card tools">
              <button type="button" className="pk-chip" aria-pressed={tool === "move"} onClick={() => setTool("move")}>
                Move
              </button>
              <button type="button" className="pk-chip" aria-pressed={tool === "draw"} onClick={() => setTool("draw")}>
                Draw
              </button>
            </div>
            {tool === "draw" ? (
              <div className="mt-2 grid gap-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Paint colours">
                  {BRUSHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="pk-swatch"
                      style={{ background: color }}
                      aria-label={`Paint ${color}`}
                      aria-pressed={brush === color}
                      onClick={() => setBrush(color)}
                    />
                  ))}
                  <button
                    type="button"
                    className="pk-chip"
                    aria-pressed={brush === "erase"}
                    onClick={() => setBrush("erase")}
                  >
                    Eraser
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Brush size">
                  {BRUSH_SIZES.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      className="pk-chip"
                      aria-pressed={brushSize === size.id}
                      onClick={() => setBrushSize(size.id)}
                    >
                      {size.label}
                    </button>
                  ))}
                  <button type="button" className="pk-chip" onClick={clearPainting} disabled={!draft.painting}>
                    Clear drawing
                  </button>
                </div>
              </div>
            ) : null}
            <canvas
              ref={frontRef}
              width={preview.width}
              height={preview.height}
              aria-label={
                tool === "draw"
                  ? "Card front. Draw on the painting."
                  : `Card front. Drag a ${hideNames ? "riddle" : "Pokémon"} to move it.`
              }
              className="mx-auto mt-2 h-auto w-full max-w-96 touch-none shadow-[4px_4px_0_#16324f]"
              style={{ borderRadius: "5.9% / 3.7%" }}
              onPointerDown={onFrontPointerDown}
            />
            <div className="mt-3 flex items-center gap-3">
              {selectedMon ? (
                <img
                  src={selectedMon.src}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 object-contain"
                  style={{ imageRendering: crispPicture(selectedMon.src) ? "pixelated" : "auto" }}
                />
              ) : null}
              <p className="text-sm leading-6">
                {tool === "draw"
                  ? "Draw on the card. Move lets you drag the pictures again."
                  : selectedMon
                    ? `${selectedMon.name} is selected. Drag it on the card.`
                    : "Tap a picture, then drag it on the card."}
              </p>
            </div>
            {selectedSticker ? (
              <div className="mt-3 grid gap-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sticker shape">
                  {SHAPE_LABELS.map((shape) => (
                    <button
                      key={shape.id}
                      type="button"
                      className="pk-chip"
                      aria-pressed={selectedSticker.shape === shape.id}
                      onClick={() => restyle({ shape: shape.id })}
                    >
                      {shape.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sticker colour">
                  <button
                    type="button"
                    className="pk-chip"
                    aria-pressed={selectedSticker.color === "transparent"}
                    onClick={() => restyle({ color: "transparent" })}
                  >
                    No colour
                  </button>
                  {BRUSHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="pk-swatch"
                      style={{ background: color }}
                      aria-label={`Colour ${color}`}
                      aria-pressed={selectedSticker.color === color}
                      onClick={() => restyle({ color })}
                    />
                  ))}
                  <button
                    type="button"
                    className="pk-chip"
                    onClick={() => restyle({ rotation: clampRotation(selectedSticker.rotation - Math.PI / 12) })}
                  >
                    Turn left
                  </button>
                  <button
                    type="button"
                    className="pk-chip"
                    onClick={() => restyle({ rotation: clampRotation(selectedSticker.rotation + Math.PI / 12) })}
                  >
                    Turn right
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-10 px-4" disabled={!canUndo} onClick={undo}>
                Undo
              </Button>
              <Button type="button" variant="outline" className="h-10 px-4" disabled={!canRedo} onClick={redo}>
                Redo
              </Button>
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
                disabled={!selectedSticker}
                onClick={() => {
                  if (selectedSticker) place(selectedSticker.key);
                }}
              >
                Add another
              </Button>
              <Button type="button" variant="outline" className="h-10 px-4" disabled={!selected} onClick={removeSelected}>
                Remove
              </Button>
              <Button type="button" variant="outline" className="h-10 px-4" onClick={clearCover}>
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
          </div>
        </div>

        <section className="mt-6 border-t-4 border-ink pt-4" aria-labelledby="sticker-print-heading">
          <h3 id="sticker-print-heading" className="font-display text-2xl leading-tight">
            Printing
          </h3>
          <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm leading-6">
            <li>Check the sheet. Each row is one card, front on the left and back on the right.</li>
            <li>Save the PDF.</li>
            <li>
              Print at 100% size on {draft.paper === "a4" ? "A4" : "US Letter"}, not Fit to page. Cut on the corner
              marks.
            </li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex gap-2" role="group" aria-label="Paper size">
              {(["a4", "letter"] as const).map((paper) => (
                <button
                  key={paper}
                  type="button"
                  className="pk-chip"
                  aria-pressed={draft.paper === paper}
                  onClick={() => setPaper(paper)}
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
                <button type="button" className="pk-chip" aria-pressed={!showNames} onClick={() => setBackMode("note")}>
                  Note
                </button>
                <button
                  type="button"
                  className="pk-chip"
                  aria-pressed={showNames}
                  disabled={!plan}
                  title={plan ? "Print every name" : "Too many names to fit on the sticker"}
                  onClick={() => setBackMode("names")}
                >
                  Name list
                </button>
              </div>
            )}
            <Button type="button" className="h-10 px-4" disabled={busy} onClick={() => void savePdf()}>
              {busy ? "Saving PDF…" : "Save PDF"}
            </Button>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={useSuggestedPictures}>
              Suggested pictures
            </Button>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={startAgain}>
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
          <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
            <div>
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
                onClick={() => {
                  if (draft.backText === fresh.backText) return;
                  pushHistory();
                  setDraft((current) => ({ ...current, backText: fresh.backText }));
                }}
            >
              Use the suggested note
            </Button>
            </div>
            <div>
              <p className="pk-kicker">The sheet</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Sheet {page + 1} of {pageCount}
                {pageCount > 1 ? ` on ${layout.label}` : `, ${layout.label}`}.{" "}
                {pageCards.map((item) => item.rangeLabel).join(", ")}. Each row is a different card, front
                on the left and back on the right. {stickerCount} stickers, marked 1 of {stickerCount} through{" "}
                {stickerCount} of {stickerCount}.
              </p>
              {pageCount > 1 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-4"
                    disabled={page <= 0}
                    onClick={() => setSheetPage(page - 1)}
                  >
                    Previous sheet
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-4"
                    disabled={page >= pageCount - 1}
                    onClick={() => setSheetPage(page + 1)}
                  >
                    Next sheet
                  </Button>
                </div>
              ) : null}
              <canvas
                ref={sheetRef}
                aria-label={`${layout.label} print layout, sheet ${page + 1} of ${pageCount}, ${pageCards.map((item) => item.rangeLabel).join(", ")}`}
                className="mt-2 h-auto w-full max-w-[420px] bg-white shadow-[4px_4px_0_#16324f]"
              />
            </div>
          </div>
        </section>
      </div>
      {ghost ? (
        <img
          src={ghost.src}
          alt=""
          className="pk-sticker-ghost pointer-events-none fixed z-[60] h-16 w-16 object-contain"
          style={{ left: ghost.x, top: ghost.y, imageRendering: crispPicture(ghost.src) ? "pixelated" : "auto" }}
        />
      ) : null}
    </div>
  );
}
