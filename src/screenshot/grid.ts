/**
 * Locating the Wordle board inside a screenshot.
 *
 * Tiles are found by shape, not by colour. An earlier version matched pixels
 * against NYT's published palette and fell apart on real screenshots: the
 * high-contrast dark theme turned out to use colours that are not in any
 * palette I could account for, and the dark theme's absent grey sits a couple
 * of luma steps from the page background, so a fixed threshold either missed
 * the tiles or swallowed the page.
 *
 * So: grow regions of near-uniform colour, keep the ones shaped like tiles, and
 * let `palette.ts` work out what the colours *mean* from the board's own
 * structure. Geometry does the rejecting — the on-screen keyboard is made of
 * keys that are taller than they are wide and come in rows of 10/9/9, never in
 * a row of exactly five equal squares sharing the board's column centres.
 */

import { denoise, type RgbaImage } from './image';

/** One detected tile. Bounds are inclusive and in source-image coordinates. */
export interface Tile {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Mean fill colour, which `palette.ts` later maps to a score symbol. */
  rgb: [number, number, number];
}

/** Wordle is always five letters wide. */
export const COLUMNS = 5;

/** Work at this resolution; big enough to keep inter-tile gaps open. */
const DETECT_MAX_DIM = 1200;

/**
 * How far a pixel may stray from the colour that seeded its region, per
 * channel. Compared against the seed rather than the neighbour so a region
 * cannot creep across a soft edge one step at a time.
 *
 * Tight, because the dark theme's absent tile (#252627) is only ~17 from the
 * page behind it (#141416). The denoise pass above makes flat areas flat
 * enough for a threshold this tight to still hold a JPEG-compressed tile
 * together.
 */
const COLOR_TOLERANCE = 12;

/** Reject specks: a real tile is many pixels across even after downscaling. */
const MIN_TILE_PX = 12;

/** A tile is square; a keyboard key is about 0.74 wide-to-tall. */
const MIN_ASPECT = 0.78;
const MAX_ASPECT = 1.28;

/**
 * Share of the bounding box the region must fill. A tile loses a little to its
 * rounded corners and to the letter punched out of the middle; the hollow ring
 * of an unplayed tile's border lands far below this.
 */
const MIN_FILL = 0.55;

/** Row/column grouping tolerances, as a fraction of the median tile size. */
const ROW_TOLERANCE = 0.6;
const COLUMN_TOLERANCE = 0.6;
const SIZE_TOLERANCE = 0.3;

/**
 * Is pixel `p` within tolerance of a region's seed colour?
 *
 * Deliberately a plain module-level function rather than a closure over the
 * seed: this is called several times per pixel, and a fresh closure per region
 * turns the call site megamorphic and the whole scan an order of magnitude
 * slower.
 */
function near(
  data: Uint8ClampedArray,
  p: number,
  r: number,
  g: number,
  b: number,
): boolean {
  const i = p * 4;
  return (
    Math.abs(data[i]! - r) <= COLOR_TOLERANCE &&
    Math.abs(data[i + 1]! - g) <= COLOR_TOLERANCE &&
    Math.abs(data[i + 2]! - b) <= COLOR_TOLERANCE
  );
}

/** A region of near-uniform colour, before any judgement about its shape. */
export interface Region extends Tile {
  /** Pixels in the region, which against the bounding box gives its fill. */
  count: number;
}

/**
 * Find every plausible tile, at full-image coordinates.
 *
 * Detection runs on a downscaled, denoised copy; the boxes are scaled back up
 * so letters can later be cut from the original pixels.
 */
export function detectTiles(source: RgbaImage): Tile[] {
  return dropLetterCounters(
    detectRegions(source).filter((r) => {
      const w = r.x1 - r.x0 + 1;
      const h = r.y1 - r.y0 + 1;
      if (w < MIN_TILE_PX || h < MIN_TILE_PX) return false;
      const aspect = w / h;
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;
      return r.count / ((w * h) / (r.factor * r.factor)) >= MIN_FILL;
    }),
  );
}

