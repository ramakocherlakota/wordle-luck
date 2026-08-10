import { describe, expect, it } from 'vitest';
import { classifyTileColor, hue } from './colors';

/** Every tile fill NYT ships, per palette. */
const PALETTE_COLORS: [string, [number, number, number], string][] = [
  ['light correct', [106, 170, 100], 'b'],
  ['light present', [201, 180, 88], 'w'],
  ['light absent', [120, 124, 126], '-'],
  ['dark correct', [83, 141, 78], 'b'],
  ['dark present', [181, 159, 59], 'w'],
  ['dark absent', [58, 58, 60], '-'],
  ['high-contrast correct', [245, 121, 58], 'b'],
  ['high-contrast present', [133, 192, 249], 'w'],
];

describe('classifyTileColor', () => {
  it.each(PALETTE_COLORS)('reads %s', (_name, [r, g, b], expected) => {
    expect(classifyTileColor(r, g, b)).toBe(expected);
  });

  it('still reads a tile after compression shifts its color', () => {
    // ±8 per channel, roughly what JPEG does to a flat area.
    expect(classifyTileColor(98, 178, 92)).toBe('b');
    expect(classifyTileColor(209, 172, 96)).toBe('w');
    expect(classifyTileColor(112, 132, 118)).toBe('-');
  });

  it('rejects backgrounds, unplayed tiles, and letters', () => {
    expect(classifyTileColor(255, 255, 255)).toBeNull(); // light page
    expect(classifyTileColor(18, 18, 19)).toBeNull(); // dark page
    expect(classifyTileColor(211, 214, 218)).toBeNull(); // unplayed tile border
    expect(classifyTileColor(255, 255, 255)).toBeNull(); // white letter pixel
  });

  it('rejects colors outside the palette', () => {
    expect(classifyTileColor(220, 40, 40)).toBeNull(); // red
    expect(classifyTileColor(150, 40, 210)).toBeNull(); // purple
  });

  it('separates the yellow and high-contrast-orange hues', () => {
    expect(hue(201, 180, 88)).toBeGreaterThan(40);
    expect(hue(245, 121, 58)).toBeLessThan(30);
  });
});
