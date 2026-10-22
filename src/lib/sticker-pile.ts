/**
 * The pile front: an edge-to-edge collage, like a poster of the whole Pokédex.
 * The biggest Pokémon go first, as big as the card allows, and everyone else is packed into the gaps
 * between their shapes (not just their boxes), turned a little when that fits better.
 * Everyone appears exactly once, at their real Pokédex height.
 * Everything is in millimetres inside the pile area, so it can be tested without a canvas.
 */

/** A coarse alpha mask of a trimmed picture: `data[row * width + column]` is 1 where the picture is opaque. */
export type PileMask = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type PileMember = {
  key: string;
  heightDm: number;
  /** Width over height of the trimmed picture. */
  aspect: number;
  /** Its shape. Without one the whole box counts as picture. */
  mask?: PileMask;
};

export type PilePlacement = {
  key: string;
  /** Top-left corner of the unrotated box (`cx - width / 2`, `cy - height / 2`). */
  x: number;
  y: number;
  /** Size of the unrotated picture. */
  width: number;
  height: number;
  /** Centre of the picture; rotate around this. */
  cx: number;
  cy: number;
  /** Clockwise turn in radians, as canvas `rotate` takes it. */
  rotation: number;
};

/** Grid used to track which parts of the card are covered. */
const CELL_MM = 0.5;
/** Cells around the grid, so stamps a cell over the edge and their outlines need no bounds checks. */
const PAD = 2;
const EMPTY = 0;
const COVERED = 1;
const WALL = 2;

/** A picture may lie over this share of its own opaque cells already covered. */
const OVERLAP_LIMIT = 0.1;
/** A first place that finds no room at all may overlap this much before the whole pile shrinks. */
const SQUEEZE_OVERLAP_LIMIT = 0.2;
/** The smallest are drawn at least this share of the area's height. */
const MIN_SHARE = 0.04;
/** Each try that does not fit everyone shrinks the scale by this. */
const SHRINK = 0.95;
const MAX_ATTEMPTS = 80;
/** Fresh tries at each scale before shrinking. */
const TRIES_PER_SCALE = 1;
/** Halvings of the last shrink step, to win back size: everyone as big as they can be. */
const REFINE_STEPS = 4;
/** Skip scales whose pictures add up to more than this share of the area: they cannot fit. */
const PACKING = 1;
/** At least this share of the area's height counts as a giant: kept upright when it can. */
const GIANT_SHARE = 0.4;
/** Scoring a spot: lower is better. */
const OVERLAP_WEIGHT = 5;
/** A giant turned to a side must win at least this share of extra height to beat upright. */
const SIZE_WEIGHT = 2;
const GIANT_TURN_WEIGHT = 2;
const GAP_TARGETS = 4;
const RANDOM_SPOTS = 8;
const HUG_ITEMS = 2;

const DEGREE = Math.PI / 180;
/** The turns tried, with a small cost so upright wins a tie. Never upside down: on a child's card that looks like a mistake. */
const TURNS = [
  { angle: 0, cost: 0 },
  { angle: 12 * DEGREE, cost: 0.04 },
  { angle: -12 * DEGREE, cost: 0.04 },
  { angle: 25 * DEGREE, cost: 0.08 },
  { angle: -25 * DEGREE, cost: 0.08 },
  { angle: 90 * DEGREE, cost: 0.2 },
];
const ALL_TURNS = TURNS.map((_, index) => index);
const GIANT_TURNS = [0, 1, 2, 5];

const FULL_MASK: PileMask = { width: 1, height: 1, data: new Uint8Array([1]) };

/** A small fixed random sequence, so the same seed always gives the same pile. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from text, so each card gets its own steady pile. */
export function pileSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A coarse mask from RGBA pixels (as `getImageData().data` gives them), longest side `resolution` cells.
 * A cell is opaque when at least half its pixels have alpha 32 or more.
 */