/** Grow every region of near-uniform colour in the image. */
export function detectRegions(
  source: RgbaImage,
): (Region & { factor: number })[] {
  const { image, factor } = denoise(source, DETECT_MAX_DIM);
  const { width, height, data } = image;

  const regions: (Region & { factor: number })[] = [];
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);

  for (let start = 0; start < seen.length; start++) {
    if (seen[start] === 1) continue;
    const seedIndex = start * 4;
    if (data[seedIndex + 3]! < 128) {
      seen[start] = 1;
      continue;
    }
    const seedR = data[seedIndex]!;
    const seedG = data[seedIndex + 1]!;
    const seedB = data[seedIndex + 2]!;

    // Grow a region of pixels within tolerance of this seed colour, tracking
    // its bounding box, pixel count and colour sum.
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let count = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;

    while (top > 0) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      const i = p * 4;
      count++;
      sumR += data[i]!;
      sumG += data[i + 1]!;
      sumB += data[i + 2]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      if (
        x > 0 &&
        seen[p - 1] === 0 &&
        near(data, p - 1, seedR, seedG, seedB)
      ) {
        seen[p - 1] = 1;
        stack[top++] = p - 1;
      }
      if (
        x + 1 < width &&
        seen[p + 1] === 0 &&
        near(data, p + 1, seedR, seedG, seedB)
      ) {
        seen[p + 1] = 1;
        stack[top++] = p + 1;
      }
      if (
        y > 0 &&
        seen[p - width] === 0 &&
        near(data, p - width, seedR, seedG, seedB)
      ) {
        seen[p - width] = 1;
        stack[top++] = p - width;
      }
      if (
        y + 1 < height &&
        seen[p + width] === 0 &&
        near(data, p + width, seedR, seedG, seedB)
      ) {
        seen[p + width] = 1;
        stack[top++] = p + width;
      }
    }

    regions.push({
      x0: x0 * factor,
      y0: y0 * factor,
      // Inclusive bounds, so the last downscaled pixel covers a whole block.
      x1: (x1 + 1) * factor - 1,
      y1: (y1 + 1) * factor - 1,
      rgb: [
        Math.round(sumR / count),
        Math.round(sumG / count),
        Math.round(sumB / count),
      ],
      count,
      factor,
    });
  }

  return regions;
}

const area = (t: Tile) => (t.x1 - t.x0 + 1) * (t.y1 - t.y0 + 1);

/** Max per-channel difference between two colours. */
export function colorDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  );
}

/** Fraction of the smaller box that the two boxes share. */
function overlap(a: Tile, b: Tile): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(area(a), area(b));
}

/**
 * Collapse the several regions one tile can produce down to one.
 *
 * Two kinds of stowaway share a tile's colour and sit within its bounds. The
 * enclosed hole in a letter — the bowl of a `B`, `O`, `P`, `R` — is filled with
 * the tile's colour and cut off from the rest of it by the letter's stroke. And
 * a tile's own antialiased rim can survive as a thin frame around the core.
 * Either one, left in, pushes a row past five regions.
 *
 * So among same-coloured regions that cover the same ground, keep the one with
 * the most pixels. Requiring the colours to match matters: a page backdrop must
 * never be allowed to swallow the tiles it surrounds.
 */
