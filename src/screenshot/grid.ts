/**
 * Locating the Wordle board inside a screenshot.
 *
 * Tiles are found as connected runs of a single palette color, then filtered
 * geometrically. The filters exist mostly to reject the on-screen keyboard,
 * which after a few guesses is full of the exact same green/yellow/grey keys:
 * keys are taller than they are wide, and they come in rows of 10/9/9 — never
 * in a row of exactly five equal squares sharing the board's column centers.
 */

import { classifyTileColor, type TileColor } from './colors';
import { downscale, type RgbaImage } from './image';

/** One detected tile. Bounds are inclusive and in source-image coordinates. */
export interface Tile {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: TileColor;
}

/** Wordle is always five letters wide. */
export const COLUMNS = 5;

/** Work at this resolution; big enough to keep inter-tile gaps open. */
const DETECT_MAX_DIM = 1200;

/** Reject specks: a real tile is many pixels across even after downscaling. */
const MIN_TILE_PX = 12;

/** A tile is square; a keyboard key is about 0.74 wide-to-tall. */
const MIN_ASPECT = 0.78;
const MAX_ASPECT = 1.28;

/**
 * Share of the bounding box that must be tile-colored. A filled tile loses a
 * little to its rounded corners and to the white letter punched out of the
 * middle; a hollow unplayed tile (dark theme draws its border in the same grey
 * as an absent tile) is almost all hole and lands far below this.
 */
const MIN_FILL = 0.55;

/** Row/column grouping tolerances, as a fraction of the median tile size. */
const ROW_TOLERANCE = 0.6;
const COLUMN_TOLERANCE = 0.6;
const SIZE_TOLERANCE = 0.3;

/**
 * Find every plausible tile, at full-image coordinates.
 *
 * Detection runs on a downscaled copy — cheaper, and the box averaging softens
 * compression noise — and the boxes are scaled back up so that letters can
 * later be cut from the original pixels.
 */
export function detectTiles(source: RgbaImage): Tile[] {
  const { image, factor } = downscale(source, DETECT_MAX_DIM);
  const { width, height, data } = image;

  // Palette class per pixel: 0 = not a tile color, else index into CLASSES.
  const CLASSES: TileColor[] = ['b', 'w', '-'];
  const classMap = new Uint8Array(width * height);
  for (let p = 0; p < classMap.length; p++) {
    const i = p * 4;
    if (data[i + 3]! < 128) continue; // transparent
    const color = classifyTileColor(data[i]!, data[i + 1]!, data[i + 2]!);
    if (color !== null) classMap[p] = CLASSES.indexOf(color) + 1;
  }

  const tiles: Tile[] = [];
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);

  for (let start = 0; start < classMap.length; start++) {
    const cls = classMap[start]!;
    if (cls === 0 || seen[start] === 1) continue;

    // Flood fill this component (4-connected, same palette class), tracking
    // its bounding box and pixel count.
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let count = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;

    while (top > 0) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      if (x > 0 && classMap[p - 1] === cls && seen[p - 1] === 0) {
        seen[p - 1] = 1;
        stack[top++] = p - 1;
      }
      if (x + 1 < width && classMap[p + 1] === cls && seen[p + 1] === 0) {
        seen[p + 1] = 1;
        stack[top++] = p + 1;
      }
      if (y > 0 && classMap[p - width] === cls && seen[p - width] === 0) {
        seen[p - width] = 1;
        stack[top++] = p - width;
      }
      if (
        y + 1 < height &&
        classMap[p + width] === cls &&
        seen[p + width] === 0
      ) {
        seen[p + width] = 1;
        stack[top++] = p + width;
      }
    }

    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w < MIN_TILE_PX || h < MIN_TILE_PX) continue;
    const aspect = w / h;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
    if (count / (w * h) < MIN_FILL) continue;

    tiles.push({
      x0: x0 * factor,
      y0: y0 * factor,
      // Inclusive bounds, so the last downscaled pixel covers a whole block.
      x1: (x1 + 1) * factor - 1,
      y1: (y1 + 1) * factor - 1,
      color: CLASSES[cls - 1]!,
    });
  }

  return dropLetterCounters(tiles);
}

/** Area of a tile's bounding box. */
const area = (t: Tile) => (t.x1 - t.x0 + 1) * (t.y1 - t.y0 + 1);