export function maskFromAlpha(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  resolution = 48,
): PileMask {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const side = Math.max(1, Math.round(resolution));
  const longest = Math.max(w, h);
  const maskW = Math.max(1, Math.round((w / longest) * side));
  const maskH = Math.max(1, Math.round((h / longest) * side));
  const data = new Uint8Array(maskW * maskH);
  if (rgba.length < w * h * 4) return { width: maskW, height: maskH, data: data.fill(1) };
  for (let my = 0; my < maskH; my += 1) {
    const top = Math.floor((my * h) / maskH);
    const bottom = Math.max(top + 1, Math.floor(((my + 1) * h) / maskH));
    for (let mx = 0; mx < maskW; mx += 1) {
      const left = Math.floor((mx * w) / maskW);
      const right = Math.max(left + 1, Math.floor(((mx + 1) * w) / maskW));
      let opaque = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) if ((rgba[(y * w + x) * 4 + 3] ?? 0) >= 32) opaque += 1;
      }
      data[my * maskW + mx] = opaque * 2 >= (bottom - top) * (right - left) ? 1 : 0;
    }
  }
  return { width: maskW, height: maskH, data };
}

/** A picture rasterised onto the grid at one size and turn. Offsets are into the padded grid. */
type Stamp = {
  width: number;
  height: number;
  angle: number;
  /** Rotated bounding box in millimetres and in cells. */
  boxW: number;
  boxH: number;
  columns: number;
  rows: number;
  /** Opaque cells, and the empty cells right around them. */
  cells: Int32Array;
  ring: Int32Array;
  /** Opaque cells to line up with a gap: [column, row, column, row, …]. */
  anchors: number[];
  /** Furthest top-left cell that keeps the box inside the area. */
  maxColumn: number;
  maxRow: number;
};

type Area = { width: number; height: number; stride: number; columns: number; rows: number };

function maskOf(member: PileMember): PileMask {
  const mask = member.mask;
  if (!mask || mask.width < 1 || mask.height < 1 || mask.data.length < mask.width * mask.height) return FULL_MASK;
  return mask.data.some((value) => value) ? mask : FULL_MASK;
}

/** Rasterise by inverse mapping: each cell centre in the rotated box is turned back and looked up in the mask. */
function makeStamp(mask: PileMask, width: number, height: number, angle: number, area: Area): Stamp {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const boxW = width * Math.abs(cos) + height * Math.abs(sin);
  const boxH = width * Math.abs(sin) + height * Math.abs(cos);
  const columns = Math.max(1, Math.ceil(boxW / CELL_MM - 1e-6));
  const rows = Math.max(1, Math.ceil(boxH / CELL_MM - 1e-6));
  const bits = new Uint8Array(columns * rows);
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    const py = (row + 0.5) * CELL_MM - boxH / 2;
    for (let column = 0; column < columns; column += 1) {
      const px = (column + 0.5) * CELL_MM - boxW / 2;
      const u = px * cos + py * sin;
      const v = -px * sin + py * cos;
      const mx = Math.floor((u / width + 0.5) * mask.width);
      const my = Math.floor((v / height + 0.5) * mask.height);
      if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height || !mask.data[my * mask.width + mx]) continue;
      bits[row * columns + column] = 1;
      count += 1;
    }
  }
  if (count === 0) {
    bits[Math.floor(rows / 2) * columns + Math.floor(columns / 2)] = 1;
    count = 1;
  }

  const cells = new Int32Array(count);
  const ringSeen = new Uint8Array((columns + 2) * (rows + 2));
  const ring: number[] = [];
  let filled = 0;
  let top = -1;
  let bottom = -1;
  let left = -1;
  let right = -1;
  let middle = -1;
  let middleDistance = Number.POSITIVE_INFINITY;
  const has = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < columns && row < rows && bits[row * columns + column] === 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (!bits[index]) continue;
      cells[filled] = row * area.stride + column;
      filled += 1;
      if (top < 0) top = index;
      bottom = index;
      if (left < 0 || column < left % columns) left = index;
      if (right < 0 || column > right % columns) right = index;
      const distance = Math.abs(column + 0.5 - columns / 2) + Math.abs(row + 0.5 - rows / 2);
      if (distance < middleDistance) {
        middle = index;
        middleDistance = distance;
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nc = column + dc;
        const nr = row + dr;
        if (has(nc, nr)) continue;
        const seen = (nr + 1) * (columns + 2) + nc + 1;
        if (ringSeen[seen]) continue;
        ringSeen[seen] = 1;
        ring.push(nr * area.stride + nc);
      }
    }
  }
  const anchors: number[] = [];
  for (const index of [top, left, right, bottom, middle]) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    let known = false;
    for (let at = 0; at < anchors.length; at += 2) if (anchors[at] === column && anchors[at + 1] === row) known = true;
    if (!known) anchors.push(column, row);
  }
  return {
    width,
    height,
    angle,
    boxW,
    boxH,
    columns,
    rows,
    cells,
    ring: Int32Array.from(ring),
    anchors,
    maxColumn: Math.max(0, Math.floor((area.width - boxW) / CELL_MM + 0.5)),
    maxRow: Math.max(0, Math.floor((area.height - boxH) / CELL_MM + 0.5)),
  };
}