function dropLetterCounters(regions: Region[]): Tile[] {
  const densestFirst = [...regions].sort((a, b) => b.count - a.count);
  return densestFirst.filter(
    (region, i) =>
      !densestFirst.some(
        (kept, j) =>
          j < i &&
          colorDistance(kept.rgb, region.rgb) <= COLOR_TOLERANCE * 2 &&
          overlap(kept, region) > 0.5,
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

/** Are these tiles spaced at a constant pitch, as a row of tiles must be? */
function evenlySpaced(row: Tile[]): boolean {
  const w = median(row.map(tileWidth));
  const gaps: number[] = [];
  for (let i = 1; i < row.length; i++) {
    gaps.push(centerX(row[i]!) - centerX(row[i - 1]!));
  }
  const gap = median(gaps);
  return gaps.every((v) => Math.abs(v - gap) <= w * COLUMN_TOLERANCE);
}

/**
 * Pick the five tiles that form a row out of everything found at this height,
 * or `null` if no five of them do.
 *
 * A band holds more than the row: the letters are themselves patches of one
 * colour, and a round `O` or a chunky `S` is square enough and solid enough to
 * pass every shape test a tile passes. Insisting a band hold exactly five
 * regions therefore threw away real rows.
 *
 * So look for five regions that agree on size and sit at a constant pitch, and
 * when both the tiles and the letters inside them offer such a set — which they
 * do, since there is one letter per tile — take the larger.
 */
function bestRowInBand(band: Tile[]): Tile[] | null {
  if (band.length < COLUMNS) return null;

  let best: Tile[] | null = null;
  for (const reference of band) {
    const w = tileWidth(reference);
    const h = tileHeight(reference);
    const subset = band
      .filter(
        (tile) =>
          Math.abs(tileWidth(tile) - w) <= w * SIZE_TOLERANCE &&
          Math.abs(tileHeight(tile) - h) <= h * SIZE_TOLERANCE,
      )
      .sort((p, q) => centerX(p) - centerX(q));

    if (subset.length !== COLUMNS || !evenlySpaced(subset)) continue;
    if (best === null || w > tileWidth(best[0]!)) best = subset;
  }
  return best;
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
    .map(bestRowInBand)
    .filter((row): row is Tile[] => row !== null);

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

/**
 * Find the board and read every cell of it.
 *
 * Segmentation alone is not dependable enough at the size real screenshots come
 * in — a 40px tile in a compressed JPEG sometimes splits into a rim and a core,
 * or blends into the neighbour it shares a colour with, and the tile is lost.
 * Losing tiles loses whole rows, which is what made this fail on real games.
 *
 * But the tiles that *do* come through say where the rest must be, because the
 * board is a rigid lattice: five columns, one pitch, one tile size. So use the
 * clean tiles only to fit that lattice, then read every cell straight from the
 * image at its predicted position. A tile that segmentation mangled is then
 * read anyway, from where its neighbours say it has to be.
 */
export function detectBoard(source: RgbaImage): Tile[][] {
  const tiles = detectTiles(source);
  const rows = groupIntoRows(tiles);
  if (rows.length === 0) return [];

  const columns = rows[0]!.map(centerX);
  const size = median(rows.flat().map(tileWidth));
  const half = size / 2;

  // Every band holding at least one tile of the board's own size and column —
  // including the ones segmentation could not complete into a full five.
  const bands = new Map<number, number[]>();
  for (const tile of tiles) {
    if (Math.abs(tileWidth(tile) - size) > size * SIZE_TOLERANCE) continue;
    if (
      !columns.some(
        (c) => Math.abs(centerX(tile) - c) <= size * COLUMN_TOLERANCE,
      )
    ) {
      continue;
    }
    const y = centerY(tile);
    const key = [...bands.keys()].find(
      (k) => Math.abs(k - y) <= size * ROW_TOLERANCE,
    );
    if (key === undefined) bands.set(y, [y]);
    else bands.get(key)!.push(y);
  }

  return [...bands.values()]
    .map((band) => median(band))
    .sort((a, b) => a - b)
    .map((y) =>
      columns.map((x) => {
        const box = {
          x0: Math.round(x - half),
          y0: Math.round(y - half),
          x1: Math.round(x + half),
          y1: Math.round(y + half),
        };
        return { ...box, rgb: sampleFill(source, box) };
      }),
    );
}

/**
 * The fill colour of a cell, as the per-channel median of its pixels. A median
 * rather than a mean because the letter sits in the middle of the cell: it is
 * far too small a minority to move the median, but it would tint an average.
 */
function sampleFill(
  img: RgbaImage,
  box: { x0: number; y0: number; x1: number; y1: number },
): [number, number, number] {
  const channels: number[][] = [[], [], []];
  const step = Math.max(1, Math.floor((box.x1 - box.x0) / 24));
  for (
    let y = Math.max(0, box.y0);
    y <= Math.min(img.height - 1, box.y1);
    y += step
  ) {
    for (
      let x = Math.max(0, box.x0);
      x <= Math.min(img.width - 1, box.x1);
      x += step
    ) {
      const i = (y * img.width + x) * 4;
      channels[0]!.push(img.data[i]!);
      channels[1]!.push(img.data[i + 1]!);
      channels[2]!.push(img.data[i + 2]!);
    }
  }
  return channels.map((values) => Math.round(median(values))) as [
    number,
    number,
    number,
  ];
}
