import { describe, expect, it } from 'vitest';
import { renderBoard, type Theme } from '../test/boardFixture';
import { detectBoard, detectTiles } from './grid';

const GAME = [
  { word: 'slate', pattern: '--b-b' },
  { word: 'crane', pattern: 'bbbbb' },
];

describe('detectBoard', () => {
  it.each<Theme>(['light', 'dark', 'highContrast'])(
    'finds the grid in the %s palette',
    (theme) => {
      const rows = detectBoard(renderBoard(GAME, { theme }));
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.map((t) => t.color).join(''))).toEqual([
        '--b-b',
        'bbbbb',
      ]);
    },
  );

  it('returns rows top to bottom and tiles left to right', () => {
    const rows = detectBoard(
      renderBoard([
        { word: 'moist', pattern: 'w----' },
        { word: 'crane', pattern: 'bbbbb' },
      ]),
    );
    expect(rows[0]!.map((t) => t.color).join('')).toBe('w----');
    expect(rows[0]!.map((t) => t.x0)).toEqual(
      [...rows[0]!.map((t) => t.x0)].sort((a, b) => a - b),
    );
    expect(rows[1]![0]!.y0).toBeGreaterThan(rows[0]![0]!.y0);
  });

  it('ignores the on-screen keyboard', () => {
    const rows = detectBoard(renderBoard(GAME, { keyboard: true }));
    expect(rows).toHaveLength(2);
  });

  it('handles a large screenshot that has to be downscaled first', () => {
    const rows = detectBoard(
      renderBoard(GAME, { tile: 180, gap: 18, margin: 60 }),
    );
    expect(rows).toHaveLength(2);
    // Boxes come back in full-resolution coordinates.
    expect(rows[0]![0]!.x1 - rows[0]![0]!.x0).toBeGreaterThan(150);
  });

  it('survives compression noise', () => {
    const rows = detectBoard(renderBoard(GAME, { noise: 10 }));
    expect(rows).toHaveLength(2);
  });

  it('finds nothing in an image with no board', () => {
    expect(detectBoard(renderBoard([], { margin: 40 }))).toEqual([]);
  });

  it('rejects a band that is not five tiles wide', () => {
    // Painting out the right of the board leaves a strip of three tiles, which
    // is not a Wordle row however square they are.
    const board = renderBoard(GAME);
    const clipped = { ...board, data: whiteOut(board, 250) };
    expect(detectTiles(clipped).length).toBeGreaterThan(0);
    expect(detectBoard(clipped)).toEqual([]);
  });
});

/** Copy of the image with everything from `fromX` rightwards painted white. */
function whiteOut(
  img: { width: number; height: number; data: Uint8ClampedArray },
  fromX: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(img.data);
  for (let y = 0; y < img.height; y++) {
    for (let x = fromX; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  return data;
}
