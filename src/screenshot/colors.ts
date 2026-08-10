/**
 * Tile-color classification for Wordle screenshots.
 *
 * NYT ships three palettes — light, dark, and high contrast — and a screenshot
 * has usually been resized, re-encoded, or color-managed on the way to us, so
 * exact hex matching is hopeless. Classify by hue and chroma instead; the three
 * palettes' colors are far apart in hue:
 *
 *   correct  #6aaa64 / #538d4e (green, ~115°)   high contrast #f5793a (~20°)
 *   present  #c9b458 / #b59f3b (yellow, ~49°)   high contrast #85c0f9 (~210°)
 *   absent   #787c7e / #3a3a3c (grey, no hue — identified by lightness)
 *
 * Results use the same `{b,w,-}` alphabet as the backend's scores
 * (see contracts/wordle-svc.md), so a detected row *is* a score string.
 */

/** b = correct spot, w = present/wrong spot, - = absent. */
export type TileColor = 'b' | 'w' | '-';

/** Below this max−min spread a pixel reads as grey rather than colored. */
const MIN_CHROMA = 28;

/**
 * Lightness window for an absent (grey) tile. Below it lies the dark-theme page
 * background (#121213, ~18); above it lie unplayed tiles, which are the page
 * background in light mode (255) drawn with a #d3d6da border (~214).
 */
const ABSENT_MIN_LUMA = 34;
const ABSENT_MAX_LUMA = 178;

/** Rec. 709 relative luminance, 0–255. */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Hue in degrees (0–360). Only meaningful when chroma is non-zero. */
export function hue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / chroma) % 6;
  else if (max === g) h = (b - r) / chroma + 2;
  else h = (r - g) / chroma + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Classify one pixel as a played tile's fill color, or `null` for anything that
 * is not one — page background, unplayed tiles, white letter pixels, chrome.
 */
export function classifyTileColor(
  r: number,
  g: number,
  b: number,
): TileColor | null {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);

  if (chroma < MIN_CHROMA) {
    const l = luma(r, g, b);
    return l >= ABSENT_MIN_LUMA && l <= ABSENT_MAX_LUMA ? '-' : null;
  }

  const h = hue(r, g, b);
  if (h >= 10 && h < 35) return 'b'; // high-contrast orange
  if (h >= 35 && h < 78) return 'w'; // yellow
  if (h >= 78 && h < 172) return 'b'; // green
  if (h >= 172 && h < 258) return 'w'; // high-contrast blue
  return null;
}
