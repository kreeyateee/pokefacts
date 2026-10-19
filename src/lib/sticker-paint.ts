import {
  BACK_FOOTER_MM,
  BACK_HEADER_MM,
  BACK_PAD_MM,
  CARD_MM,
  CROP_GAP_MM,
  CROP_MARK_MM,
  LIST_LEADING,
  mmToPx,
  nameListPlan,
  sheetCaption,
  sheetSlots,
  type PlacedSticker,
  type PaperId,
} from "@/lib/sticker-layout";

export type CardPaint = {
  title: string;
  kicker: string;
  description: string;
  backText: string;
  countLabel: string;
  lines: readonly string[];
  showNames: boolean;
  stickers: readonly PlacedSticker[];
  images: ReadonlyMap<string, CanvasImageSource | null>;
  fonts: { display: string; body: string };
  selectedId?: string | null;
};

function pxPerMm(width: number): number {
  return width / CARD_MM.width;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0] ?? "";
    for (const word of words.slice(1)) {
      const next = `${current} ${word}`;
      if (ctx.measureText(next).width <= maxWidth) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

function paintParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; width: number; height: number },
  options: {
    family: string;
    weight: number;
    color: string;
    startPx: number;
    minPx: number;
    align: CanvasTextAlign;
    leading?: number;
  },
): void {
  if (!text.trim() || box.width <= 0 || box.height <= 0) return;
  const leading = options.leading ?? 1.25;
  let size = options.startPx;
  let lines: string[] = [];
  while (size >= options.minPx) {
    ctx.font = `${options.weight} ${size}px ${options.family}`;
    lines = wrapLines(ctx, text, box.width);
    if (lines.length * size * leading <= box.height) break;
    size -= 1;
  }
  ctx.font = `${options.weight} ${Math.max(size, options.minPx)}px ${options.family}`;
  if (size < options.minPx) {
    ctx.font = `${options.weight} ${options.minPx}px ${options.family}`;
    lines = wrapLines(ctx, text, box.width);
    size = options.minPx;
  }
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align;
  ctx.textBaseline = "top";
  const x = options.align === "center" ? box.x + box.width / 2 : box.x;
  const lineHeight = size * leading;
  const maxLines = Math.max(1, Math.floor(box.height / lineHeight));
  for (const [index, line] of lines.slice(0, maxLines).entries()) {
    if (!line) continue;
    ctx.fillText(line, x, box.y + index * lineHeight);
  }
}

function paintStickers(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  for (const sticker of spec.stickers) {
    const size = sticker.scale * width;
    const x = sticker.x * width - size / 2;
    const y = sticker.y * height - size / 2;
    const centerX = sticker.x * width;
    const centerY = sticker.y * height;
    ctx.save();
    ctx.shadowColor = "rgba(22, 50, 79, 0.35)";
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.05;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 253, 246, 0.94)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.strokeStyle = "#16324f";
    ctx.stroke();
    const image = spec.images.get(sticker.key);
    if (image) {
      const inset = size * 0.14;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, x + inset, y + inset, size - inset * 2, size - inset * 2);
      ctx.imageSmoothingEnabled = true;
    }
    if (spec.selectedId === sticker.id) {
      ctx.setLineDash([size * 0.08, size * 0.06]);
      ctx.strokeStyle = "#ffcb05";
      ctx.lineWidth = Math.max(2, size * 0.04);
      ctx.strokeRect(x, y, size, size);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function paintFront(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  const mm = pxPerMm(width);
  const sleeve = ctx.createLinearGradient(0, 0, 0, height);
  sleeve.addColorStop(0, "#ff3a42");
  sleeve.addColorStop(0.42, "#d0121a");
  sleeve.addColorStop(1, "#7a0912");
  ctx.fillStyle = sleeve;
  ctx.fillRect(0, 0, width, height);

  const pad = 3.2 * mm;
  ctx.strokeStyle = "#ffcb05";
  ctx.lineWidth = 1.15 * mm;
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

  const discX = width / 2;
  const discY = height * 0.5;
  const discR = 17.5 * mm;
  ctx.beginPath();
  ctx.arc(discX, discY, discR, 0, Math.PI * 2);
  ctx.fillStyle = "#fff7dc";
  ctx.fill();
  ctx.lineWidth = 0.7 * mm;
  ctx.strokeStyle = "#16324f";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(discX, discY, discR * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffcb05";
  ctx.lineWidth = 1.15 * mm;
  ctx.stroke();

  paintParagraph(ctx, spec.kicker.toUpperCase(), {
    x: pad + 0.6 * mm,
    y: pad + 0.4 * mm,
    width: width - pad * 2,
    height: 5 * mm,
  }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#ffcb05",
    startPx: 4.2 * mm,
    minPx: 3 * mm,
    align: "left",
  });

  paintParagraph(ctx, spec.title, {
    x: pad + 0.4 * mm,
    y: 12 * mm,
    width: width - pad * 2,
    height: 11.2 * mm,
  }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#fffdf6",
    startPx: 8.2 * mm,
    minPx: 4.4 * mm,
    align: "left",
    leading: 1.05,
  });

  ctx.fillStyle = "#ffcb05";
  ctx.fillRect(pad, 24.2 * mm, width - pad * 2, 1.15 * mm);

  const bandTop = height - pad - 16.5 * mm;
  ctx.fillStyle = "#16324f";
  ctx.fillRect(pad, bandTop, width - pad * 2, 16.5 * mm);
  paintParagraph(ctx, spec.description, {
    x: pad + 1.6 * mm,
    y: bandTop + 1.5 * mm,
    width: width - pad * 2 - 3.2 * mm,
    height: 13.5 * mm,
  }, {
    family: spec.fonts.body,
    weight: 700,
    color: "#fffdf6",
    startPx: 3.5 * mm,
    minPx: 2.3 * mm,
    align: "left",
    leading: 1.25,
  });

  paintStickers(ctx, spec, width, height);
}

