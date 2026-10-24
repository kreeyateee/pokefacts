/**
 * Where things go on a colouring sheet, in millimetres: the Pokémon in a grid on one A4 page, and the
 * same sheet blown up across several A4 pages to tape together into a poster.
 */

export const A4_MM = { width: 210, height: 297 } as const;

/** How many Pokémon share a page. */
export const PER_PAGE = [1, 2, 4, 6] as const;
export type PerPage = (typeof PER_PAGE)[number];

/** Pages across and down for a poster: 1 is a plain A4 sheet. */
export const POSTER_SIZES = [1, 2, 3, 4] as const;
export type PosterSize = (typeof POSTER_SIZES)[number];

export type Box = { x: number; y: number; width: number; height: number };

/** Columns and rows for each number of Pokémon on a portrait page. */
const GRIDS: Record<PerPage, { columns: number; rows: number }> = {
  1: { columns: 1, rows: 1 },
  2: { columns: 1, rows: 2 },
  4: { columns: 2, rows: 2 },
  6: { columns: 2, rows: 3 },
};

/** Space above the grid for the title, and below it for the footer. */
const TITLE_MM = 34;
const FOOTER_MM = 22;
const SIDE_MM = 12;
const GAP_MM = 6;
/** Room under each picture for the Pokémon's name. */
export const NAME_MM = 9;

/** The picture box for each Pokémon on a page, in reading order. Each is square, with its name under it. */
export function sheetCells(perPage: PerPage, page = A4_MM): Box[] {
  const { columns, rows } = GRIDS[perPage];
  const areaWidth = page.width - SIDE_MM * 2;
  const areaHeight = page.height - TITLE_MM - FOOTER_MM;
  const cellWidth = (areaWidth - GAP_MM * (columns - 1)) / columns;
  const cellHeight = (areaHeight - GAP_MM * (rows - 1)) / rows;
  // Square pictures, with the name under each one.
  const side = Math.min(cellWidth, cellHeight - (perPage === 1 ? 0 : NAME_MM));
  const boxes: Box[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = SIDE_MM + column * (cellWidth + GAP_MM) + (cellWidth - side) / 2;
      const y = TITLE_MM + row * (cellHeight + GAP_MM) + (cellHeight - side - (perPage === 1 ? 0 : NAME_MM)) / 2;
      boxes.push({ x, y, width: side, height: side });
    }
  }
  return boxes;
}

/** Splits the picks into pages of `perPage`. */
export function pagesOf<T>(items: readonly T[], perPage: PerPage): T[][] {
  const pages: T[][] = [];
  for (let at = 0; at < items.length; at += perPage) pages.push(items.slice(at, at + perPage));
  return pages;
}

/** The blank border a home printer can't reach. Poster pages overlap by this much so nothing is lost. */
export const PRINTER_MARGIN_MM = 6;

/** One A4 page of a poster: which part of the enlarged sheet it shows, and where it sits. */
export type PosterTile = {
  column: number;
  row: number;
  /** The part of the original sheet on this page, in the sheet's millimetres. */
  source: Box;
  /** The scale from the sheet to the paper. */
  scale: number;
};

/**
 * The pages of an `across` × `across` poster. The sheet is enlarged `across` times, and each page shows
 * its share of it inside the printer margins, so the printed parts butt together when the white borders
 * are trimmed off.
 */
export function posterTiles(across: PosterSize, page = A4_MM): PosterTile[] {
  const printableWidth = page.width - PRINTER_MARGIN_MM * 2;
  const printableHeight = page.height - PRINTER_MARGIN_MM * 2;
  // The whole sheet must fit the printable parts laid side by side.
  const scale = Math.min((printableWidth * across) / page.width, (printableHeight * across) / page.height);
  const tiles: PosterTile[] = [];
  for (let row = 0; row < across; row += 1) {
    for (let column = 0; column < across; column += 1) {
      tiles.push({
        column,
        row,
        scale,
        source: {
          x: (column * printableWidth) / scale,
          y: (row * printableHeight) / scale,
          width: printableWidth / scale,
          height: printableHeight / scale,
        },
      });
    }
  }
  return tiles;
}