class Grid implements Area {
  readonly columns: number;
  readonly rows: number;
  readonly stride: number;
  readonly cells: Uint8Array;
  covered = 0;
  private pointer = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.columns = Math.max(1, Math.ceil(width / CELL_MM - 1e-6));
    this.rows = Math.max(1, Math.ceil(height / CELL_MM - 1e-6));
    this.stride = this.columns + 2 * PAD;
    this.cells = new Uint8Array(this.stride * (this.rows + 2 * PAD)).fill(WALL);
    for (let row = 0; row < this.rows; row += 1) {
      const start = this.origin(0, row);
      this.cells.fill(EMPTY, start, start + this.columns);
    }
  }

  origin(column: number, row: number): number {
    return (row + PAD) * this.stride + column + PAD;
  }

  get share(): number {
    return this.covered / (this.columns * this.rows);
  }

  /** Covered cells under the stamp, or -1 once there are more than `limit`. */
  overlap(stamp: Stamp, at: number, limit: number): number {
    const { cells } = this;
    const offsets = stamp.cells;
    let overlap = 0;
    for (let index = 0; index < offsets.length; index += 1) {
      if (cells[at + offsets[index]] === COVERED) {
        overlap += 1;
        if (overlap > limit) return -1;
      }
    }
    return overlap;
  }

  /** Share of the stamp's outline that touches pictures or the edge. */
  contact(stamp: Stamp, at: number): number {
    const { cells } = this;
    const offsets = stamp.ring;
    if (offsets.length === 0) return 0;
    let touching = 0;
    for (let index = 0; index < offsets.length; index += 1) if (cells[at + offsets[index]] !== EMPTY) touching += 1;
    return touching / offsets.length;
  }

  fill(stamp: Stamp, at: number) {
    const { cells } = this;
    const offsets = stamp.cells;
    for (let index = 0; index < offsets.length; index += 1) {
      const cell = at + offsets[index];
      if (cells[cell] === EMPTY) {
        cells[cell] = COVERED;
        this.covered += 1;
      }
    }
  }

  private isGap(index: number): boolean {
    return this.cells[this.origin(index % this.columns, Math.floor(index / this.columns))] === EMPTY;
  }

  /** The first empty cell from the top-left, as [column, row]. */
  firstGap(): [number, number] | null {
    const total = this.columns * this.rows;
    while (this.pointer < total && !this.isGap(this.pointer)) this.pointer += 1;
    if (this.pointer >= total) return null;
    return [this.pointer % this.columns, Math.floor(this.pointer / this.columns)];
  }

  /** The next empty cell after a random one. */
  randomGap(random: () => number): [number, number] | null {
    const total = this.columns * this.rows;
    const start = Math.floor(random() * total);
    for (let step = 0; step < total; step += 1) {
      const index = (start + step) % total;
      if (this.isGap(index)) return [index % this.columns, Math.floor(index / this.columns)];
    }
    return null;
  }
}

