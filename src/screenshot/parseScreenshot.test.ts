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
