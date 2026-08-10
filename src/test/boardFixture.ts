/**
 * Synthetic Wordle screenshots for the screenshot-parsing tests.
 *
 * Paints boards pixel by pixel in any of the three NYT palettes, with letters
 * drawn from a small bitmap font, so the parsing pipeline can be exercised end
 * to end without canvas (jsdom has none) and without checking image files in.
 */

import { normalizeMask, type LetterTemplates } from '../screenshot/glyphs';
import type { RgbaImage } from '../screenshot/image';

export type Theme = 'light' | 'dark' | 'highContrast';

type Rgb = [number, number, number];

/** The real tile colors, so the fixtures test the actual classifier. */
export const PALETTES: Record<Theme, Record<'b' | 'w' | '-' | 'bg', Rgb>> = {
  light: {
    b: [106, 170, 100], // #6aaa64
    w: [201, 180, 88], // #c9b458
    '-': [120, 124, 126], // #787c7e
    bg: [255, 255, 255],
  },
  dark: {
    b: [83, 141, 78], // #538d4e
    w: [181, 159, 59], // #b59f3b
    '-': [58, 58, 60], // #3a3a3c
    bg: [18, 18, 19], // #121213
  },
  highContrast: {
    b: [245, 121, 58], // #f5793a
    w: [133, 192, 249], // #85c0f9
    '-': [58, 58, 60],
    bg: [18, 18, 19],
  },
};

/** A 5×7 bitmap font — crude, but the letters differ the way real ones do. */
export const FONT: Record<string, string[]> = {
  a: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  b: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  c: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  d: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  e: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  f: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  g: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  h: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  i: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  j: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  l: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  m: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  n: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  o: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  p: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  r: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  s: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  t: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  u: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  v: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  x: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

export interface BoardRow {
  /** The word shown in the row; `''` draws colored tiles with no letters. */
  word: string;
  /** Tile colors as a `{b,w,-}` pattern. */
  pattern: string;
}

export interface RenderOptions {
  theme?: Theme;
  /** Tile edge in pixels. */
  tile?: number;
  gap?: number;
  margin?: number;
  /** Also paint a keyboard-shaped block below the board. */
  keyboard?: boolean;
  /** Peak ±amplitude of per-pixel noise, imitating compression artifacts. */
  noise?: number;
}

function makeImage(width: number, height: number, bg: Rgb): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = bg[0];
    data[p * 4 + 1] = bg[1];
    data[p * 4 + 2] = bg[2];
    data[p * 4 + 3] = 255;
  }
  return { width, height, data };
}

function fillRect(
  img: RgbaImage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Rgb,
): void {
  for (let dy = 0; dy < h; dy++) {
    const py = y + dy;
    if (py < 0 || py >= img.height) continue;
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      if (px < 0 || px >= img.width) continue;
      const i = (py * img.width + px) * 4;
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
      img.data[i + 3] = 255;
    }
  }
}

/** Draw one letter in white, centered in the tile at `(x, y)`. */
function drawLetter(
  img: RgbaImage,
  letter: string,
  x: number,
  y: number,
  tile: number,
): void {
  const rows = FONT[letter];
  if (!rows) return;
  const scale = Math.max(1, Math.floor((tile * 0.6) / GLYPH_H));
  const originX = x + Math.round((tile - GLYPH_W * scale) / 2);
  const originY = y + Math.round((tile - GLYPH_H * scale) / 2);
  for (let r = 0; r < GLYPH_H; r++) {
    for (let c = 0; c < GLYPH_W; c++) {
      if (rows[r]![c] !== '#') continue;
      fillRect(
        img,
        originX + c * scale,
        originY + r * scale,
        scale,
        scale,
        [255, 255, 255],
      );
    }
  }
}

/** Render a board as an image the parser can be pointed at. */
export function renderBoard(
  rows: BoardRow[],
  options: RenderOptions = {},
): RgbaImage {
  const {
    theme = 'light',
    tile = 60,
    gap = 6,
    margin = 20,
    keyboard = false,
    noise = 0,
  } = options;
  const palette = PALETTES[theme];

  const boardWidth = 5 * tile + 4 * gap;
  const boardHeight = rows.length * tile + (rows.length - 1) * gap;
  const keyboardHeight = keyboard ? 3 * 58 + 2 * 8 + margin : 0;
  const img = makeImage(
    boardWidth + margin * 2,
    boardHeight + margin * 2 + keyboardHeight,
    palette.bg,
  );

  rows.forEach((row, r) => {
    const y = margin + r * (tile + gap);
    for (let c = 0; c < 5; c++) {
      const x = margin + c * (tile + gap);
      const symbol = (row.pattern[c] ?? '-') as 'b' | 'w' | '-';
      fillRect(img, x, y, tile, tile, palette[symbol]);
      const letter = row.word[c];
      if (letter) drawLetter(img, letter, x, y, tile);
    }
  });

  if (keyboard) {
    // Three rows of 10/9/9 keys, 43×58 — the shape the detector must reject.
    const top = margin * 2 + boardHeight;
    [10, 9, 9].forEach((count, r) => {
      const y = top + r * (58 + 8);
      for (let k = 0; k < count; k++) {
        const symbol = (['b', 'w', '-'] as const)[(r + k) % 3]!;
        fillRect(img, margin + k * (43 + 6), y, 43, 58, palette[symbol]);
        drawLetter(img, 'a', margin + k * (43 + 6), y - 7, 43);
      }
    });
  }

  if (noise > 0) addNoise(img, noise);
  return img;
}

/** Deterministic pseudo-random jitter, so tests stay reproducible. */
function addNoise(img: RgbaImage, amplitude: number): void {
  let seed = 12345;
  for (let p = 0; p < img.width * img.height; p++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const delta = ((seed % 1000) / 1000 - 0.5) * 2 * amplitude;
    const i = p * 4;
    img.data[i] = img.data[i]! + delta;
    img.data[i + 1] = img.data[i + 1]! + delta;
    img.data[i + 2] = img.data[i + 2]! + delta;
  }
}

/**
 * Templates built from the same bitmap font, standing in for the canvas-rendered
 * ones the app uses. Drawn at a different scale than the boards so the tests
 * still go through the normalization path.
 */
export function fontTemplates(): LetterTemplates {
  const scale = 3;
  return Object.values(FONT).map((rows) => {
    const w = GLYPH_W * scale;
    const h = GLYPH_H * scale;
    const mask = new Float32Array(w * h);
    for (let r = 0; r < GLYPH_H; r++) {
      for (let c = 0; c < GLYPH_W; c++) {
        if (rows[r]![c] !== '#') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            mask[(r * scale + dy) * w + (c * scale + dx)] = 1;
          }
        }
      }
    }
    const normalized = normalizeMask(mask, w, h);
    return normalized ? [normalized] : [];
  });
}