type Prepared = { member: PileMember; aspect: number; mask: PileMask; fill: number };
type Choice = { stamp: Stamp; column: number; row: number; score: number };
type Box = { column: number; row: number; columns: number; rows: number };

/** Tallest height (unrotated) whose box, turned by `angle`, still fits the area. */
function capFor(aspect: number, angle: number, width: number, height: number): number {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return Math.min(width / (aspect * cos + sin), height / (aspect * sin + cos)) * (1 - 1e-6);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** One try at a scale: a fresh grid and everything placed on it so far. */
class Packer {
  readonly grid: Grid;
  readonly placed: PilePlacement[] = [];
  readonly boxes: Box[] = [];
  private readonly stamps = new Map<string, Stamp>();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly random: () => number,
  ) {
    this.grid = new Grid(width, height);
  }

  stampFor(item: Prepared, index: number, turn: number, height: number): Stamp | null {
    const key = `${index}:${turn}:${height.toFixed(4)}`;
    const cached = this.stamps.get(key);
    if (cached) return cached;
    const width = height * item.aspect;
    if (!(height > 0) || !(width > 0)) return null;
    const stamp = makeStamp(item.mask, width, height, TURNS[turn].angle, this.grid);
    if (stamp.boxW > this.width + 1e-6 || stamp.boxH > this.height + 1e-6) return null;
    this.stamps.set(key, stamp);
    return stamp;
  }

  private consider(stamp: Stamp, column: number, row: number, limit: number, bias: number, best: Choice | null) {
    const c = clamp(column, 0, stamp.maxColumn);
    const r = clamp(row, 0, stamp.maxRow);
    const at = this.grid.origin(c, r);
    const overlap = this.grid.overlap(stamp, at, limit);
    if (overlap < 0) return best;
    const score = (OVERLAP_WEIGHT * overlap) / stamp.cells.length - this.grid.contact(stamp, at) + bias;
    return best && best.score <= score ? best : { stamp, column: c, row: r, score };
  }

  /** Spots that line an opaque cell up with each gap, random spots, and spots right beside placed pictures. */
  search(
    stamp: Stamp,
    limit: number,
    bias: number,
    gaps: number[],
    spots: number[],
    hugs: Box[],
    best: Choice | null,
  ): Choice | null {
    const { anchors } = stamp;
    for (let g = 0; g < gaps.length; g += 2) {
      for (let a = 0; a < anchors.length; a += 2) {
        best = this.consider(stamp, gaps[g] - anchors[a], gaps[g + 1] - anchors[a + 1], limit, bias, best);
      }
    }
    for (let s = 0; s < spots.length; s += 2) {
      best = this.consider(
        stamp,
        Math.round(spots[s] * stamp.maxColumn),
        Math.round(spots[s + 1] * stamp.maxRow),
        limit,
        bias,
        best,
      );
    }
    for (const box of hugs) {
      const middleRow = box.row + Math.round((box.rows - stamp.rows) / 2);
      const middleColumn = box.column + Math.round((box.columns - stamp.columns) / 2);
      best = this.consider(stamp, box.column + box.columns, middleRow, limit, bias, best);
      best = this.consider(stamp, box.column - stamp.columns, middleRow, limit, bias, best);
      best = this.consider(stamp, middleColumn, box.row + box.rows, limit, bias, best);
      best = this.consider(stamp, middleColumn, box.row - stamp.rows, limit, bias, best);
    }
    return best;
  }

  /** Every spot on a coarse lattice: the last resort before shrinking the pile. */
  sweep(stamp: Stamp, limit: number, bias: number, best: Choice | null): Choice | null {
    const step = Math.max(1, Math.floor(Math.min(stamp.columns, stamp.rows) / 3));
    for (let row = 0; row <= stamp.maxRow + step - 1; row += step) {
      for (let column = 0; column <= stamp.maxColumn + step - 1; column += step) {
        best = this.consider(stamp, column, row, limit, bias, best);
      }
    }
    return best;
  }

  gapTargets(count: number): number[] {
    const targets: number[] = [];
    const first = this.grid.firstGap();
    if (first) targets.push(...first);
    for (let index = 1; index < count; index += 1) {
      const gap = this.grid.randomGap(this.random);
      if (gap) targets.push(...gap);
    }
    return targets;
  }

  place(choice: Choice, key: string) {
    const { stamp, column, row } = choice;
    this.grid.fill(stamp, this.grid.origin(column, row));
    this.boxes.push({ column, row, columns: stamp.columns, rows: stamp.rows });
    const cx = clamp(column * CELL_MM + stamp.boxW / 2, stamp.boxW / 2, this.width - stamp.boxW / 2);
    const cy = clamp(row * CELL_MM + stamp.boxH / 2, stamp.boxH / 2, this.height - stamp.boxH / 2);
    this.placed.push({
      key,
      x: cx - stamp.width / 2,
      y: cy - stamp.height / 2,
      width: stamp.width,
      height: stamp.height,
      cx,
      cy,
      rotation: stamp.angle,
    });
  }
}

