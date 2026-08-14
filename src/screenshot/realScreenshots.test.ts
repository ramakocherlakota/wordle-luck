/**
 * Regression tests over real phone screenshots, checked in under `test-pix/`.
 *
 * Everything else in this directory is tested against boards painted by
 * `boardFixture.ts`, which is fast and lets a test say exactly what it is about
 * — but a synthetic board only contains what I already knew to put in it, and
 * every serious break so far came from something I did not: an unaccounted-for
 * palette, JPEG ringing around a 40px tile, black letters and white letters on
 * the same board, the browser chrome around the game.
 *
 * So these go the other way. One real game — `trice, salon, whump, spine,
 * snipe` — screenshotted on a phone in all four combinations of Wordle's dark
 * and high-contrast settings, parsed whole, from the same bytes the app would
 * get. They assert the outcome and nothing about how it is reached, so they
 * should survive any amount of rework of the pipeline; if one of them goes red,
 * the app has stopped reading a screenshot it used to read.
 */

import { describe, expect, it } from 'vitest';
import { scoreGuess } from '../score';
import { fontTemplates } from '../test/boardFixture';
import { loadScreenshot } from '../test/screenshotFile';
import { COLUMNS, detectBoard } from './grid';
import { parseBoardImage, type ParsedScreenshot } from './parseScreenshot';

/**
 * The stand-in alphabet from `boardFixture`, because the app's own templates are
 * rendered on a canvas and jsdom has none. Letter matching is therefore *harder*
 * here than in the browser, not easier: these are crude 5×7 bitmaps being
 * matched against real antialiased Franklin Gothic.
 */
const TEMPLATES = fontTemplates();

/** The directory is named for the game it holds, in the order it was played. */
const GAME = 'trice-salon-whump-spine-snipe';
const GUESSES = GAME.split('-');
const TARGET = GUESSES[GUESSES.length - 1]!;

/** What the tiles must come out as, by the real rules rather than by eye. */
const PATTERNS = GUESSES.map((guess) => scoreGuess(guess, TARGET));

interface Screenshot {
  /** How the game was set when this one was taken. */
  theme: string;
  file: string;
  /**
   * Guesses actually visible in the image. All of them, unless something is in
   * the way — see the dark screenshot below.
   */
  rows?: number;
}

const SCREENSHOTS: Screenshot[] = [
  { theme: 'the default light theme', file: 'not-high-contrast-not-dark' },
  { theme: 'the light high-contrast theme', file: 'high-contrast-not-dark' },
  { theme: 'the dark high-contrast theme', file: 'high-contrast-dark' },
  {
    // This one was taken with the settings sheet still open over the board, so
    // only the first three rows are on screen and the game reads as unfinished.
    // Left as it is on purpose: a board can be cut off by a sheet, a keyboard or
    // the edge of the screen, and reading the rows that *are* there beats
    // refusing the whole image.
    theme: 'the dark theme, with the settings sheet covering the lower rows',
    file: 'not-high-contrast-dark',
    rows: 3,
  },
];

/** Decoding and parsing are the slow part, so each image goes through once. */
const parses = new Map<string, ParsedScreenshot>();

function parse(file: string): ParsedScreenshot {
  const cached = parses.get(file);
  if (cached) return cached;
  const result = parseBoardImage(loadScreenshot(`${GAME}/${file}`), {
    templates: TEMPLATES,
  });
  parses.set(file, result);
  return result;
}

describe.each(SCREENSHOTS)('a screenshot of $theme', (shot) => {
  const visible = shot.rows ?? GUESSES.length;
  const solved = visible === GUESSES.length;

  it('finds the board as a lattice of square, aligned tiles', () => {
    const rows = detectBoard(loadScreenshot(`${GAME}/${shot.file}`));
    // The unplayed row below a finished game is found too, and dropped later
    // for having no letters on it.
    expect(rows.length).toBeGreaterThanOrEqual(visible);

    const first = rows[0]!;
    const size = first[0]!.x1 - first[0]!.x0 + 1;
    // A real tile here is ~41px; well clear of the 12px floor on a stray speck.
    expect(size).toBeGreaterThan(20);
    for (const row of rows) {
      expect(row).toHaveLength(COLUMNS);
      row.forEach((tile, column) => {
        expect(tile.x1 - tile.x0 + 1).toBe(size);
        expect(tile.y1 - tile.y0 + 1).toBe(size);
        // Columns line up down the board, whatever the row.
        expect(tile.x0).toBe(first[column]!.x0);
      });
    }
  });

  it('reads the tile colours as the right scores', () => {
    expect(parse(shot.file).patterns).toEqual(PATTERNS.slice(0, visible));
  });

  it('reads the letters back as the words that were played', () => {
    const result = parse(shot.file);
    expect(result.guesses).toEqual(GUESSES.slice(0, visible));
    expect(result.unresolved).toEqual([]);
    // Without the winning row there is nothing to say what the answer was.
    expect(result.target).toBe(solved ? TARGET : '');
  });
});

describe('across themes', () => {
  it('reads the same game whatever the palette', () => {
    const games = SCREENSHOTS.filter((shot) => shot.rows === undefined).map(
      (shot) => parse(shot.file),
    );

    // Three palettes with nothing in common — grey/green/yellow, orange/blue on
    // grey, and blue/brown on *light* grey with dark letters — and the parse has
    // to land in the same place regardless.
    expect(games).toHaveLength(3);
    for (const game of games) {
      expect({ guesses: game.guesses, patterns: game.patterns }).toEqual({
        guesses: GUESSES,
        patterns: PATTERNS,
      });
    }
  });
});
