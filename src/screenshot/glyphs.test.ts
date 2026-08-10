import { describe, expect, it } from 'vitest';
import { fontTemplates, renderBoard, type Theme } from '../test/boardFixture';
import {
  ALPHABET,
  extractGlyph,
  glyphDistance,
  GLYPH_SIZE,
  letterCosts,
  normalizeMask,
} from './glyphs';
import { detectBoard } from './grid';

/** A filled rectangle of `w`×`h` inside a `size`×`size` mask, top-left at 1,1. */
function boxMask(size: number, w: number, h: number): Float32Array {
  const mask = new Float32Array(size * size);
  for (let y = 1; y <= h; y++) {
    for (let x = 1; x <= w; x++) mask[y * size + x] = 1;
  }
  return mask;
}

const TEMPLATES = fontTemplates();

/** The letter whose template best matches a glyph. */
function bestLetter(costs: Float32Array): string {
  let best = 0;
  for (let i = 1; i < costs.length; i++) if (costs[i]! < costs[best]!) best = i;
  return ALPHABET[best]!;
}

describe('normalizeMask', () => {
  it('is blind to the size of the source', () => {
    const small = normalizeMask(boxMask(20, 6, 9), 20, 20)!;
    const large = normalizeMask(boxMask(200, 60, 90), 200, 200)!;
    expect(glyphDistance(small, large)).toBeLessThan(0.05);
  });

  it('is blind to where in the source the ink sits', () => {
    const size = 40;
    const left = boxMask(size, 8, 12);
    const shifted = new Float32Array(size * size);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 8; x++) shifted[(y + 20) * size + (x + 25)] = 1;
    }
    expect(
      glyphDistance(
        normalizeMask(left, size, size)!,
        normalizeMask(shifted, size, size)!,
      ),
    ).toBe(0);
  });

  it('produces a GLYPH_SIZE² bitmap', () => {
    expect(normalizeMask(boxMask(20, 6, 9), 20, 20)).toHaveLength(
      GLYPH_SIZE * GLYPH_SIZE,
    );
  });

  it('returns null for a mask with no ink', () => {
    expect(normalizeMask(new Float32Array(400), 20, 20)).toBeNull();
  });
});

describe('extractGlyph', () => {
  it.each<Theme>(['light', 'dark', 'highContrast'])(
    'reads every letter of a row in the %s palette',
    (theme) => {
      const image = renderBoard([{ word: 'vodka', pattern: 'bw-w-' }], {
        theme,
      });
      const tiles = detectBoard(image)[0]!;
      const read = tiles
        .map((tile) => extractGlyph(image, tile)!)
        .map((glyph) => bestLetter(letterCosts(glyph, TEMPLATES)))
        .join('');
      expect(read).toBe('vodka');
    },
  );

  it('reads letters through compression noise', () => {
    const image = renderBoard([{ word: 'pixel', pattern: 'b-w--' }], {
      noise: 12,
    });
    const tiles = detectBoard(image)[0]!;
    const read = tiles
      .map((tile) => extractGlyph(image, tile)!)
      .map((glyph) => bestLetter(letterCosts(glyph, TEMPLATES)))
      .join('');
    expect(read).toBe('pixel');
  });

  it('returns null for a tile with no letter on it', () => {
    // The shared results grid: colored squares, nothing written on them.
    const image = renderBoard([{ word: '', pattern: 'bw-w-' }]);
    const tiles = detectBoard(image)[0]!;
    expect(tiles.map((tile) => extractGlyph(image, tile))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('letterCosts', () => {
  it('scores the letter that was drawn lowest, and by a clear margin', () => {
    const image = renderBoard([{ word: 'fjord', pattern: 'bbbbb' }]);
    const tiles = detectBoard(image)[0]!;
    const costs = letterCosts(extractGlyph(image, tiles[0]!)!, TEMPLATES);
    const sorted = [...costs].sort((a, b) => a - b);
    expect(costs[ALPHABET.indexOf('f')]).toBe(sorted[0]);
    expect(sorted[1]! - sorted[0]!).toBeGreaterThan(0.01);
  });
});