function prepare(member: PileMember): Prepared {
  const mask = maskOf(member);
  let opaque = 0;
  for (let index = 0; index < mask.width * mask.height; index += 1) opaque += mask.data[index] ? 1 : 0;
  return {
    member,
    aspect: clamp(Number.isFinite(member.aspect) && member.aspect > 0 ? member.aspect : 1, 0.3, 3),
    mask,
    fill: opaque / (mask.width * mask.height),
  };
}

/** Everyone once, biggest first. False when someone does not fit at this scale. */
function placeEveryone(packer: Packer, ordered: readonly Prepared[], trueHeight: (item: Prepared) => number): boolean {
  const { width, height, random } = packer;
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index];
    const tall = trueHeight(item);
    const giant = tall >= height * GIANT_SHARE;
    const turns = giant ? GIANT_TURNS : ALL_TURNS;
    const gaps = packer.gapTargets(GAP_TARGETS);
    const spots = Array.from({ length: RANDOM_SPOTS * 2 }, () => random());
    const hugs: Box[] = [];
    for (let hug = 0; hug < HUG_ITEMS && packer.boxes.length > 0; hug += 1) {
      hugs.push(packer.boxes[Math.floor(random() * packer.boxes.length)]);
    }
    const options: { stamp: Stamp; limit: number; bias: number }[] = [];
    // A long giant may lie on its side when that makes it much bigger than standing up.
    const upright = Math.min(tall, capFor(item.aspect, 0, width, height));
    for (const turn of turns) {
      const size = Math.min(tall, capFor(item.aspect, TURNS[turn].angle, width, height));
      const stamp = packer.stampFor(item, index, turn, size);
      if (!stamp) continue;
      const cost = TURNS[turn].cost * (giant ? GIANT_TURN_WEIGHT : 1);
      options.push({ stamp, limit: Math.floor(stamp.cells.length * OVERLAP_LIMIT), bias: cost - (SIZE_WEIGHT * size) / upright });
    }
    let best: Choice | null = null;
    for (const option of options) best = packer.search(option.stamp, option.limit, option.bias, gaps, spots, hugs, best);
    if (!best) for (const option of options) best = packer.sweep(option.stamp, option.limit, option.bias, best);
    // A small one with no room left may sit a little further over its neighbours, in front of them.
    if (!best && !giant) {
      for (const option of options) {
        const limit = Math.floor(option.stamp.cells.length * SQUEEZE_OVERLAP_LIMIT);
        best = packer.sweep(option.stamp, limit, option.bias, best);
      }
    }
    if (!best) return false;
    packer.place(best, item.member.key);
  }
  return true;
}