/**
 * Drop the enclosed holes in letters — the bowl of a `B`, `O`, `P`, `R`.
 *
 * They are tile-colored, the white stroke cuts them off from the rest of the
 * tile, and a fat font makes them big and square enough to pass for tiles of
 * their own. Left in, they push a row to six components and the row is thrown
 * away as not being five wide.
 *
 * A hole always sits inside its own tile and shares its color, so that is the
 * test. Requiring the same color matters: a screenshot whose backdrop happens
 * to classify as grey must not be allowed to swallow the tiles it surrounds.
 */
function dropLetterCounters(tiles: Tile[]): Tile[] {
  const largestFirst = [...tiles].sort((a, b) => area(b) - area(a));
  return largestFirst.filter(
    (tile, i) =>
      !largestFirst.some(
        (outer, j) =>
          j < i &&
          outer.color === tile.color &&
          area(tile) <= area(outer) / 2 &&
          tile.x0 >= outer.x0 &&
          tile.x1 <= outer.x1 &&
          tile.y0 >= outer.y0 &&
          tile.y1 <= outer.y1,
      ),
  );
}

const centerX = (t: Tile) => (t.x0 + t.x1) / 2;
const centerY = (t: Tile) => (t.y0 + t.y1) / 2;
const tileWidth = (t: Tile) => t.x1 - t.x0 + 1;
const tileHeight = (t: Tile) => t.y1 - t.y0 + 1;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Assemble tiles into board rows, top to bottom.
 *
 * Candidate rows are bands of tiles at the same height holding exactly five
 * squares; the winning board is then the largest set of those rows that agree
 * on tile size and column positions, which drops any lookalike row elsewhere in
 * the screenshot. Returns `[]` when nothing looks like a board.
 */
export function groupIntoRows(tiles: Tile[]): Tile[][] {
  if (tiles.length < COLUMNS) return [];

  const unitHeight = median(tiles.map(tileHeight));
  const byY = [...tiles].sort((a, b) => centerY(a) - centerY(b));

  const bands: Tile[][] = [];
  let band: Tile[] = [];
  let bandY = 0;
  for (const tile of byY) {
    if (
      band.length > 0 &&
      Math.abs(centerY(tile) - bandY) > unitHeight * ROW_TOLERANCE
    ) {
      bands.push(band);
      band = [];
    }
    band.push(tile);
    bandY = median(band.map(centerY));
  }
  if (band.length > 0) bands.push(band);

  const candidates = bands
    .filter((b) => b.length === COLUMNS)
    .map((b) => [...b].sort((p, q) => centerX(p) - centerX(q)))
    // Within a row the tiles must be the same size and evenly spaced.
    .filter((b) => {
      const widths = b.map(tileWidth);
      const w = median(widths);
      if (widths.some((v) => Math.abs(v - w) > w * SIZE_TOLERANCE))
        return false;
      const gaps: number[] = [];
      for (let i = 1; i < b.length; i++)
        gaps.push(centerX(b[i]!) - centerX(b[i - 1]!));
      const gap = median(gaps);
      return gaps.every((v) => Math.abs(v - gap) <= w * COLUMN_TOLERANCE);
    });

  if (candidates.length === 0) return [];

  // Keep the rows that share the dominant geometry. Rows are compared against
  // each candidate's own geometry in turn, and the biggest agreeing set wins.
  let best: Tile[][] = [];
  for (const reference of candidates) {
    const refWidth = median(reference.map(tileWidth));
    const refColumns = reference.map(centerX);
    const agreeing = candidates.filter((row) => {
      const w = median(row.map(tileWidth));
      if (Math.abs(w - refWidth) > refWidth * SIZE_TOLERANCE) return false;
      return row.every(
        (tile, i) =>
          Math.abs(centerX(tile) - refColumns[i]!) <=
          refWidth * COLUMN_TOLERANCE,
      );
    });
    if (agreeing.length > best.length) best = agreeing;
  }

  return best.sort((a, b) => centerY(a[0]!) - centerY(b[0]!));
}

/** Detect tiles and assemble them into board rows in one step. */
export function detectBoard(source: RgbaImage): Tile[][] {
  return groupIntoRows(detectTiles(source));
}
