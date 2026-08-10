/**
 * Reading the letter out of a tile.
 *
 * Every played tile is a white letter on a solid fill, so the letter separates
 * cleanly by lightness — no thresholding heuristics needed. The cut-out is
 * normalized to a small fixed bitmap and compared against the alphabet rendered
 * in a bold sans-serif on a canvas.
 *
 * Matching does not have to be right. It only has to rank the 26 letters
 * sensibly: `solve.ts` turns those rankings into words using the word lists and
 * the tile colors, which is what actually decides the answer.
 */

import { luma } from './colors';
import type { Tile } from './grid';
import { type RgbaImage } from './image';

/**
 * Normalized glyphs are GLYPH_SIZE² coverage values in 0–1, row-major. Big
 * enough that a detail like the foot of an `E` — all that separates it from an
 * `F` — survives the blur below as several rows rather than one.
 */
export const GLYPH_SIZE = 24;
export type GlyphBitmap = Float32Array;

/** Templates for one letter, rendered in several fonts. */
export type LetterTemplates = GlyphBitmap[][];

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Wordle sets its board in nyt-franklin, a Franklin Gothic. Nobody else has it,
 * so approximate with the widest-available bold grotesques and keep the best
 * match of the set — the letters differ far more from each other than these
 * faces differ from Franklin.
 */
const TEMPLATE_FONTS = [
  'Helvetica, Arial, sans-serif',
  '"Helvetica Neue", "Segoe UI", Roboto, sans-serif',
];

/** Fraction trimmed off each side of a tile before looking for the letter. */
const TILE_INSET = 0.1;

/** A tile whose ink covers less than this is treated as blank (no letter). */
const MIN_INK_FRACTION = 0.01;

/**
 * Cut the letter out of one tile as a coverage mask.
 *
 * The fill color is measured from the ring just inside the tile's edge, which
 * the letter never reaches; each pixel's coverage is then how far it lies from
 * that fill towards white. Returns `null` for a tile with no letter in it — a
 * shared emoji grid lands here.
 */
export function extractGlyph(img: RgbaImage, tile: Tile): GlyphBitmap | null {
  const inset = Math.round(
    Math.min(tile.x1 - tile.x0, tile.y1 - tile.y0) * TILE_INSET,
  );
  const x0 = Math.max(0, tile.x0 + inset);
  const y0 = Math.max(0, tile.y0 + inset);
  const x1 = Math.min(img.width - 1, tile.x1 - inset);
  const y1 = Math.min(img.height - 1, tile.y1 - inset);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 4 || h < 4) return null;

  // Fill lightness: the mean of the one-pixel ring around the inset box.
  let ringSum = 0;
  let ringCount = 0;
  for (let x = x0; x <= x1; x++) {
    for (const y of [y0, y1]) {
      const i = (y * img.width + x) * 4;
      ringSum += luma(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
      ringCount++;
    }
  }
  for (let y = y0 + 1; y < y1; y++) {
    for (const x of [x0, x1]) {
      const i = (y * img.width + x) * 4;
      ringSum += luma(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
      ringCount++;
    }
  }
  const fill = ringSum / Math.max(1, ringCount);
  const range = 255 - fill;
  // A tile whose fill is already near-white has no readable white letter.
  if (range < 40) return null;

  const mask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * img.width + (x0 + x)) * 4;
      const value =
        (luma(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!) - fill) / range;
      mask[y * w + x] = value < 0 ? 0 : value > 1 ? 1 : value;
    }
  }

  return normalizeMask(mask, w, h);
}

/**
 * Crop a coverage mask to its ink, scale it into GLYPH_SIZE² preserving aspect,
 * and soften it. The blur is what makes matching tolerant of stroke weights and
 * of the difference between the real font and the stand-ins above.
 */