/**
 * Fill the area with everyone once, biggest first and as big as everyone fits.
 * Drawing order is the array order, so later, smaller pictures sit on top.
 * Draw each one turned by `rotation` around (`cx`, `cy`), at `width` × `height`.
 */
export function pilePhoto(members: readonly PileMember[], width: number, height: number, seed: number): PilePlacement[] {
  if (members.length === 0 || !(width > 0) || !(height > 0)) return [];
  const random = seededRandom(seed);
  const ordered = members
    .map((member, index) => ({ item: prepare(member), index }))
    .sort((a, b) => (b.item.member.heightDm || 0) - (a.item.member.heightDm || 0) || a.index - b.index)
    .map(({ item }) => item);
  const tallestDm = Math.max(0, ordered[0]?.member.heightDm || 0);

  /** Everyone once at this scale, or null. Hopeless scales are skipped without trying. */
  const fitAt = (scale: number, floor: number, last: boolean): Packer | null => {
    const trueHeight = (item: Prepared) => Math.max(floor, (item.member.heightDm || 0) * scale);
    let opaque = 0;
    for (const item of ordered) {
      const tall = Math.min(trueHeight(item), capFor(item.aspect, 0, width, height));
      opaque += item.fill * tall * tall * item.aspect;
    }
    if (opaque > PACKING * width * height && !last) return null;
    for (let tries = 0; tries < TRIES_PER_SCALE; tries += 1) {
      const packer = new Packer(width, height, random);
      if (placeEveryone(packer, ordered, trueHeight)) return packer;
    }
    return null;
  };

  // Start with the tallest at the full height, shrink in small steps until everyone fits once,
  // then win back part of the last step.
  let scale = tallestDm > 0 ? height / tallestDm : 1;
  let failed = 0;
  let floor = height * MIN_SHARE;
  let fit: Packer | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !fit; attempt += 1) {
    // Past a point the floor gives way too, so a crowded card still fits everyone.
    floor = height * MIN_SHARE * Math.min(1, SHRINK ** (attempt - MAX_ATTEMPTS / 2));
    fit = fitAt(scale, floor, attempt === MAX_ATTEMPTS - 1);
    if (!fit) {
      failed = scale;
      scale *= SHRINK;
    }
  }
  if (!fit) return [];
  for (let step = 0; step < REFINE_STEPS && failed > 0; step += 1) {
    const middle = Math.sqrt(scale * failed);
    const better = fitAt(middle, floor, false);
    if (better) {
      fit = better;
      scale = middle;
    } else failed = middle;
  }

  return fit.placed;
}

/** Share of the area's cells covered by the opaque parts of a pile, on the same grid the packer uses. */
export function pileCoverage(
  members: readonly PileMember[],
  placements: readonly PilePlacement[],
  width: number,
  height: number,
): number {
  if (!(width > 0) || !(height > 0)) return 0;
  const grid = new Grid(width, height);
  const masks = new Map(members.map((member) => [member.key, maskOf(member)]));
  for (const placement of placements) {
    const mask = masks.get(placement.key);
    if (!mask || !(placement.width > 0) || !(placement.height > 0)) continue;
    const stamp = makeStamp(mask, placement.width, placement.height, placement.rotation, grid);
    if (stamp.boxW > width + CELL_MM || stamp.boxH > height + CELL_MM) continue;
    const column = clamp(Math.round((placement.cx - stamp.boxW / 2) / CELL_MM), 0, stamp.maxColumn);
    const row = clamp(Math.round((placement.cy - stamp.boxH / 2) / CELL_MM), 0, stamp.maxRow);
    grid.fill(stamp, grid.origin(column, row));
  }
  return grid.share;
}