function splitLine(line: string): { mark: string; name: string } {
  const space = line.indexOf(" ");
  if (space <= 0) return { mark: "", name: line };
  return { mark: line.slice(0, space), name: line.slice(space + 1) };
}

function paintBack(ctx: CanvasRenderingContext2D, spec: CardPaint, width: number, height: number) {
  const mm = pxPerMm(width);
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, width, height);

  const headerH = BACK_HEADER_MM * mm;
  const footerH = BACK_FOOTER_MM * mm;
  ctx.fillStyle = "#16324f";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#ffcb05";
  ctx.fillRect(0, headerH - 1.15 * mm, width, 1.15 * mm);
  ctx.fillStyle = "#e10600";
  ctx.fillRect(0, height - footerH, width, footerH);
  ctx.fillStyle = "#ffcb05";
  ctx.fillRect(0, height - footerH - 1.05 * mm, width, 1.05 * mm);

  const pad = BACK_PAD_MM * mm;
  paintParagraph(ctx, "PLAYLIST", {
    x: pad,
    y: 2.2 * mm,
    width: width - pad * 2,
    height: 4 * mm,
  }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#ffcb05",
    startPx: 3.2 * mm,
    minPx: 2.4 * mm,
    align: "left",
  });
  paintParagraph(ctx, spec.title, {
    x: pad,
    y: 6.4 * mm,
    width: width - pad * 2,
    height: 9 * mm,
  }, {
    family: spec.fonts.display,
    weight: 700,
    color: "#fffdf6",
    startPx: 5.6 * mm,
    minPx: 3.4 * mm,
    align: "left",
    leading: 1.05,
  });
  paintParagraph(ctx, spec.countLabel, {
    x: pad,
    y: 16.2 * mm,
    width: width - pad * 2,
    height: 4 * mm,
  }, {
    family: spec.fonts.body,
    weight: 700,
    color: "#ffcb05",
    startPx: 3 * mm,
    minPx: 2.2 * mm,
    align: "left",
  });

  const box = {
    x: pad,
    y: headerH + 1.6 * mm,
    width: width - pad * 2,
    height: height - headerH - footerH - 2.8 * mm,
  };
  const plan = spec.showNames ? nameListPlan(spec.lines) : null;
  if (!plan) {
    paintParagraph(ctx, spec.backText, box, {
      family: spec.fonts.body,
      weight: 700,
      color: "#16324f",
      startPx: 3.4 * mm,
      minPx: 2.3 * mm,
      align: "left",
      leading: 1.3,
    });
    return;
  }

  const fontPx = plan.fontPt * (25.4 / 72) * mm;
  const linePx = fontPx * LIST_LEADING;
  const colW = box.width / plan.columns;
  const rows = Math.ceil(spec.lines.length / plan.columns);
  ctx.textBaseline = "top";
  for (let column = 0; column < plan.columns; column += 1) {
    const slice = spec.lines.slice(column * rows, (column + 1) * rows);
    const left = box.x + column * colW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, box.y, colW - 0.6 * mm, box.height);
    ctx.clip();
    slice.forEach((line, index) => {
      const parts = splitLine(line);
      const y = box.y + index * linePx;
      let cursor = left;
      if (parts.mark) {
        ctx.font = `700 ${fontPx}px ${spec.fonts.display}`;
        ctx.fillStyle = "#e10600";
        ctx.textAlign = "left";
        ctx.fillText(parts.mark, cursor, y);
        cursor += ctx.measureText(`${parts.mark} `).width;
      }
      ctx.font = `700 ${fontPx}px ${spec.fonts.body}`;
      ctx.fillStyle = "#16324f";
      ctx.fillText(parts.name, cursor, y);
    });
    ctx.restore();
  }
}

