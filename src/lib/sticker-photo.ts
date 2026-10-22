/**
 * The group photo front: every Pokémon on the card, lined up like a school photo.
 * The tallest stand at the back and the smallest at the front, each drawn to its real Pokédex height.
 * Inside every row they group by Pokédex colour in one fixed rainbow order, so colours line up in bands.
 * Everything here is in millimetres inside the photo area, so it can be tested without a canvas.
 */

export type PhotoMember = {
  key: string;
  /** Pokédex height in decimetres. Unknown heights stand as tall as the shortest known one. */
  heightDm: number;
  /** Width over height of the picture once its empty margin is trimmed. */
  aspect: number;
  /** Pokédex colour, such as "red" or "blue". */
  color?: string;
};

/** Rainbow first, then the quiet colours. Every row uses the same order, so the bands line up. */
export const PHOTO_COLOR_ORDER = ["red", "yellow", "green", "blue", "purple", "pink", "brown", "white", "gray", "black"] as const;

function colorRank(color: string | undefined): number {
  const rank = PHOTO_COLOR_ORDER.indexOf((color ?? "").toLowerCase() as (typeof PHOTO_COLOR_ORDER)[number]);
  return rank < 0 ? PHOTO_COLOR_ORDER.length : rank;
}

export type PhotoPlacement = {
  key: string;
  /** Centre of the picture's base, where the Pokémon stands. */
  x: number;
  baseline: number;
  width: number;
  height: number;
  row: number;
};

/** Nobody shrinks below this share of the tallest, so the smallest are still there to find. */
export const PHOTO_MIN_SHARE = 0.14;
/** Someone at the reference height fills at most this much of the photo. */
export const PHOTO_MAX_SHARE = 0.62;
/** Giants are capped at this much of the photo's height. */
const GIANT_MAX_SHARE = 0.85;
/** No one picture is wider than this share of the photo. */
const WIDEST_SHARE = 0.9;
/** Neighbours in a row overlap, like a crowd squeezing into frame. */
const ROW_STEP = 0.66;
/** Each row behind stands this share of the row in front's height higher. */
const ROW_RISE = 0.42;

/** Giants above the reference height grow at most this much more, so one Rayquaza can't shrink the class. */
export const PHOTO_GIANT_SHARE = 1.5;
/** Sizes are measured against this percentile of heights, not the single tallest. */
const REFERENCE_PERCENTILE = 0.9;

function share(heightDm: number, reference: number): number {
  if (!(reference > 0) || !(heightDm > 0)) return PHOTO_MIN_SHARE;
  return Math.min(PHOTO_GIANT_SHARE, Math.max(PHOTO_MIN_SHARE, heightDm / reference));
}

/** The height everyone is measured against: nearly the tallest, but not a lone giant. */
export function referenceHeight(members: readonly PhotoMember[]): number {
  const heights = members.map((member) => member.heightDm).filter((height) => height > 0).sort((a, b) => a - b);
  if (heights.length === 0) return 0;
  return heights[Math.round(REFERENCE_PERCENTILE * (heights.length - 1))] ?? 0;
}

/** Tallest first. Ties keep the card's own order, so the photo never reshuffles itself. */
export function photoOrder(members: readonly PhotoMember[]): PhotoMember[] {
  return members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => b.member.heightDm - a.member.heightDm || a.index - b.index)
    .map(({ member }) => member);
}

/** Lay the crowd out at one scale: `scale` is the drawn height of someone at the reference height, in mm. */
function layoutAt(ordered: readonly PhotoMember[], scale: number, width: number, height: number): PhotoPlacement[] {
  const reference = referenceHeight(ordered);
  const sized = ordered.map((member) => {
    const aspect = Math.max(0.3, Math.min(3, member.aspect || 1));
    // A very long giant is capped at the photo's width, so it doesn't shrink everyone else.
    const drawn = Math.min(
      scale * share(member.heightDm, reference),
      (width * WIDEST_SHARE) / aspect,
      height * GIANT_MAX_SHARE,
    );
    return { member, height: drawn, width: drawn * aspect };
  });
  // Fill rows from the back, tallest first. Each picture starts a step along from the one before,
  // so neighbours overlap. A row is full when the next picture would run off the side.
  type Sized = (typeof sized)[number];
  const rows: Sized[][] = [];
  let row: Sized[] = [];
  let reach = 0;
  for (const item of sized) {
    const last = row[row.length - 1];
    const left = last ? reach - last.width + last.width * ROW_STEP : 0;
    if (last && left + item.width > width) {
      rows.push(row);
      row = [item];
      reach = item.width;
    } else {
      row.push(item);
      reach = left + item.width;
    }
  }
  if (row.length > 0) rows.push(row);
  const sorted = rows.map((members) =>
    members
      .slice()
      .sort((a, b) => colorRank(a.member.color) - colorRank(b.member.color) || b.height - a.height),
  );

  // The front row stands on the bottom edge. Each row behind stands a little higher.
  const baselines: number[] = [];
  let baseline = height;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    baselines[index] = baseline;
    const members = rows[index] ?? [];
    const average = members.reduce((sum, item) => sum + item.height, 0) / Math.max(1, members.length);
    baseline -= average * ROW_RISE;
  }

  return sorted.flatMap((members, rowIndex) => {
    const lefts: number[] = [];
    members.forEach((item, index) => {
      const previous = members[index - 1];
      lefts.push(previous ? (lefts[index - 1] ?? 0) + previous.width * ROW_STEP : 0);
    });
    // The colour sort can put a wider Pokémon last, so squeeze the spacing if the row now runs over.
    const lastWidth = members[members.length - 1]?.width ?? 0;
    const lastLeft = lefts[members.length - 1] ?? 0;
    if (lastLeft > 0 && lastLeft + lastWidth > width) {
      const squeeze = Math.max(0, width - lastWidth) / lastLeft;
      for (let index = 0; index < lefts.length; index += 1) lefts[index] = (lefts[index] ?? 0) * squeeze;
    }
    const span = members.length > 0 ? (lefts[members.length - 1] ?? 0) + lastWidth : 0;
    // Every other row sits a little off-centre, so faces peek between the heads in front.
    const nudge = rowIndex % 2 === 1 ? Math.min((width - span) / 2, (members[0]?.width ?? 0) * 0.18) : 0;
    const offset = (width - span) / 2 + nudge;
    return members.map((item, index) => ({
      key: item.member.key,
      x: offset + (lefts[index] ?? 0) + item.width / 2,
      baseline: baselines[rowIndex] ?? height,
      width: item.width,
      height: item.height,
      row: rowIndex,
    }));
  });
}

function fits(placements: readonly PhotoPlacement[], width: number): boolean {
  return placements.every(
    (item) => item.baseline - item.height >= 0 && item.x - item.width / 2 >= -0.001 && item.x + item.width / 2 <= width + 0.001,
  );
}

/**
 * The biggest photo that fits the area. Drawing order is the array order: back rows first.
 * An empty crowd gives an empty photo.
 */
export function groupPhoto(members: readonly PhotoMember[], width: number, height: number): PhotoPlacement[] {
  if (members.length === 0 || width <= 0 || height <= 0) return [];
  const ordered = photoOrder(members);
  let low = 0;
  let high = height * PHOTO_MAX_SHARE;
  for (let pass = 0; pass < 24; pass += 1) {
    const middle = (low + high) / 2;
    if (fits(layoutAt(ordered, middle, width, height), width)) low = middle;
    else high = middle;
  }
  return layoutAt(ordered, low, width, height);
}