export function normalizeMask(
  mask: Float32Array,
  width: number,
  height: number,
): GlyphBitmap | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let ink = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]! < 0.5) continue;
      ink++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0 || ink < width * height * MIN_INK_FRACTION) return null;

  const boxW = x1 - x0 + 1;
  const boxH = y1 - y0 + 1;
  const inner = GLYPH_SIZE - 2;
  const scale = inner / Math.max(boxW, boxH);
  const outW = Math.max(1, Math.round(boxW * scale));
  const outH = Math.max(1, Math.round(boxH * scale));
  const offX = Math.floor((GLYPH_SIZE - outW) / 2);
  const offY = Math.floor((GLYPH_SIZE - outH) / 2);

  // Area-average each output cell over the source rect it covers.
  const out = new Float32Array(GLYPH_SIZE * GLYPH_SIZE);
  for (let oy = 0; oy < outH; oy++) {
    const sy0 = y0 + Math.floor((oy * boxH) / outH);
    // At least one source row per output row, for the upscaling case.
    const sy1 = Math.max(y0 + Math.floor(((oy + 1) * boxH) / outH), sy0 + 1);
    for (let ox = 0; ox < outW; ox++) {
      const sx0 = x0 + Math.floor((ox * boxW) / outW);
      const sx1 = Math.max(x0 + Math.floor(((ox + 1) * boxW) / outW), sx0 + 1);
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < Math.min(sy1, height); sy++) {
        for (let sx = sx0; sx < Math.min(sx1, width); sx++) {
          sum += mask[sy * width + sx]!;
          count++;
        }
      }
      out[(oy + offY) * GLYPH_SIZE + (ox + offX)] = count > 0 ? sum / count : 0;
    }
  }

  return blur(out);
}

/**
 * 3×3 Gaussian blur. Weighted rather than a flat box: enough give for differing
 * stroke weights and for the stand-in fonts, without smearing away the details
 * that separate one letter from another.
 */
const KERNEL = [1, 2, 1, 2, 4, 2, 1, 2, 1];

function blur(src: GlyphBitmap): GlyphBitmap {
  const out = new Float32Array(src.length);
  for (let y = 0; y < GLYPH_SIZE; y++) {
    for (let x = 0; x < GLYPH_SIZE; x++) {
      let sum = 0;
      let weight = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= GLYPH_SIZE) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx;
          if (sx < 0 || sx >= GLYPH_SIZE) continue;
          const k = KERNEL[(dy + 1) * 3 + (dx + 1)]!;
          sum += src[sy * GLYPH_SIZE + sx]! * k;
          weight += k;
        }
      }
      out[y * GLYPH_SIZE + x] = sum / weight;
    }
  }
  return out;
}

/** Mean absolute difference between two normalized glyphs (0 = identical). */
export function glyphDistance(a: GlyphBitmap, b: GlyphBitmap): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

/**
 * How well a glyph matches each letter of the alphabet: costs indexed a–z,
 * each the closest match across the template fonts.
 */
export function letterCosts(
  glyph: GlyphBitmap,
  templates: LetterTemplates,
): Float32Array {
  const costs = new Float32Array(ALPHABET.length);
  for (let i = 0; i < ALPHABET.length; i++) {
    let best = Infinity;
    for (const variant of templates[i] ?? []) {
      const d = glyphDistance(glyph, variant);
      if (d < best) best = d;
    }
    costs[i] = best;
  }
  return costs;
}

let cachedTemplates: LetterTemplates | null = null;

/**
 * Render A–Z to a canvas once per session and normalize them exactly like a
 * tile's letter, so the two are directly comparable.
 */
export function loadTemplates(): LetterTemplates {
  if (cachedTemplates) return cachedTemplates;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read the image (no canvas support).');

  const templates: LetterTemplates = [];
  for (const letter of ALPHABET) {
    const variants: GlyphBitmap[] = [];
    for (const font of TEMPLATE_FONTS) {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${size * 0.6}px ${font}`;
      ctx.fillText(letter.toUpperCase(), size / 2, size / 2);

      const { data } = ctx.getImageData(0, 0, size, size);
      const mask = new Float32Array(size * size);
      for (let p = 0; p < mask.length; p++) mask[p] = data[p * 4 + 3]! / 255;
      const normalized = normalizeMask(mask, size, size);
      if (normalized) variants.push(normalized);
    }
    templates.push(variants);
  }

  cachedTemplates = templates;
  return templates;
}