export function paintCard(ctx: CanvasRenderingContext2D, face: "front" | "back", spec: CardPaint) {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.shadowColor = "transparent";
  if (face === "front") paintFront(ctx, spec, width, height);
  else paintBack(ctx, spec, width, height);
}

function cropMarks(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, dpi: number) {
  const gap = mmToPx(CROP_GAP_MM, dpi);
  const mark = mmToPx(CROP_MARK_MM, dpi);
  ctx.strokeStyle = "#16324f";
  ctx.lineWidth = Math.max(1, mmToPx(0.25, dpi));
  ctx.beginPath();
  const corners = [
    [x, y, -1, -1],
    [x + width, y, 1, -1],
    [x, y + height, -1, 1],
    [x + width, y + height, 1, 1],
  ] as const;
  for (const [cx, cy, sx, sy] of corners) {
    ctx.moveTo(cx + sx * gap, cy);
    ctx.lineTo(cx + sx * (gap + mark), cy);
    ctx.moveTo(cx, cy + sy * gap);
    ctx.lineTo(cx, cy + sy * (gap + mark));
  }
  ctx.stroke();
}

export function paintSheet(
  ctx: CanvasRenderingContext2D,
  options: {
    paper: PaperId;
    dpi: number;
    front: CanvasImageSource;
    back: CanvasImageSource;
    fonts: { display: string; body: string };
    brand: string;
  },
) {
  const layout = sheetSlots(options.paper);
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const cardW = mmToPx(CARD_MM.width, options.dpi);
  const cardH = mmToPx(CARD_MM.height, options.dpi);
  for (const slot of layout.slots) {
    const image = slot.face === "front" ? options.front : options.back;
    ctx.drawImage(image, mmToPx(slot.x, options.dpi), mmToPx(slot.y, options.dpi), cardW, cardH);
  }
  for (const slot of layout.slots) {
    cropMarks(ctx, mmToPx(slot.x, options.dpi), mmToPx(slot.y, options.dpi), cardW, cardH, options.dpi);
  }

  const caption = sheetCaption();
  const fontPx = (7.5 * options.dpi) / 72;
  const indexPx = (11 * options.dpi) / 72;
  const total = layout.slots.length;
  ctx.fillStyle = "#16324f";
  ctx.textBaseline = "top";
  layout.slots.forEach((slot, index) => {
    const x = mmToPx(slot.x, options.dpi);
    const y = mmToPx(slot.y, options.dpi);
    const labelX = slot.face === "front" ? x - mmToPx(3, options.dpi) : x + cardW + mmToPx(3, options.dpi);
    ctx.textAlign = slot.face === "front" ? "right" : "left";
    ctx.font = `700 ${indexPx}px ${options.fonts.body}`;
    ctx.fillText(`${index + 1} of ${total}`, labelX, y + mmToPx(2, options.dpi));
    ctx.font = `600 ${indexPx * 0.82}px ${options.fonts.body}`;
    ctx.fillText(slot.face === "front" ? "Front" : "Back", labelX, y + mmToPx(2, options.dpi) + indexPx * 1.2);
  });
  const markReach = mmToPx(CROP_GAP_MM + CROP_MARK_MM, options.dpi);
  ctx.font = `700 ${fontPx}px ${options.fonts.body}`;
  ctx.fillStyle = "#16324f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const first = layout.slots[0];
  if (first) {
    const cardTop = mmToPx(first.y, options.dpi);
    ctx.fillText(options.brand, width / 2, Math.max(fontPx, (cardTop - markReach) / 2));
  }
  const last = layout.slots[layout.slots.length - 1];
  if (last) {
    const cardBottom = mmToPx(last.y + CARD_MM.height, options.dpi);
    const areaTop = cardBottom + markReach;
    const areaBottom = height - mmToPx(2, options.dpi);
    const maxWidth = width - mmToPx(16, options.dpi);
    const lines = wrapLines(ctx, caption, maxWidth);
    const lineHeight = fontPx * 1.25;
    const block = lines.length * lineHeight;
    const start = areaTop + Math.max(0, areaBottom - areaTop - block) / 2 + lineHeight / 2;
    for (const [index, line] of lines.entries()) {
      ctx.fillText(line, width / 2, start + index * lineHeight);
    }
  }
}
