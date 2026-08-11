import { describe, expect, it } from 'vitest';
import { scoreGuess } from '../score';
import {
  fontTemplates,
  renderBoard,
  type BoardRow,
  type RenderOptions,
} from '../test/boardFixture';
import { parseBoardImage, ScreenshotParseError } from './parseScreenshot';

const TEMPLATES = fontTemplates();

/** A finished game, with each row's colors derived from the real rules. */
function game(target: string, guesses: string[]): BoardRow[] {
  return guesses.map((word) => ({ word, pattern: scoreGuess(word, target) }));
}

function parse(rows: BoardRow[], options?: RenderOptions) {
  return parseBoardImage(renderBoard(rows, options), { templates: TEMPLATES });
}

const CRANE = game('crane', ['adieu', 'moist', 'brine', 'crane']);

describe('parseBoardImage', () => {
  it('reads a finished game against the real word lists', () => {
    const result = parse(CRANE);
    expect(result.target).toBe('crane');
    expect(result.guesses).toEqual(['adieu', 'moist', 'brine', 'crane']);
    expect(result.unresolved).toEqual([]);
    expect(result.patterns).toEqual(['w--w-', '-----', '-b-bb', 'bbbbb']);
  });

  it('reads a dark-theme screenshot with compression noise', () => {
    const result = parse(game('pluck', ['snout', 'tribe', 'pluck']), {
      theme: 'dark',
      noise: 10,
      keyboard: true,
    });
    expect(result.target).toBe('pluck');
    expect(result.guesses).toEqual(['snout', 'tribe', 'pluck']);
  });

  it('reads a high-contrast screenshot at phone resolution', () => {
    const result = parse(CRANE, {
      theme: 'highContrast',
      tile: 62,
      gap: 5,
      margin: 90,
    });
    expect(result.target).toBe('crane');
    expect(result.guesses).toEqual(['adieu', 'moist', 'brine', 'crane']);
  });

  it('leaves the target empty for a game that was never solved', () => {
    const result = parse(game('crane', ['adieu', 'moist', 'brine']));
    expect(result.target).toBe('');
    expect(result.guesses).toEqual(['adieu', 'moist', 'brine']);
  });

  // The four cases below are the ones real phone screenshots broke on; each
  // stands for a lesson the synthetic boards had not been teaching.
  it('reads a palette it has never been told about', () => {
    // High-contrast dark: blue means correct and brown means present, the
    // reverse of the hue order the light high-contrast theme uses. Nothing may
    // depend on knowing that in advance.
    const result = parse(CRANE, { theme: 'highContrastDark' });
    expect(result.target).toBe('crane');
    expect(result.guesses).toEqual(['adieu', 'moist', 'brine', 'crane']);
  });

  it('reads dark letters on light tiles as well as light on dark', () => {
    // The same palette prints black letters on its light absent tiles and
    // white ones on its blue and brown tiles — on the same board.
    const result = parse(game('vodka', ['snout', 'vodka']), {
      theme: 'highContrastDark',
    });
    expect(result.guesses).toEqual(['snout', 'vodka']);
  });

  it('ignores the unplayed rows below a finished game', () => {
    const result = parse(game('pluck', ['snout', 'pluck']), {
      unplayedRows: 4,
    });
    expect(result.patterns).toHaveLength(2);
    expect(result.guesses).toEqual(['snout', 'pluck']);
  });

  it('reads a board at the size a phone screenshot actually arrives in', () => {
    // Real screenshots came in at 296×640 with 40px tiles — a quarter the size
    // everything here had been tested at.
    const result = parse(CRANE, { tile: 40, gap: 4, margin: 14 });
    expect(result.target).toBe('crane');
    expect(result.guesses).toEqual(['adieu', 'moist', 'brine', 'crane']);
  });

  it('explains that a shared results grid has no letters in it', () => {
    const emoji = CRANE.map((row) => ({ ...row, word: '' }));
    expect(() => parse(emoji)).toThrow(ScreenshotParseError);
    expect(() => parse(emoji)).toThrow(/shared results grid/);
  });

  it('explains when there is no board in the image at all', () => {
    expect(() => parse([], { margin: 60 })).toThrow(
      /Couldn't find a Wordle board/,
    );
  });
});
